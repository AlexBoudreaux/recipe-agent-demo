"use client";

import { SearchIcon, SearchXIcon } from "lucide-react";
import { RecipeGridCard } from "@/components/recipe-grid-card";
import type { SearchResultItem } from "@/lib/artifact-types";

/**
 * Search-results grid (PRD stories 21-22). Renders the ranked hits the agent's
 * search_recipes tool streamed in — combined tag + meaning search. Tiles reuse
 * the library grid card; tags the query matched are highlighted as the "why".
 * An empty result set gets a friendly state, never a blank panel (story 45).
 */
export function SearchGrid({
  query,
  results,
  onOpen,
}: {
  query: string;
  results: SearchResultItem[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-5 flex items-center gap-2.5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand/15 to-accent text-brand shadow-sm ring-1 ring-brand/15">
          <SearchIcon className="size-4.5" />
        </div>
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            {results.length > 0 ? "Search results" : "No matches"}
          </h2>
          <p className="text-xs text-muted-foreground">
            {results.length > 0
              ? `${results.length} ${results.length === 1 ? "recipe" : "recipes"} for “${query}”`
              : `for “${query}”`}
          </p>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <SearchXIcon className="size-6" />
          </div>
          <div className="flex max-w-sm flex-col gap-1">
            <p className="font-medium">Nothing in your library matched that.</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Try different words, a broader ingredient, or capture a new recipe
              from a link.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((r) => (
            <RecipeGridCard
              key={r.id}
              recipe={{
                id: r.id,
                title: r.title,
                category: r.category,
                summary: r.summary,
                tags: r.tags,
                imageUrl: r.imageUrl,
              }}
              matchedTags={r.sharedTags}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}
