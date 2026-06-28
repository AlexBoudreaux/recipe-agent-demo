"use client";

import { BookOpenIcon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";

export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-card px-4 shadow-sm">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand/70 text-brand-foreground shadow-sm ring-1 ring-brand/20">
          <BookOpenIcon className="size-4.5" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading text-base font-semibold tracking-tight">
            Cookbook
          </span>
          <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
            AI
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <ModeToggle />
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          aria-label="Settings"
        >
          <SettingsIcon className="size-4" />
        </Button>
        <div className="mx-1 h-6 w-px bg-border" aria-hidden />
        <button
          type="button"
          aria-label="Account"
          className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-secondary text-sm font-semibold text-foreground/80 ring-1 ring-border/70 transition-shadow hover:shadow-sm"
        >
          AB
        </button>
      </div>
    </header>
  );
}
