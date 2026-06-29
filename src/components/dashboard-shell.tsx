"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { MessageSquareIcon } from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { ChatPanel } from "@/components/chat-panel";
import { ArtifactPanel } from "@/components/artifact-panel";
import { type AgentMode } from "@/lib/agent-mode";
import { latestMenuId } from "@/lib/menu-derive";
import type { PlanControls, UnitSystem } from "@/lib/act3";

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

  // The active menu is whatever the agent last touched (derived from the tool
  // transcript) UNLESS the chef explicitly picked one in the header switcher.
  // The manual pick (override) wins until the agent touches a different menu, at
  // which point we drop the override and follow the agent again — so a freshly
  // created/added menu always becomes active without fighting the switcher.
  const derivedMenuId = React.useMemo(
    () => latestMenuId(chat.messages),
    [chat.messages],
  );
  const [menuOverride, setMenuOverride] = React.useState<string | null>(null);
  const [seenDerived, setSeenDerived] = React.useState(derivedMenuId);
  if (derivedMenuId !== seenDerived) {
    setSeenDerived(derivedMenuId);
    setMenuOverride(null);
  }
  const menuId = menuOverride ?? derivedMenuId;

  // Bumped whenever the chef picks a menu in the header, so the artifact panel
  // jumps to that menu's workspace (it otherwise only follows the transcript).
  const [menuNonce, setMenuNonce] = React.useState(0);
  const selectMenu = React.useCallback((id: string) => {
    setMenuOverride(id);
    setMenuNonce((n) => n + 1);
  }, []);

  // When the active menu is deleted, drop the override so the panel stops
  // forcing a now-missing menu and falls back to whatever the transcript derives.
  const handleMenuDeleted = React.useCallback(
    (deletedId: string) => {
      if (deletedId === menuId) setMenuOverride(null);
    },
    [menuId],
  );

  // Inject the live mode (soft bias) + active menuId into each send's body.
  const sendMessage = React.useCallback<typeof chat.sendMessage>(
    (message, options) =>
      chat.sendMessage(message, {
        ...options,
        body: { ...options?.body, mode, menuId },
      }),
    [chat, mode, menuId],
  );

  // "New menu" stays conversational (single-agent architecture): the agent owns
  // creation + naming, so we just ask it to start one.
  const newMenu = React.useCallback(() => {
    if (chat.status === "submitted" || chat.status === "streaming") return;
    sendMessage({ text: "Start a new, empty menu." });
  }, [chat.status, sendMessage]);

  // --- ACT 3 planning controls, lifted here so they survive the
  // generate -> plan -> back-to-menu round trip (a conflict can only be resolved
  // if the chef's technique toggles are still set when they return to the menu).
  const [servings, setServings] = React.useState<number | null>(null);
  const [unitSystem, setUnitSystem] = React.useState<UnitSystem>("imperial");
  const [selectedTechniqueIds, setSelectedTechniqueIds] = React.useState<
    string[]
  >([]);
  const toggleTechnique = React.useCallback((id: string) => {
    setSelectedTechniqueIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const busy = chat.status === "submitted" || chat.status === "streaming";

  // The action buttons ask the AGENT to run the tool (single-agent architecture):
  // a precise instruction in chat + authoritative selection values in the body
  // the agent must pass to build_menu_plan verbatim.
  const generatePlan = React.useCallback(
    (planServings: number) => {
      if (busy) return;
      const ids = selectedTechniqueIds;
      const text =
        `Generate the menu plan: ${planServings} servings, ${unitSystem} units, ` +
        (ids.length
          ? `apply ONLY these technique ids and no others: ${ids.join(", ")}.`
          : "apply no techniques.");
      sendMessage(
        { text },
        {
          body: {
            planServings,
            planUnitSystem: unitSystem,
            planTechniqueIds: ids,
          },
        },
      );
    },
    [busy, selectedTechniqueIds, unitSystem, sendMessage],
  );

  const addRecipe = React.useCallback(
    (recipeId: string, title: string) => {
      if (busy) return;
      sendMessage({
        text: `Add the side "${title}" (recipe id ${recipeId}) to my menu.`,
      });
    },
    [busy, sendMessage],
  );

  const controls: PlanControls = {
    servings,
    setServings,
    unitSystem,
    setUnitSystem,
    selectedTechniqueIds,
    toggleTechnique,
    busy,
    generatePlan,
    addRecipe,
  };

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
      <AppHeader
        activeMenuId={menuId}
        onSelectMenu={selectMenu}
        onNewMenu={newMenu}
        onMenuDeleted={handleMenuDeleted}
      />
      <main className="relative min-h-0 flex-1 overflow-hidden">
        <ArtifactPanel
          messages={chat.messages}
          status={chat.status}
          reservedRight={chatOpen ? chatWidth + DOCK_GAP : 0}
          controls={controls}
          activeMenuId={menuId}
          openMenuNonce={menuNonce}
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
