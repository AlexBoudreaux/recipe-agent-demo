"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { SparklesIcon } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { RecipeCard, type RecipeView } from "@/components/recipe-card";
import type {
  CandidateRecipe,
  ExtractEvent,
  PartialCandidate,
  SaveRecipeResult,
} from "@/lib/artifact-types";

const norm = (s?: string) => (s ?? "").trim().toLowerCase();

type ToolPart = {
  type: string;
  state?: string;
  preliminary?: boolean;
  output?: unknown;
};

type Artifact = {
  phase: "idle" | "fetching" | "extracting" | "ready";
  candidates: Array<CandidateRecipe | PartialCandidate>;
  savedByTitle: Map<string, string>;
};

/**
 * Derive the artifact-panel state from the agent's tool parts. One pass over the
 * messages: the latest fetch_and_extract drives the streaming card; every
 * save_recipe output records a saved id (keyed by title) so the panel can swap a
 * draft for its reactive Convex row. Errors/empties are ignored here — the chat
 * surfaces those — so a bad link never wipes a good card.
 */
function deriveArtifact(messages: UIMessage[]): Artifact {
  let phase: Artifact["phase"] = "idle";
  let candidates: Artifact["candidates"] = [];
  const savedByTitle = new Map<string, string>();

  for (const m of messages) {
    for (const raw of m.parts) {
      const part = raw as unknown as ToolPart;

      if (part.type === "tool-fetch_and_extract") {
        if (part.state === "input-streaming" || part.state === "input-available") {
          // The model is still composing the call (or it's queued): a fetch is
          // imminent. Show the building state without dropping a prior card yet.
          if (phase === "idle") phase = "fetching";
          continue;
        }
        if (part.state === "output-available" && part.output) {
          const ev = part.output as ExtractEvent;
          if (ev.status === "fetching") {
            phase = "fetching";
            candidates = [];
          } else if (ev.status === "extracting") {
            phase = "extracting";
            candidates = ev.candidates;
          } else if (ev.status === "ready") {
            phase = "ready";
            candidates = ev.candidates;
          }
          // error | empty: leave the prior card in place (chat explains it).
        }
      }

      if (
        part.type === "tool-save_recipe" &&
        part.state === "output-available" &&
        !part.preliminary &&
        part.output
      ) {
        const out = part.output as SaveRecipeResult;
        if (out.savedRecipeId) savedByTitle.set(norm(out.title), out.savedRecipeId);
      }
    }
  }

  return { phase, candidates, savedByTitle };
}

function candidateToView(c: CandidateRecipe | PartialCandidate): RecipeView {
  return {
    title: c.title,
    category: c.category,
    summary: c.summary,
    yield: c.yield,
    ingredients: c.ingredients,
    steps: c.steps,
    tags: c.tags?.filter((t): t is string => typeof t === "string"),
  };
}

export function ArtifactPanel({
  messages,
  status,
}: {
  messages: UIMessage[];
  status: UseChatHelpers<UIMessage>["status"];
}) {
  const { phase, candidates, savedByTitle } = React.useMemo(
    () => deriveArtifact(messages),
    [messages],
  );

  // Reset focus to the first candidate whenever a new extraction arrives.
  const identity = candidates.map((c) => norm(c.title)).join("|");
  const [focused, setFocused] = React.useState(0);
  React.useEffect(() => {
    setFocused(0);
  }, [identity]);

  const focusedCandidate = candidates[Math.min(focused, candidates.length - 1)];
  const savedId = focusedCandidate
    ? savedByTitle.get(norm(focusedCandidate.title))
    : undefined;

  // The saved row is the source of truth once it exists. "skip" until we have an
  // id; the reactive query then streams in the cover image when it lands.
  const savedRow = useQuery(
    api.recipes.getRecipe,
    savedId ? { recipeId: savedId as Id<"recipes"> } : "skip",
  );

  const hasArtifact = candidates.length > 0 || phase === "fetching";

  return (
    <Card className="flex h-full min-h-0 flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 border-b py-3">
        <div>
          <p className="text-sm font-medium leading-none">Artifact</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Recipes build here live as they&apos;re captured
          </p>
        </div>
        {candidates.length > 1 ? (
          <Badge variant="secondary">{candidates.length} recipes found</Badge>
        ) : phase === "ready" || savedId ? (
          <Badge variant="secondary">1 recipe</Badge>
        ) : phase === "fetching" || phase === "extracting" ? (
          <Badge variant="secondary">Building…</Badge>
        ) : (
          <Badge variant="secondary">Empty</Badge>
        )}
      </CardHeader>

      <CardContent className="min-h-0 flex-1 p-0">
        {!hasArtifact ? (
          <EmptyState />
        ) : (
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-4">
              {/* Multi-recipe chooser. The agent also asks in chat; this mirrors
                  the options visually and lets the user eyeball each one. */}
              {candidates.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {candidates.map((c, i) => {
                    const isSaved = savedByTitle.has(norm(c.title));
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setFocused(i)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          i === focused
                            ? "border-brand bg-brand/10 text-brand"
                            : "bg-card text-muted-foreground hover:bg-accent",
                        )}
                      >
                        {c.title ?? `Recipe ${i + 1}`}
                        {isSaved ? " ✓" : ""}
                      </button>
                    );
                  })}
                </div>
              )}

              <RecipeCard
                recipe={
                  savedRow
                    ? {
                        title: savedRow.title,
                        category: savedRow.category,
                        summary: savedRow.summary,
                        yield: savedRow.yield,
                        ingredients: savedRow.ingredients,
                        steps: savedRow.steps,
                        tags: savedRow.tags,
                        imageUrl: savedRow.imageUrl,
                      }
                    : focusedCandidate
                      ? candidateToView(focusedCandidate)
                      : {}
                }
                status={
                  savedRow
                    ? "saved"
                    : savedId
                      ? "saving"
                      : phase === "ready"
                        ? "draft"
                        : "streaming"
                }
              />

              {status === "streaming" && phase === "ready" && (
                <p className="px-1 text-center text-xs text-muted-foreground">
                  Recipe extracted. The agent is deciding what to do next…
                </p>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <SparklesIcon className="size-5" />
        </div>
        <p className="text-sm font-medium">Nothing here yet</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Paste a recipe blog or YouTube link in the chat. The extracted recipe
          streams into this panel as it&apos;s built, then settles onto the saved
          copy with its cover photo.
        </p>
      </div>
    </div>
  );
}
