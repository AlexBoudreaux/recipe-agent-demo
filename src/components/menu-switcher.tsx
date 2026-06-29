"use client";

import * as React from "react";
import { useMutation, useQuery } from "convex/react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChefHatIcon,
  ChevronDownIcon,
  CheckIcon,
  PlusIcon,
  Trash2Icon,
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

/**
 * Persistent "what am I planning" indicator in the header. Shows the active menu
 * (name + servings) and lets the chef switch between saved menus or start a new
 * one, so menus stop being an invisible id buried in the chat transcript. The
 * agent still owns creation/naming; "New menu" just asks it to start one.
 */
export function MenuSwitcher({
  activeMenuId,
  onSelectMenu,
  onNewMenu,
  onMenuDeleted,
}: {
  activeMenuId: string | null;
  onSelectMenu: (menuId: string) => void;
  onNewMenu: () => void;
  onMenuDeleted?: (deletedId: string) => void;
}) {
  const menus = useQuery(api.menus.listMenus, {});
  const deleteMenu = useMutation(api.menus.deleteMenu);
  const active = menus?.find((m) => (m._id as string) === activeMenuId) ?? null;
  const hasMenus = (menus?.length ?? 0) > 0;

  // The menu queued for deletion, shown in the confirm dialog. null = closed.
  const [pending, setPending] = React.useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function confirmDelete() {
    if (!pending) return;
    setDeleting(true);
    try {
      await deleteMenu({ menuId: pending.id as Id<"menus"> });
      toast.success(`Deleted "${pending.name}"`);
      onMenuDeleted?.(pending.id);
      setPending(null);
    } catch {
      toast.error("Couldn't delete that menu. Try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Switch menu"
          className="flex max-w-[260px] items-center gap-2 rounded-lg border border-border/70 bg-background px-2.5 py-1.5 text-sm transition-colors hover:border-brand/40 hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChefHatIcon className="size-4 shrink-0 text-brand" />
          <span className="flex min-w-0 flex-col items-start leading-tight">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Planning
            </span>
            <span className="truncate font-medium">
              {active ? active.name : "No menu yet"}
            </span>
          </span>
          {active?.targetServings ? (
            <span className="shrink-0 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
              serves {active.targetServings}
            </span>
          ) : null}
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-[240px] overflow-hidden rounded-xl border border-border/70 bg-card p-1 shadow-lg"
        >
          {hasMenus ? (
            <>
              <DropdownMenu.Label className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Your menus
              </DropdownMenu.Label>
              {menus?.map((m) => {
                const id = m._id as string;
                const isActive = id === activeMenuId;
                return (
                  <DropdownMenu.Item
                    key={id}
                    onSelect={() => onSelectMenu(id)}
                    className="group flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent/60"
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center text-brand">
                      {isActive ? <CheckIcon className="size-4" /> : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate font-medium">{m.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {m.recipeRefs.length}{" "}
                        {m.recipeRefs.length === 1 ? "recipe" : "recipes"}
                        {m.targetServings ? ` · serves ${m.targetServings}` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={`Delete ${m.name}`}
                      // Keep this isolated from the row's onSelect: stop the
                      // pointer/click from bubbling so picking trash never also
                      // selects the menu, then open the confirm dialog.
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setPending({ id, name: m.name });
                      }}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none group-data-[highlighted]:opacity-100"
                    >
                      <Trash2Icon className="size-3.5" />
                    </button>
                  </DropdownMenu.Item>
                );
              })}
              <DropdownMenu.Separator className="my-1 h-px bg-border/70" />
            </>
          ) : (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              No menus yet. Start one to plan a meal.
            </div>
          )}
          <DropdownMenu.Item
            onSelect={onNewMenu}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-brand outline-none data-[highlighted]:bg-accent/60"
          >
            <PlusIcon className="size-4" />
            New menu
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete menu?</DialogTitle>
            <DialogDescription>
              {pending
                ? `"${pending.name}" and its saved plans will be removed. This can't be undone.`
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
    </DropdownMenu.Root>
  );
}
