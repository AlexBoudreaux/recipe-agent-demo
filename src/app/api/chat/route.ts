import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { buildRecipeAgent } from "@/lib/recipe-agent";
import type { AgentMode } from "@/lib/agent-mode";

// Ingest can run fetch + LLM extraction + embedding + save in one turn. The
// cover image is fire-and-forget so it doesn't count. Give it generous head-
// room (Vercel's default function timeout is now 300s; this stays well under).
export const maxDuration = 120;

interface ChatRequestBody {
  messages: UIMessage[];
  /** Soft mode pointer sent by the client transport. Biases the agent. */
  mode?: AgentMode;
  /** The chef's active menu, so the agent reuses it across planning turns. */
  menuId?: string | null;
  /** Authoritative plan selections sent when the chef hits "Generate plan". */
  planServings?: number | null;
  planUnitSystem?: "metric" | "imperial" | null;
  planTechniqueIds?: string[] | null;
}

export async function POST(req: Request) {
  const {
    messages,
    mode = "ingest",
    menuId = null,
    planServings = null,
    planUnitSystem = null,
    planTechniqueIds = null,
  } = (await req.json()) as ChatRequestBody;

  const agent = buildRecipeAgent({
    mode,
    menuId,
    planServings,
    planUnitSystem,
    planTechniqueIds,
  });

  // Wires the ToolLoopAgent to a UI message stream: it converts the incoming
  // UI messages, runs the tool loop, and streams assistant text + tool parts
  // (including the preliminary, streaming fetch_and_extract output) back.
  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
  });
}
