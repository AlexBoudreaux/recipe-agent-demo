"use client";

import * as React from "react";
import { AppHeader } from "@/components/app-header";
import { ChatPanel } from "@/components/chat-panel";
import { ArtifactPanel } from "@/components/artifact-panel";
import { type AgentMode } from "@/lib/agent-mode";

export function DashboardShell() {
  // Soft ingest/search mode. Lifted here so the header toggle and the chat
  // panel share it. Behavior (biasing the agent) is wired in a later chunk.
  const [mode, setMode] = React.useState<AgentMode>("ingest");

  return (
    <div className="flex h-screen min-h-0 flex-col bg-muted/30">
      <AppHeader mode={mode} onModeChange={setMode} />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(380px,440px)_1fr]">
        <ChatPanel mode={mode} />
        <ArtifactPanel />
      </main>
    </div>
  );
}
