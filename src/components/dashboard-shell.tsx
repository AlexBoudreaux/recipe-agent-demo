"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AppHeader } from "@/components/app-header";
import { ChatPanel } from "@/components/chat-panel";
import { ArtifactPanel } from "@/components/artifact-panel";
import { type AgentMode } from "@/lib/agent-mode";

export function DashboardShell() {
  // Soft ingest/search mode. Lifted here so the header toggle, the chat panel,
  // and the request body all share it.
  const [mode, setMode] = React.useState<AgentMode>("ingest");

  // The agent reads the CURRENT mode/menuId on each send. Refs (not deps) keep
  // a single stable transport while always sending live values.
  const modeRef = React.useRef(mode);
  modeRef.current = mode;
  const menuIdRef = React.useRef<string | null>(null);

  // Mode bias is plumbed here: the transport's request-preparation hook adds
  // `mode` and `menuId` as body fields alongside the messages. The agent uses
  // them to bias its system prompt — it never restricts tools (soft modes).
  const transport = React.useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            ...body,
            messages,
            mode: modeRef.current,
            menuId: menuIdRef.current,
          },
        }),
      }),
    [],
  );

  const chat = useChat({ transport });

  // Lift useChat up so chat (left) and artifact panel (right) read one message
  // list: the panel derives the streaming recipe from the agent's tool parts.
  return (
    <div className="flex h-screen min-h-0 flex-col bg-muted/30">
      <AppHeader mode={mode} onModeChange={setMode} />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(340px,33%)_1fr]">
        <ChatPanel
          mode={mode}
          messages={chat.messages}
          sendMessage={chat.sendMessage}
          status={chat.status}
          stop={chat.stop}
          setMessages={chat.setMessages}
        />
        <ArtifactPanel messages={chat.messages} status={chat.status} />
      </main>
    </div>
  );
}
