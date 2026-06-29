"use client";

import Image from "next/image";
import { Trash2Icon, UtensilsCrossedIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * One compact recipe tile for the library grid and the search-results grid. It
 * deliberately mirrors RecipeCard's visual language (same cover aspect, brand
 * tag chips, capitalized category badge) so a grid of these and the big detail
 * card read as the same product. Click bubbles up so the panel can open detail.
 */
export interface RecipeGridItem {
  id: string;
  title: string;
  category: string;
  summary?: string;
  tags?: string[];
  imageUrl?: string | null;
}

export function RecipeGridCard({
  recipe,
  onOpen,
  /** Optional "why it matched" chips shown under the title (search results). */
  matchedTags,
  /** When provided, a trash button appears on hover to delete this recipe. */
  onDelete,
}: {
  recipe: RecipeGridItem;
  onOpen: (id: string) => void;
  matchedTags?: string[];
  onDelete?: (id: string) => void;
}) {
  const tags = (recipe.tags ?? []).slice(0, 3);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-within:ring-2 focus-within:ring-ring/50">
      <button
        type="button"
        onClick={() => onOpen(recipe.id)}
        aria-label={`Open ${recipe.title}`}
        className="absolute inset-0 z-0 focus-visible:outline-none"
      />
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(recipe.id);
          }}
          aria-label={`Delete ${recipe.title}`}
          className="absolute right-2.5 top-2.5 z-10 flex size-7 items-center justify-center rounded-md bg-card/85 text-muted-foreground opacity-0 shadow-sm ring-1 ring-border/60 backdrop-blur transition-all hover:bg-destructive hover:text-white focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive group-hover:opacity-100"
        >
          <Trash2Icon className="size-3.5" />
        </button>
      )}
      {/* Cover */}
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
        {recipe.imageUrl ? (
          <Image
            src={recipe.imageUrl}
            alt={recipe.title}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 22vw"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/10 to-muted text-brand/40">
            <UtensilsCrossedIcon className="size-8" />
          </div>
        )}
        <div className="absolute left-2.5 top-2.5">
          <Badge
            variant="secondary"
            className="bg-card/85 capitalize shadow-sm ring-1 ring-border/60 backdrop-blur"
          >
            {recipe.category}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight">
          {recipe.title}
        </h3>
        {recipe.summary && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {recipe.summary}
          </p>
        )}
        {tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1 pt-1.5">
            {tags.map((t) => (
              <span
                key={t}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                  matchedTags?.includes(t)
                    ? "bg-brand/15 text-brand ring-1 ring-brand/20"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
