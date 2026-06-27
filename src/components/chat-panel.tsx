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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AGENT_MODES, type AgentMode } from "@/lib/agent-mode";
import type { ExtractEvent } from "@/lib/artifact-types";

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

  if (part.type === "tool-find_recipes" || part.type === "tool-get_recipe") {
    return (
      <Chip icon={<SearchIcon className="size-3" />}>
        {done ? "Searched your library" : "Searching your library…"}
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
  messages: UIMessage[];
  sendMessage: UseChatHelpers<UIMessage>["sendMessage"];
  status: UseChatHelpers<UIMessage>["status"];
  stop: UseChatHelpers<UIMessage>["stop"];
  setMessages: UseChatHelpers<UIMessage>["setMessages"];
};

export function ChatPanel({
  mode,
  messages,
  sendMessage,
  status,
  stop,
  setMessages,
}: ChatPanelProps) {
  const [input, setInput] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const isBusy = status === "submitted" || status === "streaming";
  const hint = AGENT_MODES.find((m) => m.value === mode)?.hint;

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
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 border-b py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none">Chat</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={messages.length === 0 || isBusy}
          onClick={() => setMessages([])}
        >
          <Trash2Icon className="size-3.5" />
          Clear
        </Button>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 p-0">
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
                          "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                          m.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-foreground",
                        )}
                      >
                        {text}
                      </div>
                    )}
                    {m.role === "assistant" &&
                      !text &&
                      toolParts.length === 0 && (
                        <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                          …
                        </div>
                      )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </CardContent>

      <CardFooter className="shrink-0 border-t p-3">
        <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === "ingest"
                ? "Paste a link, or tell the agent what to capture…"
                : "Search your library…"
            }
            disabled={isBusy}
          />
          {isBusy ? (
            <Button type="button" size="icon" variant="secondary" onClick={stop}>
              <SquareIcon className="size-4" />
              <span className="sr-only">Stop</span>
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <ArrowUpIcon className="size-4" />
              <span className="sr-only">Send</span>
            </Button>
          )}
        </form>
      </CardFooter>
    </Card>
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
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <p className="text-sm font-medium">How can I help you cook?</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        I capture recipes from messy sources and help you find them again, while
        you stay in control.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-md border bg-card px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
