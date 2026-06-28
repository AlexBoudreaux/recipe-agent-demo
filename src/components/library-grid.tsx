"use client";

import { useQuery } from "convex/react";
import { BookOpenIcon } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton";
import { RecipeGridCard } from "@/components/recipe-grid-card";

/**
 * The library grid — what the canvas shows on first load (PRD story 46), so the
 * app looks alive instead of empty. A reactive Convex query is the source of
 * truth: newly saved recipes and their async cover photos stream in on their
 * own. Clicking a tile opens that recipe's detail view.
 */
export function LibraryGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const recipes = useQuery(api.recipes.listRecipes, {});

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand/15 to-accent text-brand shadow-sm ring-1 ring-brand/15">
            <BookOpenIcon className="size-4.5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              Your cookbook
            </h2>
            <p className="text-xs text-muted-foreground">
              {recipes === undefined
                ? "Loading your library…"
                : `${recipes.length} ${recipes.length === 1 ? "recipe" : "recipes"} saved`}
            </p>
          </div>
        </div>
      </div>

      {recipes === undefined ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <Skeleton className="aspect-[16/9] w-full rounded-none" />
              <div className="flex flex-col gap-2 p-3.5">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center text-muted-foreground">
          <p className="text-sm">No recipes yet. Paste a link in the chat to begin.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {recipes.map((r) => (
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
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
