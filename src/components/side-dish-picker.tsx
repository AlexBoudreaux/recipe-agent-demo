"use client";

import Image from "next/image";
import {
  UtensilsCrossedIcon,
  SparklesIcon,
  PlusIcon,
  CheckIcon,
  ArrowLeftIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SideDishEvent } from "@/lib/artifact-types";
import type { PlanControls } from "@/lib/act3";

/**
 * The side-dish picker (PRD stories 27-30). When the agent runs
 * generate_side_dishes it returns THREE sides drawn ONLY from the chef's own
 * library — each survived a deterministic protein-overlap filter, then the model
 * ranked it with a one-line pairing reason. This view renders those three as
 * cards with their reason and an "Add to menu" action.
 *
 * "Add to menu" doesn't hit Convex directly — it asks the agent (via
 * PlanControls.addRecipe) to call add_recipe_to_menu, so the action lands in the
 * conversation and the menu workspace re-renders from the agent's tool output.
 */
export function SideDishPicker({
  event,
  controls,
  alreadyOnMenu,
  onOpen,
  onBackToMenu,
}: {
  event: SideDishEvent;
  controls: PlanControls;
  /** Recipe ids already on the active menu, so an added side reads as added. */
  alreadyOnMenu: Set<string>;
  onOpen: (id: string) => void;
  onBackToMenu: (() => void) | null;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
      <div className="flex flex-col gap-2">
        {onBackToMenu && (
          <button
            type="button"
            onClick={onBackToMenu}
            className="inline-flex w-fit items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            Back to menu
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand/15 to-accent text-brand shadow-sm ring-1 ring-brand/15">
            <SparklesIcon className="size-4.5" />
          </div>
          <div>
            <h2 className="font-heading text-lg font-semibold tracking-tight">
              Sides that pair with {event.main.title}
            </h2>
            <p className="text-xs text-muted-foreground">
              From your library · {event.consideredCount}{" "}
              {event.consideredCount === 1 ? "side" : "sides"} considered after the
              protein-overlap filter
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {event.suggestions.map((s) => {
          const added = alreadyOnMenu.has(s.id);
          return (
            <div
              key={s.id}
              className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                className="group relative block aspect-[16/9] w-full overflow-hidden bg-muted text-left"
              >
                {s.imageUrl ? (
                  <Image
                    src={s.imageUrl}
                    alt={s.title}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
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
                    {s.category}
                  </Badge>
                </div>
              </button>

              <div className="flex flex-1 flex-col gap-2 p-3.5">
                <h3 className="text-sm font-semibold leading-snug tracking-tight">
                  {s.title}
                </h3>

                {/* The pairing reason — the whole point of the picker. */}
                <p className="flex items-start gap-1.5 rounded-lg border border-brand/15 bg-brand/[0.05] p-2.5 text-xs leading-relaxed text-foreground/85">
                  <SparklesIcon className="mt-0.5 size-3 shrink-0 text-brand" />
                  {s.reason}
                </p>

                <div className="mt-auto pt-1">
                  {added ? (
                    <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckIcon className="size-3.5" />
                      On the menu
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={controls.busy}
                      onClick={() => controls.addRecipe(s.id, s.title)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-brand-foreground shadow-sm transition-colors hover:bg-brand/90 disabled:opacity-50"
                    >
                      <PlusIcon className="size-3.5" />
                      Add to menu
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        These are searched from your saved sides, never invented — so the library
        compounds in value as you add to it.
      </p>
    </div>
  );
}
