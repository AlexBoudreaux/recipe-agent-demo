"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AGENT_MODES, type AgentMode } from "@/lib/agent-mode";

export function ModeSwitch({
  value,
  onValueChange,
}: {
  value: AgentMode;
  onValueChange: (mode: AgentMode) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(v) => onValueChange(v as AgentMode)}
    >
      <TabsList>
        {AGENT_MODES.map((mode) => (
          <TabsTrigger key={mode.value} value={mode.value}>
            {mode.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
