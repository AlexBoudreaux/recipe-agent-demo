"use client";

import * as React from "react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  ArrowUpIcon,
  SquareIcon,
  Trash2Icon,
  LoaderIcon,
  SearchIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  ChevronRightIcon,
  SparklesIcon,
  ChefHatIcon,
  ListChecksIcon,
  UtensilsCrossedIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ModeSwitch } from "@/components/mode-switch";
import { type AgentMode } from "@/lib/agent-mode";
import type { ExtractEvent } from "@/lib/artifact-types";
import { Markdown } from "@/components/markdown";

function messageText(parts: UIMessage["parts"]) {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => ("text" in p ? p.text : ""))
    .join("");
}

// A loose view of a tool UI part — enough to render a status line without
// pulling the agent's full generic type into the client bundle.
type ToolPartView = {
  type: string;
  state?: string;
  preliminary?: boolean;
  output?: unknown;
};

/** One short status chip for an agent tool call, so work is visible in chat. */
function ToolStatus({ part }: { part: ToolPartView }) {
  const done = part.state === "output-available" && !part.preliminary;

  if (part.type === "tool-fetch_and_extract") {
    if (done) {
      const out = part.output as ExtractEvent | undefined;
      if (out?.status === "ready") {
        const n = out.candidates.length;
        return (
          <Chip icon={<BookOpenIcon className="size-3" />}>
            {n === 1 ? "Extracted 1 recipe" : `Found ${n} recipes`}
          </Chip>
        );
      }
      if (out?.status === "empty") {
        return (
          <Chip icon={<AlertCircleIcon className="size-3" />}>
            No recipe in that source
          </Chip>
        );
      }
      if (out?.status === "error") {
        return (
          <Chip icon={<AlertCircleIcon className="size-3" />} tone="warn">
            Couldn&apos;t read the source
          </Chip>
        );
      }
    }
    return (
      <Chip icon={<LoaderIcon className="size-3 animate-spin" />}>
        Reading the source…
      </Chip>
    );
  }

  if (part.type === "tool-save_recipe") {
    return done ? (
      <Chip icon={<CheckCircle2Icon className="size-3" />} tone="ok">
        Saved to your library
      </Chip>
    ) : (
      <Chip icon={<LoaderIcon className="size-3 animate-spin" />}>Saving…</Chip>
    );
  }

  if (
    part.type === "tool-find_recipes" ||
    part.type === "tool-get_recipe" ||
    part.type === "tool-search_recipes"
  ) {
    return (
      <Chip icon={<SearchIcon className="size-3" />}>
        {done ? "Searched your library" : "Searching your library…"}
      </Chip>
    );
  }

  // --- Techniques ---
  if (part.type === "tool-fetch_and_extract_technique") {
    return (
      <Chip icon={done ? <SparklesIcon className="size-3" /> : <LoaderIcon className="size-3 animate-spin" />}>
        {done ? "Extracted technique" : "Reading the source…"}
      </Chip>
    );
  }
  if (part.type === "tool-save_technique") {
    return done ? (
      <Chip icon={<CheckCircle2Icon className="size-3" />} tone="ok">
        Saved &amp; attached to recipes
      </Chip>
    ) : (
      <Chip icon={<LoaderIcon className="size-3 animate-spin" />}>Saving…</Chip>
    );
  }

  // --- ACT 3: menus, sides, plans ---
  if (
    part.type === "tool-create_menu" ||
    part.type === "tool-add_recipe_to_menu" ||
    part.type === "tool-set_menu_servings"
  ) {
    return (
      <Chip icon={<ChefHatIcon className="size-3" />}>
        {part.type === "tool-create_menu"
          ? done
            ? "Started a menu"
            : "Starting a menu…"
          : done
            ? "Updated the menu"
            : "Updating the menu…"}
      </Chip>
    );
  }
  if (part.type === "tool-list_menus") {
    return (
      <Chip icon={done ? <ChefHatIcon className="size-3" /> : <LoaderIcon className="size-3 animate-spin" />}>
        {done ? "Checked your menus" : "Checking your menus…"}
      </Chip>
    );
  }
  if (part.type === "tool-generate_side_dishes") {
    return (
      <Chip icon={done ? <UtensilsCrossedIcon className="size-3" /> : <LoaderIcon className="size-3 animate-spin" />}>
        {done ? "Found side dishes" : "Finding sides…"}
      </Chip>
    );
  }
  if (part.type === "tool-build_menu_plan") {
    return (
      <Chip icon={done ? <ListChecksIcon className="size-3" /> : <LoaderIcon className="size-3 animate-spin" />} tone={done ? "ok" : "muted"}>
        {done ? "Built your plan" : "Building the plan…"}
      </Chip>
    );
  }

  return null;
}

function Chip({
  icon,
  children,
  tone = "muted",
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "muted" | "ok" | "warn";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
        tone === "ok" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        tone === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </div>
  );
}

type ChatPanelProps = {
  mode: AgentMode;
  onModeChange: (mode: AgentMode) => void;
  onCollapse: () => void;
  messages: UIMessage[];
  sendMessage: UseChatHelpers<UIMessage>["sendMessage"];
  status: UseChatHelpers<UIMessage>["status"];
  stop: UseChatHelpers<UIMessage>["stop"];
  setMessages: UseChatHelpers<UIMessage>["setMessages"];
};

export function ChatPanel({
  mode,
  onModeChange,
  onCollapse,
  messages,
  sendMessage,
  status,
  stop,
  setMessages,
}: ChatPanelProps) {
  const [input, setInput] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const isBusy = status === "submitted" || status === "streaming";

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-xl shadow-foreground/10 ring-1 ring-foreground/5 backdrop-blur-xl">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-gradient-to-b from-muted/40 to-transparent px-3 py-2.5">
        <ModeSwitch value={mode} onValueChange={onModeChange} />
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label="Clear conversation"
            disabled={messages.length === 0 || isBusy}
            onClick={() => setMessages([])}
          >
            <Trash2Icon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
            aria-label="Collapse chat"
            onClick={onCollapse}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full" viewportRef={scrollRef}>
          <div className="flex flex-col gap-4 p-4">
            {messages.length === 0 ? (
              <EmptyState mode={mode} onPick={setInput} />
            ) : (
              messages.map((m) => {
                const text = messageText(m.parts);
                const toolParts = m.parts.filter((p) =>
                  p.type.startsWith("tool-"),
                ) as unknown as ToolPartView[];

                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex flex-col gap-1.5",
                      m.role === "user" ? "items-end" : "items-start",
                    )}
                  >
                    {m.role === "assistant" && toolParts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {toolParts.map((p, i) => (
                          <ToolStatus key={i} part={p} />
                        ))}
                      </div>
                    )}
                    {text && (
                      <div
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                          m.role === "user"
                            ? "whitespace-pre-wrap rounded-br-md bg-brand text-brand-foreground"
                            : "rounded-bl-md bg-muted text-foreground ring-1 ring-border/60",
                        )}
                      >
                        {m.role === "user" ? text : <Markdown>{text}</Markdown>}
                      </div>
                    )}
                    {m.role === "assistant" &&
                      !text &&
                      toolParts.length === 0 && (
                        <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-muted px-3.5 py-2 text-sm text-muted-foreground ring-1 ring-border/60">
                          <LoaderIcon className="size-3.5 animate-spin" />
                          Thinking…
                        </div>
                      )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="shrink-0 border-t border-border/70 bg-gradient-to-t from-muted/40 to-transparent p-3">
        <form
          onSubmit={handleSubmit}
          className="flex w-full items-center gap-2 rounded-xl border border-border/70 bg-background p-1 pl-3 shadow-sm focus-within:ring-2 focus-within:ring-ring/40"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === "ingest"
                ? "Paste a link, or tell the agent what to capture…"
                : "Search your library…"
            }
            disabled={isBusy}
            className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {isBusy ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-8 shrink-0 rounded-lg"
              onClick={stop}
            >
              <SquareIcon className="size-4" />
              <span className="sr-only">Stop</span>
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="size-8 shrink-0 rounded-lg"
              disabled={!input.trim()}
            >
              <ArrowUpIcon className="size-4" />
              <span className="sr-only">Send</span>
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}

function EmptyState({
  mode,
  onPick,
}: {
  mode: AgentMode;
  onPick: (text: string) => void;
}) {
  const suggestions =
    mode === "ingest"
      ? [
          "Save the spicy pasta from this blog post",
          "Grab the recipe from this YouTube video",
        ]
      : ["What can I make with shrimp?", "Show me my saved side dishes"];

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      <div className="relative flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand/65 text-brand-foreground shadow-md shadow-brand/25 ring-1 ring-brand/30">
        <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/25 to-transparent" />
        <BookOpenIcon className="size-6" />
      </div>
      <p className="font-heading text-base font-semibold tracking-tight">
        How can I help you cook?
      </p>
      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
          Try
        </p>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="group flex items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-left text-sm text-foreground shadow-sm transition-all hover:border-brand/40 hover:bg-accent"
          >
            <ArrowUpIcon className="size-3.5 shrink-0 rotate-45 text-muted-foreground transition-colors group-hover:text-brand" />
            <span className="leading-snug">{s}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
