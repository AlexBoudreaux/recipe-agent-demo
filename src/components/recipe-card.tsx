"use client";

import * as React from "react";
import Image from "next/image";
import {
  UtensilsCrossedIcon,
  ImageIcon,
  CheckCircle2Icon,
  Loader2Icon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { quantityLabel } from "@/lib/format";

/**
 * The normalized shape the card renders. It deliberately makes every field
 * optional: the SAME component renders a recipe mid-stream (most fields absent),
 * a finished draft, and a saved Convex row. The artifact panel feeds it
 * `saved ?? draft` so there is no flicker at the streaming -> saved handoff.
 */
export interface RecipeView {
  title?: string;
  category?: string;
  summary?: string;
  yield?: { amount?: number; unit?: string };
  ingredients?: Array<{
    name?: string;
    quantity?: number;
    unit?: string;
    prep?: string | null;
  }>;
  steps?: string[];
  tags?: string[];
  imageUrl?: string | null;
}

export type RecipeCardStatus = "streaming" | "draft" | "saving" | "saved";

export function RecipeCard({
  recipe,
  status,
}: {
  recipe: RecipeView;
  status: RecipeCardStatus;
}) {
  const { title, category, summary, ingredients, steps, tags, imageUrl } =
    recipe;
  const streaming = status === "streaming";

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Cover image */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={title ?? "Recipe cover"}
            fill
            sizes="(max-width: 1024px) 100vw, 66vw"
            className="object-cover"
            unoptimized
          />
        ) : status === "saved" || status === "saving" ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="size-6 animate-pulse" />
            <span className="text-xs">Cooking up a cover photo…</span>
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/10 to-muted text-brand/40">
            <UtensilsCrossedIcon className="size-10" />
          </div>
        )}

        {/* Status pill */}
        <div className="absolute right-3 top-3">
          <StatusPill status={status} />
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">
        {/* Title + category */}
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            {title ? (
              <h2 className="text-lg font-semibold leading-tight tracking-tight">
                {title}
              </h2>
            ) : (
              <Skeleton className="h-6 w-2/3" />
            )}
            {category ? (
              <Badge variant="secondary" className="shrink-0 capitalize">
                {category}
              </Badge>
            ) : streaming ? (
              <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
            ) : null}
          </div>

          {summary ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {summary}
            </p>
          ) : streaming ? (
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
          ) : null}

          {tags && tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
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
        </div>

        <Separator />

        {/* Ingredients */}
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ingredients
          </h3>
          {ingredients && ingredients.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {ingredients.map((ing, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-baseline gap-2 text-sm",
                    ing.name === undefined && "opacity-50",
                  )}
                >
                  <span className="min-w-16 shrink-0 font-medium tabular-nums">
                    {quantityLabel(ing.quantity, ing.unit)}
                  </span>
                  <span>
                    {ing.name ?? "…"}
                    {ing.prep ? (
                      <span className="text-muted-foreground">, {ing.prep}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : streaming ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-3.5 w-full" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No ingredients listed.</p>
          )}
        </section>

        {/* Steps */}
        {((steps && steps.length > 0) || streaming) && (
          <>
            <Separator />
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Steps
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
              ) : (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-5/6" />
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: RecipeCardStatus }) {
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
