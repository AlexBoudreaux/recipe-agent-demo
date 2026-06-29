"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BookOpenIcon,
  ChefHatIcon,
  ListChecksIcon,
  SparklesIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecipeGridCard } from "@/components/recipe-grid-card";
import { TechniqueCard, type TechniqueView } from "@/components/technique-card";
import { cn } from "@/lib/utils";

type TabKey = "recipes" | "menus" | "techniques";

// Canonical category order used by the recipe filter row. Empty categories
// (e.g. dessert/beverage) are dropped from the row so a chef never taps a chip
// that leads nowhere — the library reads as a real, populated browser.
const CATEGORY_ORDER = [
  "main",
  "side",
  "sauce",
  "appetizer",
  "dessert",
  "beverage",
] as const;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The library browser — what the canvas shows on first load (PRD story 46), so
 * the app looks alive instead of empty. A sticky header pins the cookbook
 * title, the browse tabs (Recipes / Menus / Techniques), and the category
 * filter while the active grid scrolls under it. Reactive Convex queries are the
 * source of truth: newly saved items and their async cover photos stream in on
 * their own.
 */
export function LibraryGrid({
  onOpen,
  onOpenMenu,
  /** px to keep clear on the right so the floating chat never covers content */
  padRight,
}: {
  onOpen: (id: string) => void;
  onOpenMenu?: (id: string) => void;
  padRight?: number;
}) {
  const recipes = useQuery(api.recipes.listRecipes, {});
  const menus = useQuery(api.menus.listMenus, {});
  const techniques = useQuery(api.techniques.listTechniques, {});
  const deleteRecipe = useMutation(api.recipes.deleteRecipe);

  const [tab, setTab] = useState<TabKey>("recipes");
  // "all" plus the recipe categories present in the library.
  const [category, setCategory] = useState<string>("all");

  // The recipe queued for deletion, shown in the confirm dialog. null = closed.
  const [pending, setPending] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pending) return;
    setDeleting(true);
    try {
      await deleteRecipe({ recipeId: pending.id as Id<"recipes"> });
      toast.success(`Deleted "${pending.title}"`);
      setPending(null);
    } catch {
      toast.error("Couldn't delete that recipe. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  const presentCategories = recipes
    ? CATEGORY_ORDER.filter((c) => recipes.some((r) => r.category === c))
    : [];
  const filteredRecipes =
    recipes && category !== "all"
      ? recipes.filter((r) => r.category === category)
      : recipes;

  // Subline under the title reflects the active tab (and recipe filter).
  function countLabel() {
    if (tab === "recipes") {
      if (recipes === undefined) return "Loading your library…";
      if (category === "all") return `${plural(recipes.length, "recipe", "recipes")} saved`;
      return plural(filteredRecipes?.length ?? 0, "recipe", "recipes");
    }
    if (tab === "menus") {
      if (menus === undefined) return "Loading your menus…";
      return plural(menus.length, "menu", "menus");
    }
    if (techniques === undefined) return "Loading your techniques…";
    return plural(techniques.length, "technique", "techniques");
  }

  // Full-width row whose inner content respects the chat's reserved gutter.
  const gutter = (node: React.ReactNode) => (
    <div style={{ paddingRight: padRight }}>{node}</div>
  );

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as TabKey)}
      className="block"
    >
      {/* Floating sticky header — a rounded bar spanning the grid width that
          pins while the active grid scrolls under it. */}
      <div className="sticky top-0 z-20">
        {gutter(
          <div className="mx-auto w-full max-w-6xl px-6 pt-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/85 px-5 py-3.5 shadow-lg shadow-black/5 ring-1 ring-black/[0.02] backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand/15 to-accent text-brand shadow-sm ring-1 ring-brand/15">
                  <BookOpenIcon className="size-4.5" />
                </div>
                <div>
                  <h2 className="font-heading text-lg font-semibold tracking-tight">
                    Your cookbook
                  </h2>
                  <p className="text-xs text-muted-foreground">{countLabel()}</p>
                </div>
              </div>

              <TabsList>
                <TabsTrigger value="recipes">
                  <BookOpenIcon />
                  Recipes
                </TabsTrigger>
                <TabsTrigger value="menus">
                  <ChefHatIcon />
                  Menus
                </TabsTrigger>
                <TabsTrigger value="techniques">
                  <SparklesIcon />
                  Techniques
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Category filter — recipes only */}
            {tab === "recipes" && presentCategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <CategoryChip
                  label="All"
                  count={recipes?.length ?? 0}
                  active={category === "all"}
                  onClick={() => setCategory("all")}
                />
                {presentCategories.map((c) => (
                  <CategoryChip
                    key={c}
                    label={c}
                    count={recipes?.filter((r) => r.category === c).length ?? 0}
                    active={category === c}
                    onClick={() => setCategory(c)}
                  />
                ))}
              </div>
            )}
          </div>
          </div>,
        )}
      </div>

      {/* Recipes */}
      <TabsContent value="recipes">
        {gutter(
          <div className="mx-auto w-full max-w-6xl px-6 py-6">
            {recipes === undefined ? (
              <GridSkeleton />
            ) : recipes.length === 0 ? (
              <EmptyState text="No recipes yet. Paste a link in the chat to begin." />
            ) : filteredRecipes && filteredRecipes.length === 0 ? (
              <EmptyState text={`No ${category} recipes yet.`} />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {filteredRecipes?.map((r) => (
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
                    onDelete={(id) => setPending({ id, title: r.title })}
                  />
                ))}
              </div>
            )}
          </div>,
        )}
      </TabsContent>

      {/* Menus */}
      <TabsContent value="menus">
        {gutter(
          <div className="mx-auto w-full max-w-6xl px-6 py-6">
            {menus === undefined ? (
              <GridSkeleton bands />
            ) : menus.length === 0 ? (
              <EmptyState text="No menus yet. Ask the agent to build one." />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {menus.map((m) => (
                  <MenuGridCard
                    key={m._id}
                    name={m.name}
                    recipeCount={m.recipeRefs.length}
                    servings={m.targetServings}
                    onOpen={onOpenMenu ? () => onOpenMenu(m._id) : undefined}
                  />
                ))}
              </div>
            )}
          </div>,
        )}
      </TabsContent>

      {/* Techniques */}
      <TabsContent value="techniques">
        {gutter(
          <div className="mx-auto w-full max-w-6xl px-6 py-6">
            {techniques === undefined ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-72 w-full rounded-xl" />
                ))}
              </div>
            ) : techniques.length === 0 ? (
              <EmptyState text="No techniques yet." />
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {techniques.map((t) => (
                  <TechniqueCard
                    key={t._id}
                    technique={t as TechniqueView}
                    status="saved"
                  />
                ))}
              </div>
            )}
          </div>,
        )}
      </TabsContent>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete recipe?</DialogTitle>
            <DialogDescription>
              {pending
                ? `"${pending.title}" will be removed from your cookbook and any menus it's in. This can't be undone.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPending(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}

/** A category filter pill, styled like the brand tag chips on the grid cards. */
function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
        active
          ? "bg-brand/15 text-brand ring-1 ring-brand/20"
          : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "tabular-nums",
          active ? "text-brand/70" : "text-muted-foreground/60",
        )}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * A compact menu tile. Menus have no cover photo, so it leads with a branded
 * header band (mirroring the technique card) rather than an image — same
 * rounded card, hover lift, and brand accent as the recipe tiles.
 */
function MenuGridCard({
  name,
  recipeCount,
  servings,
  onOpen,
}: {
  name: string;
  recipeCount: number;
  servings?: number;
  onOpen?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${name}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-center gap-3 bg-gradient-to-br from-brand/15 via-accent to-card px-4 py-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card/80 text-brand shadow-sm ring-1 ring-brand/15">
          <ChefHatIcon className="size-5" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">
            Menu
          </span>
          <h3 className="truncate text-sm font-semibold leading-tight tracking-tight">
            {name}
          </h3>
        </div>
      </div>
      <div className="flex items-center gap-1.5 px-4 py-3 text-xs text-muted-foreground">
        <ListChecksIcon className="size-3.5 text-brand/60" />
        {plural(recipeCount, "recipe", "recipes")}
        {servings ? ` · serves ${servings}` : ""}
      </div>
    </button>
  );
}

function GridSkeleton({ bands = false }: { bands?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
        >
          {bands ? (
            <Skeleton className="h-[72px] w-full rounded-none" />
          ) : (
            <Skeleton className="aspect-[16/9] w-full rounded-none" />
          )}
          <div className="flex flex-col gap-2 p-3.5">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-3 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-20 text-center text-muted-foreground">
      <p className="text-sm">{text}</p>
    </div>
  );
}
