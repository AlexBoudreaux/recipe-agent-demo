"use client";

import { DownloadIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AGENT_MODES, type AgentMode } from "@/lib/agent-mode";

const MODE_ICON: Record<AgentMode, React.ComponentType<{ className?: string }>> = {
  ingest: DownloadIcon,
  search: SearchIcon,
};

export function ModeSwitch({
  value,
  onValueChange,
}: {
  value: AgentMode;
  onValueChange: (mode: AgentMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5 ring-1 ring-border/60">
      {AGENT_MODES.map((mode) => {
        const Icon = MODE_ICON[mode.value];
        const active = value === mode.value;
        return (
          <button
            key={mode.value}
            type="button"
            aria-pressed={active}
            onClick={() => onValueChange(mode.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-border/70"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
