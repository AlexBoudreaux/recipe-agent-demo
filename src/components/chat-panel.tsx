"use client";

import * as React from "react";
import { useChat } from "@ai-sdk/react";
import { ArrowUpIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { AGENT_MODES, type AgentMode } from "@/lib/agent-mode";

function messageText(parts: { type: string; text?: string }[]) {
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

export function ChatPanel({ mode }: { mode: AgentMode }) {
  const { messages, sendMessage, status, stop, setMessages } = useChat();
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
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {messageText(m.parts) || (
                      <span className="text-muted-foreground">…</span>
                    )}
                  </div>
                </div>
              ))
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
          "Grab the shrimp brining technique from this video",
        ]
      : [
          "What can I make with shrimp?",
          "Find me a quick weeknight side dish",
        ];

  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <p className="text-sm font-medium">How can I help you cook?</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        I capture recipes and techniques from messy sources and help you plan
        meals, while you stay in control.
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
