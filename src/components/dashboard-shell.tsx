"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { MessageSquareIcon } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ChatPanel } from "@/components/chat-panel";
import { ArtifactPanel } from "@/components/artifact-panel";
import { type AgentMode } from "@/lib/agent-mode";

const MIN_CHAT_WIDTH = 340;
const MAX_CHAT_WIDTH = 640;
const DEFAULT_CHAT_WIDTH = 420;
const DOCK_GAP = 16; // px between the canvas content and the floating dock

export function DashboardShell() {
  // Soft ingest/search mode. Lifted here so the chat panel and the request body
  // both share it.
  const [mode, setMode] = React.useState<AgentMode>("ingest");

  // Floating chat dock: open/closed + user-resizable width. The ref mirrors the
  // width so the drag handler can read the start value without a stale closure.
  const [chatOpen, setChatOpen] = React.useState(true);
  const [chatWidth, setChatWidthState] = React.useState(DEFAULT_CHAT_WIDTH);
  const chatWidthRef = React.useRef(DEFAULT_CHAT_WIDTH);
  const setChatWidth = React.useCallback((w: number) => {
    chatWidthRef.current = w;
    setChatWidthState(w);
  }, []);

  // Threaded for later menu/plan chunks; null until menus land.
  const menuId: string | null = null;

  // One stable transport, built once. Its request-prep hook just forwards the
  // per-send `body` (which carries the live mode/menuId) alongside the messages —
  // no refs, no render-time state reads, so a mode change never tears down
  // useChat. The mode itself is injected at SEND time (see `sendMessage` below).
  const [transport] = React.useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({
          messages,
          body,
        }: {
          messages: UIMessage[];
          body?: object;
        }) => ({ body: { ...body, messages } }),
      }),
  );

  const chat = useChat({ transport });

  // Inject the live mode (soft bias) into each send's body. `mode` is plain
  // state, so the agent always sees the current toggle without any ref plumbing.
  const sendMessage = React.useCallback<typeof chat.sendMessage>(
    (message, options) =>
      chat.sendMessage(message, {
        ...options,
        body: { ...options?.body, mode, menuId },
      }),
    [chat, mode, menuId],
  );

  // Drag-to-resize the dock from its left edge. Dragging left widens it. The
  // move/end handlers are stored in refs so the start handler can wire and
  // unwire them without a circular dependency between the callbacks.
  const onResizeStart = React.useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = chatWidthRef.current;

    const onMove = (ev: PointerEvent) => {
      const delta = startX - ev.clientX;
      setChatWidth(
        Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, startWidth + delta)),
      );
    };
    const onEnd = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
  }, [setChatWidth]);

  // The canvas is the primary surface. The chat floats on top of it (right),
  // so reserve just enough room that streaming recipes never hide under it.
  return (
    <div className="flex h-screen min-h-0 flex-col bg-background">
      <AppHeader />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <ArtifactPanel
          messages={chat.messages}
          status={chat.status}
          reservedRight={chatOpen ? chatWidth + DOCK_GAP : 0}
        />

        {chatOpen ? (
          <div
            className="absolute bottom-4 right-4 top-4 z-20"
            style={{ width: chatWidth }}
          >
            {/* Resize handle on the left edge of the dock */}
            <div
              onPointerDown={onResizeStart}
              className="group absolute -left-2 top-0 z-10 flex h-full w-4 cursor-col-resize items-center justify-center"
              role="separator"
              aria-label="Resize chat"
            >
              <div className="h-12 w-1 rounded-full bg-border transition-colors group-hover:bg-brand/60" />
            </div>
            <ChatPanel
              mode={mode}
              onModeChange={setMode}
              onCollapse={() => setChatOpen(false)}
              messages={chat.messages}
              sendMessage={sendMessage}
              status={chat.status}
              stop={chat.stop}
              setMessages={chat.setMessages}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="absolute bottom-6 right-6 z-20 flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-medium text-brand-foreground shadow-xl shadow-brand/25 ring-1 ring-brand/20 transition-transform hover:scale-105"
          >
            <MessageSquareIcon className="size-4" />
            Chat
          </button>
        )}
      </main>
    </div>
  );
}
