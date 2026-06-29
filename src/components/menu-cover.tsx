import Image from "next/image";
import { ChefHatIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A menu has no cover photo of its own, so we collage one out of the cover
 * images of the dishes on it. Presentational only: hand it the resolved image
 * URLs (in course order) and it fills its container with a tasteful tile layout
 * that scales with how many dishes have photos. Zero images falls back to the
 * branded gradient + chef hat so an empty menu still reads as intentional.
 *
 * Mirrors RecipeGridCard's image approach (next/image, fill, object-cover,
 * unoptimized) so menu covers and recipe tiles read as the same product.
 */
export function MenuCover({
  imageUrls,
  className,
  alt = "Menu cover",
}: {
  imageUrls?: string[];
  className?: string;
  alt?: string;
}) {
  // Defensive: the backend may briefly serve a menu shape without the field
  // (e.g. before the updated listMenus is deployed), so never assume an array.
  const urls = (imageUrls ?? []).slice(0, 4);

  if (urls.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/15 via-accent to-card text-brand/40",
          className,
        )}
      >
        <ChefHatIcon className="size-8" />
      </div>
    );
  }

  // One shared tile so every layout gets the same crop + hover language.
  const tile = (src: string, key: string | number, sizes: string) => (
    <div key={key} className="relative h-full w-full overflow-hidden bg-muted">
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        unoptimized
      />
    </div>
  );

  const sizes = "(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 22vw";

  return (
    <div className={cn("h-full w-full overflow-hidden bg-muted", className)}>
      {urls.length === 1 && (
        <div className="grid h-full w-full">{tile(urls[0], 0, sizes)}</div>
      )}

      {urls.length === 2 && (
        <div className="grid h-full w-full grid-cols-2 gap-0.5">
          {urls.map((u, i) => tile(u, i, sizes))}
        </div>
      )}

      {urls.length === 3 && (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
          <div className="row-span-2">{tile(urls[0], 0, sizes)}</div>
          {tile(urls[1], 1, sizes)}
          {tile(urls[2], 2, sizes)}
        </div>
      )}

      {urls.length >= 4 && (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5">
          {urls.map((u, i) => tile(u, i, sizes))}
        </div>
      )}
    </div>
  );
}
