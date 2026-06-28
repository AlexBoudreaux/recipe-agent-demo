"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import {
  ListChecksIcon,
  MinusIcon,
  PlusIcon,
  UsersIcon,
  ScaleIcon,
  SparklesIcon,
  LockIcon,
  ChefHatIcon,
  FileTextIcon,
  TargetIcon,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { RecipeGridCard } from "@/components/recipe-grid-card";
import { cn } from "@/lib/utils";
import type { PlanControls, UnitSystem } from "@/lib/act3";

/**
 * The menu workspace (PRD stories 25-26, 31-33, 36-38). When a menu is active
 * this is the canvas home base: the ordered recipes, the SERVINGS control, the
 * UNIT-SYSTEM toggle, and — the guardrail centerpiece — the per-recipe technique
 * toggles that ALWAYS default OFF. The chef chooses which associated techniques
 * to weave in; nothing is ever auto-applied. "Generate plan" hands those exact
 * choices to the agent's build_menu_plan tool.
 *
 * All planning state (servings / unit system / chosen technique ids) is lifted
 * to the shell via `controls`, so it survives the generate -> plan -> back round
 * trip and a flagged conflict can actually be resolved here.
 */
export function MenuWorkspace({
  menuId,
  controls,
  onOpenRecipe,
  onViewPlan,
}: {
  menuId: string;
  controls: PlanControls;
  onOpenRecipe: (recipeId: string) => void;
  onViewPlan: () => void;
}) {
  const menu = useQuery(api.menus.getMenu, { menuId: menuId as Id<"menus"> });
  const latestPlan = useQuery(api.menuPlans.getLatestMenuPlan, {
    menuId: menuId as Id<"menus">,
  });

  if (menu === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <Skeleton className="h-10 w-64" />
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (menu === null) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center text-sm text-muted-foreground">
        That menu could not be found. Ask the agent to start a new one.
      </div>
    );
  }

  const effectiveServings = controls.servings ?? menu.targetServings ?? 4;
  const selectedCount = controls.selectedTechniqueIds.length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand/15 to-accent text-brand shadow-sm ring-1 ring-brand/15">
            <ChefHatIcon className="size-4.5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              {menu.name}
            </h2>
            <p className="text-xs text-muted-foreground">
              {menu.recipes.length}{" "}
              {menu.recipes.length === 1 ? "recipe" : "recipes"} · serves{" "}
              {effectiveServings}
            </p>
          </div>
        </div>
        {latestPlan && (
          <button
            type="button"
            onClick={onViewPlan}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            <FileTextIcon className="size-3.5" />
            View plan v{latestPlan.version}
          </button>
        )}
      </div>

      {/* Recipes */}
      {menu.recipes.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center text-sm text-muted-foreground">
          No recipes on this menu yet. Ask the agent to add a main, then find a
          complementary side.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {menu.recipes.map((r) => (
            <RecipeGridCard
              key={r._id}
              recipe={{
                id: r._id,
                title: r.title,
                category: r.category,
                summary: r.summary,
                tags: r.tags,
                imageUrl: r.imageUrl,
              }}
              onOpen={onOpenRecipe}
            />
          ))}
        </div>
      )}

      {menu.recipes.length > 0 && (
        <>
          <Separator />

          {/* Serving count + unit system — both feed build_menu_plan. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ServingsControl
              value={effectiveServings}
              onChange={(n) => controls.setServings(n)}
            />
            <UnitSystemToggle
              value={controls.unitSystem}
              onChange={controls.setUnitSystem}
            />
          </div>

          <Separator />

          {/* The human-picks-techniques guardrail (stories 31-33). */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-brand" />
                <h3 className="text-sm font-semibold tracking-tight">
                  Techniques to weave in
                </h3>
                {selectedCount > 0 && (
                  <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                    {selectedCount} chosen
                  </span>
                )}
              </div>
              <p className="flex items-center gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <LockIcon className="size-3 shrink-0" />
                Off by default. Nothing is applied unless you turn it on — the
                agent never rewrites a recipe on its own.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {menu.recipes.map((r) => (
                <RecipeTechniqueToggles
                  key={r._id}
                  recipeId={r._id}
                  recipeTitle={r.title}
                  selected={controls.selectedTechniqueIds}
                  onToggle={controls.toggleTechnique}
                />
              ))}
            </div>
          </section>

          <Separator />

          {/* Generate plan */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              disabled={controls.busy}
              onClick={() => controls.generatePlan(effectiveServings)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground shadow-md shadow-brand/25 transition-colors hover:bg-brand/90 disabled:opacity-50"
            >
              <ListChecksIcon className="size-4" />
              {latestPlan ? "Regenerate plan" : "Generate plan"}
            </button>
            <p className="text-center text-xs text-muted-foreground">
              Scaled to {effectiveServings} servings in {controls.unitSystem} units
              {selectedCount > 0
                ? `, weaving in ${selectedCount} chosen ${selectedCount === 1 ? "technique" : "techniques"}`
                : ", no techniques applied"}
              .
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function ServingsControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3.5 shadow-sm">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <UsersIcon className="size-3.5" />
        Servings
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Fewer servings"
          onClick={() => onChange(Math.max(1, value - 1))}
          className="flex size-8 items-center justify-center rounded-lg border bg-background text-foreground shadow-sm transition-colors hover:bg-accent disabled:opacity-40"
          disabled={value <= 1}
        >
          <MinusIcon className="size-4" />
        </button>
        <span className="min-w-8 text-center text-lg font-semibold tabular-nums">
          {value}
        </span>
        <button
          type="button"
          aria-label="More servings"
          onClick={() => onChange(value + 1)}
          className="flex size-8 items-center justify-center rounded-lg border bg-background text-foreground shadow-sm transition-colors hover:bg-accent"
        >
          <PlusIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

function UnitSystemToggle({
  value,
  onChange,
}: {
  value: UnitSystem;
  onChange: (u: UnitSystem) => void;
}) {
  const options: { v: UnitSystem; label: string }[] = [
    { v: "imperial", label: "Imperial" },
    { v: "metric", label: "Metric" },
  ];
  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3.5 shadow-sm">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ScaleIcon className="size-3.5" />
        Units
      </span>
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              value === o.v
                ? "bg-card text-brand shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The technique toggles for ONE recipe. A separate component so each recipe's
 * getTechniquesForRecipe query lives at a hook top level. Every toggle starts
 * OFF (the chef's selection set is the only source of "on") — this is the
 * on-screen proof that the agent never auto-applies a technique.
 */
function RecipeTechniqueToggles({
  recipeId,
  recipeTitle,
  selected,
  onToggle,
}: {
  recipeId: string;
  recipeTitle: string;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const techniques = useQuery(api.techniques.getTechniquesForRecipe, {
    recipeId: recipeId as Id<"recipes">,
  });

  // Recipes with no associated know-how add only noise here; skip them.
  if (techniques !== undefined && techniques.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-foreground/70">{recipeTitle}</span>
      {techniques === undefined ? (
        <Skeleton className="h-14 w-full rounded-lg" />
      ) : (
        <ul className="flex flex-col gap-2">
          {techniques.map((t) => {
            const on = selected.includes(t._id);
            return (
              <li key={t.associationId}>
                <button
                  type="button"
                  onClick={() => onToggle(t._id)}
                  aria-pressed={on}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    on
                      ? "border-brand bg-brand/[0.06]"
                      : "border-border bg-card hover:bg-accent/50",
                  )}
                >
                  {/* The switch */}
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
                      on ? "bg-brand" : "bg-muted-foreground/30",
                    )}
                  >
                    <span
                      className={cn(
                        "size-4 rounded-full bg-white shadow transition-transform",
                        on ? "translate-x-4" : "translate-x-0",
                      )}
                    />
                  </span>

                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-semibold leading-snug">
                        {t.title}
                      </span>
                      <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                        {Math.round(t.score * 100)}%
                      </span>
                    </span>
                    {t.applicability && (
                      <span className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                        <TargetIcon className="mt-0.5 size-3 shrink-0 text-brand/60" />
                        {t.applicability}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
