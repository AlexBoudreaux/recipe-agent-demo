"use client";

import { useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  RotateCwIcon,
  ListChecksIcon,
  ShoppingCartIcon,
  AlertTriangleIcon,
  SparklesIcon,
  UsersIcon,
  ScaleIcon,
  HistoryIcon,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { measureLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PlanControls } from "@/lib/act3";
import type { PlanConflictItem } from "@/lib/artifact-types";

/**
 * The built-plan view (PRD stories 34-42). Renders a saved, versioned MenuPlan:
 * per-recipe steps (with the chef's chosen techniques visibly woven in), the
 * consolidated ingredient list, and the shopping list grouped by store area —
 * all reflecting the chosen servings + unit system. The numbers came from
 * deterministic math (UnitConverter + IngredientConsolidator); this view only
 * displays them.
 *
 * The plan is read REACTIVELY from Convex (latest version, or a specific version
 * when reopening a snapshot), so a regenerate that writes a new version updates
 * the view on its own. Conflicts aren't persisted, so a freshly-flagged conflict
 * is passed in from the agent's tool output and surfaced as a banner the chef
 * must resolve.
 */
export function MenuPlanView({
  menuId,
  planId,
  conflicts,
  controls,
  onBack,
  onViewVersion,
}: {
  menuId: string;
  /** A specific version to show, or undefined for the latest. */
  planId?: string;
  /** Conflicts from the most recent build (not persisted), or empty. */
  conflicts: PlanConflictItem[];
  controls: PlanControls;
  onBack: () => void;
  onViewVersion: (planId: string | undefined) => void;
}) {
  const latest = useQuery(
    api.menuPlans.getLatestMenuPlan,
    planId ? "skip" : { menuId: menuId as Id<"menus"> },
  );
  const specific = useQuery(
    api.menuPlans.getMenuPlan,
    planId ? { planId: planId as Id<"menuPlans"> } : "skip",
  );
  const versions = useQuery(api.menuPlans.listMenuPlans, {
    menuId: menuId as Id<"menus">,
  });

  const plan = planId ? specific : latest;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-6 py-8">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to menu
        </button>
        <button
          type="button"
          disabled={controls.busy || !plan}
          onClick={() => plan && controls.generatePlan(plan.servings)}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-brand-foreground shadow-sm transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          <RotateCwIcon className="size-3.5" />
          Regenerate
        </button>
      </div>

      {plan === undefined ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : plan === null ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No plan generated yet. Choose your techniques on the menu, then generate
          one.
        </p>
      ) : (
        <>
          {/* Title + chosen settings */}
          <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold tracking-tight">
                Cooking plan
              </h2>
              <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand">
                Version {plan.version}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                <UsersIcon className="size-3.5" />
                Serves {plan.servings}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 capitalize text-muted-foreground">
                <ScaleIcon className="size-3.5" />
                {plan.unitSystem} units
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                <SparklesIcon className="size-3.5" />
                {plan.appliedTechniques.length}{" "}
                {plan.appliedTechniques.length === 1 ? "technique" : "techniques"}{" "}
                applied
              </span>
            </div>

            {/* Version history (story 42) */}
            {versions && versions.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <HistoryIcon className="size-3.5 text-muted-foreground" />
                {versions.map((vDoc) => {
                  const active = vDoc._id === plan._id;
                  const isLatest = vDoc._id === versions[0]._id;
                  return (
                    <button
                      key={vDoc._id}
                      type="button"
                      onClick={() =>
                        onViewVersion(isLatest ? undefined : vDoc._id)
                      }
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                        active
                          ? "border-brand bg-brand/10 text-brand"
                          : "bg-card text-muted-foreground hover:bg-accent",
                      )}
                    >
                      v{vDoc.version}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Conflict banner — never silently proceed (story 33). */}
          {conflicts.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangleIcon className="size-4" />
                <span className="text-sm font-semibold">
                  Technique conflict — needs your call
                </span>
              </div>
              {conflicts.map((c, i) => (
                <p
                  key={i}
                  className="text-xs leading-relaxed text-amber-800 dark:text-amber-300"
                >
                  <span className="font-medium">{c.recipeTitle}:</span>{" "}
                  {c.message} That recipe was left unchanged. Turn one of the
                  clashing techniques off on the menu and regenerate.
                </p>
              ))}
            </div>
          )}

          {/* Per-recipe steps */}
          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <ListChecksIcon className="size-4 text-brand" />
              Steps by dish
            </h3>
            {plan.perRecipeSteps.map((r) => (
              <PlanRecipeBlock
                key={r.recipeId}
                recipe={r}
                appliedTechniqueIds={plan.appliedTechniques}
              />
            ))}
          </section>

          <Separator />

          {/* Consolidated ingredients */}
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold tracking-tight">
              Consolidated ingredients
            </h3>
            <p className="text-xs text-muted-foreground">
              Every recipe scaled to {plan.servings} servings and merged, so the
              same ingredient is summed once.
            </p>
            <ul className="mt-1 flex flex-col gap-1.5">
              {plan.consolidatedIngredients.map((ing, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="min-w-20 shrink-0 font-medium tabular-nums">
                    {measureLabel(ing.quantity, ing.unit)}
                  </span>
                  <span className="capitalize">{ing.name}</span>
                </li>
              ))}
            </ul>
          </section>

          <Separator />

          {/* Shopping list grouped by store area */}
          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <ShoppingCartIcon className="size-4 text-brand" />
              Shopping list
            </h3>
            <p className="text-xs text-muted-foreground">
              Grouped by area of the store, so you shop in one pass.
            </p>
            <div className="flex flex-col gap-3">
              {plan.shoppingList.map((group) => (
                <div
                  key={group.area}
                  className="rounded-xl border bg-card p-4 shadow-sm"
                >
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">
                    {group.area}
                  </h4>
                  <ul className="flex flex-col gap-1.5">
                    {group.items.map((item, i) => (
                      <li
                        key={i}
                        className="flex items-baseline gap-2 text-sm"
                      >
                        <span className="min-w-20 shrink-0 font-medium tabular-nums text-muted-foreground">
                          {measureLabel(item.quantity, item.unit)}
                        </span>
                        <span className="capitalize">{item.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * One recipe's steps in the plan. Queries the recipe's associated techniques and
 * intersects with the plan's applied set, so when the chef wove a technique into
 * THIS dish we can name it in a brand-tinted callout — the visible difference
 * between stored know-how and applied know-how.
 */
function PlanRecipeBlock({
  recipe,
  appliedTechniqueIds,
}: {
  recipe: Doc<"menuPlans">["perRecipeSteps"][number];
  appliedTechniqueIds: Id<"techniques">[];
}) {
  const associated = useQuery(api.techniques.getTechniquesForRecipe, {
    recipeId: recipe.recipeId,
  });
  const appliedSet = new Set(appliedTechniqueIds as string[]);
  const wovenIn =
    associated?.filter((t) => appliedSet.has(t._id)).map((t) => t.title) ?? [];

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm",
        wovenIn.length > 0 && "border-brand/30",
      )}
    >
      <h4 className="text-sm font-semibold tracking-tight">{recipe.title}</h4>

      {wovenIn.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-brand/20 bg-brand/[0.06] px-2.5 py-1.5 text-xs text-brand">
          <SparklesIcon className="mt-0.5 size-3 shrink-0" />
          <span>
            <span className="font-medium">Woven in:</span> {wovenIn.join(", ")}
          </span>
        </div>
      )}

      <ol className="mt-3 flex flex-col gap-2">
        {recipe.steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-sm">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
              {i + 1}
            </span>
            <span className="leading-relaxed">{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
