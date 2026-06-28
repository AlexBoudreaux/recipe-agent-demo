"use client";

import {
  SparklesIcon,
  CheckCircle2Icon,
  Loader2Icon,
  TargetIcon,
  PlusIcon,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { quantityLabel } from "@/lib/format";

/**
 * The normalized shape the technique card renders. Like RecipeView, every field
 * is optional so the SAME component renders a technique mid-stream (skeletons
 * for absent fields), a finished draft, and a saved Convex row. The artifact
 * panel feeds it `saved ?? draft` so there's no flicker at the streaming->saved
 * handoff — the exact pattern recipes use.
 *
 * A technique has NO cover image (not in the schema), so the card leads with a
 * branded header band instead. Its hero field is `applicability` — the WHEN/WHAT
 * this know-how applies to, which is what links it to recipes.
 */
export interface TechniqueView {
  title?: string;
  description?: string;
  applicability?: string;
  steps?: string[];
  addedIngredients?: Array<{
    name?: string;
    quantity?: number;
    unit?: string;
  }>;
  tags?: string[];
}

export type TechniqueCardStatus = "streaming" | "draft" | "saving" | "saved";

export function TechniqueCard({
  technique,
  status,
}: {
  technique: TechniqueView;
  status: TechniqueCardStatus;
}) {
  const { title, description, applicability, steps, addedIngredients, tags } =
    technique;
  const streaming = status === "streaming";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Branded header band (techniques have no cover photo) */}
      <div className="relative flex items-center gap-3 bg-gradient-to-br from-brand/15 via-accent to-card px-5 py-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card/80 text-brand shadow-sm ring-1 ring-brand/15">
          <SparklesIcon className="size-5" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">
            Technique
          </span>
          {title ? (
            <h2 className="truncate text-lg font-semibold leading-tight tracking-tight">
              {title}
            </h2>
          ) : (
            <Skeleton className="mt-1 h-5 w-40" />
          )}
        </div>
        <div className="absolute right-3 top-3">
          <StatusPill status={status} />
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {/* Description */}
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : streaming ? (
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        ) : null}

        {/* Applicability — the hero field that drives association to recipes */}
        {(applicability || streaming) && (
          <div className="flex gap-2.5 rounded-lg border border-brand/15 bg-brand/5 p-3">
            <TargetIcon className="mt-0.5 size-4 shrink-0 text-brand" />
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                Applies to
              </span>
              {applicability ? (
                <p className="text-sm leading-relaxed text-foreground/90">
                  {applicability}
                </p>
              ) : (
                <Skeleton className="h-3.5 w-56" />
              )}
            </div>
          </div>
        )}

        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand"
              >
                {t}
              </span>
            ))}
          </div>
        )}

        <Separator />

        {/* Steps */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Method
          </h3>
          {steps && steps.length > 0 ? (
            <ol className="flex flex-col gap-2">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-sm">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                    {i + 1}
                  </span>
                  <span className="leading-relaxed">{s}</span>
                </li>
              ))}
            </ol>
          ) : streaming ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No steps listed.</p>
          )}
        </section>

        {/* Ingredients this technique ADDS */}
        {addedIngredients && addedIngredients.length > 0 && (
          <>
            <Separator />
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Adds to the dish
              </h3>
              <ul className="flex flex-col gap-1.5">
                {addedIngredients.map((ing, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-sm">
                    <PlusIcon className="size-3 shrink-0 translate-y-0.5 text-brand/60" />
                    <span className="min-w-16 shrink-0 font-medium tabular-nums">
                      {quantityLabel(ing.quantity, ing.unit)}
                    </span>
                    <span>{ing.name ?? "…"}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: TechniqueCardStatus }) {
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-medium text-white shadow">
        <CheckCircle2Icon className="size-3" />
        Saved
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-foreground/80 px-2.5 py-1 text-xs font-medium text-background shadow">
        <Loader2Icon className="size-3 animate-spin" />
        Saving
      </span>
    );
  }
  if (status === "streaming") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-xs font-medium text-brand-foreground shadow">
        <Loader2Icon className="size-3 animate-spin" />
        Building
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-foreground/70 px-2.5 py-1 text-xs font-medium text-background shadow">
      Draft
    </span>
  );
}
