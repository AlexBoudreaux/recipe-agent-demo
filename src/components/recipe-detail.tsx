"use client";

import { useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  SparklesIcon,
  LockIcon,
  TargetIcon,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipeCard } from "@/components/recipe-card";

/**
 * Full recipe detail, opened from the library grid or a search result. It shows
 * the saved recipe (reactive, so a late cover photo streams in) plus the
 * techniques associated with it (getTechniquesForRecipe), each with its match
 * reason + score for explainability (PRD stories 20, 23).
 *
 * CRITICAL (PRD story 24): attached techniques are STORED KNOW-HOW, not applied.
 * They are visibly marked "available, not applied" and the recipe's steps are
 * shown completely UNCHANGED. The chef chooses what to weave in later (a future
 * chunk); the agent never silently rewrites the recipe.
 */
export function RecipeDetail({
  recipeId,
  onBack,
}: {
  recipeId: string;
  onBack: () => void;
}) {
  const recipe = useQuery(api.recipes.getRecipe, {
    recipeId: recipeId as Id<"recipes">,
  });
  const techniques = useQuery(api.techniques.getTechniquesForRecipe, {
    recipeId: recipeId as Id<"recipes">,
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        <ArrowLeftIcon className="size-3.5" />
        Back to library
      </button>

      {recipe === undefined ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : recipe === null ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          That recipe could not be found.
        </p>
      ) : (
        <>
          <RecipeCard
            recipe={{
              title: recipe.title,
              category: recipe.category,
              summary: recipe.summary,
              yield: recipe.yield,
              ingredients: recipe.ingredients,
              steps: recipe.steps,
              tags: recipe.tags,
              imageUrl: recipe.imageUrl,
            }}
            status="saved"
          />

          <AttachedTechniques techniques={techniques} />
        </>
      )}
    </div>
  );
}

type AttachedTechnique = NonNullable<
  ReturnType<typeof useQuery<typeof api.techniques.getTechniquesForRecipe>>
>[number];

function AttachedTechniques({
  techniques,
}: {
  techniques: AttachedTechnique[] | undefined;
}) {
  if (techniques === undefined) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }
  if (techniques.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-5 text-center">
        <p className="text-sm text-muted-foreground">
          No techniques attached yet. Capture a technique from a link and it’ll
          automatically attach to the recipes it suits.
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-brand" />
          <h3 className="text-sm font-semibold tracking-tight">
            Available techniques
          </h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {techniques.length}
          </span>
        </div>
        {/* The story-24 guarantee, stated plainly to the chef. */}
        <p className="flex items-center gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <LockIcon className="size-3 shrink-0" />
          Stored know-how that suits this dish. Not woven into the steps above —
          you decide what to apply.
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {techniques.map((t) => (
          <li
            key={t.associationId}
            className="flex flex-col gap-2 rounded-lg border border-brand/15 bg-brand/[0.04] p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold leading-snug">
                  {t.title}
                </span>
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {t.description}
                </span>
              </div>
              {/* The unmistakable "not applied" treatment (story 24). */}
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <LockIcon className="size-2.5" />
                Not applied
              </span>
            </div>

            {t.applicability && (
              <p className="flex items-start gap-1.5 text-xs leading-relaxed text-foreground/80">
                <TargetIcon className="mt-0.5 size-3 shrink-0 text-brand/70" />
                {t.applicability}
              </p>
            )}

            {/* Why it matched: reason + score (stories 20, 23). */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                Match {Math.round(t.score * 100)}%
              </span>
              {t.reason && (
                <span className="text-[11px] leading-snug text-muted-foreground">
                  {t.reason}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
