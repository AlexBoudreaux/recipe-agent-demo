"use client";

import { BookOpenIcon } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-background/80 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand/70 text-brand-foreground shadow-sm ring-1 ring-brand/20">
          <BookOpenIcon className="size-4.5" />
        </div>
        <span className="font-heading text-base font-semibold tracking-tight">
          Cookbook
        </span>
      </div>

      <ModeToggle />
    </header>
  );
}
