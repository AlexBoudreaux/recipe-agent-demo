"use client";

import { ChefHatIcon } from "lucide-react";
import { ModeSwitch } from "@/components/mode-switch";
import { ModeToggle } from "@/components/mode-toggle";
import { type AgentMode } from "@/lib/agent-mode";

export function AppHeader({
  mode,
  onModeChange,
}: {
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground">
          <ChefHatIcon className="size-4" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold tracking-tight">
            Recipe Agent
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            augment the chef
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <ModeSwitch value={mode} onValueChange={onModeChange} />
        <ModeToggle />
      </div>
    </header>
  );
}
