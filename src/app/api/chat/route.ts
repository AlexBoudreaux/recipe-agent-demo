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
  /** Threaded for later menu/plan chunks; unused in ACT 1. */
  menuId?: string | null;
}

export async function POST(req: Request) {
  const { messages, mode = "ingest", menuId = null } =
    (await req.json()) as ChatRequestBody;

  const agent = buildRecipeAgent({ mode, menuId });

  // Wires the ToolLoopAgent to a UI message stream: it converts the incoming
  // UI messages, runs the tool loop, and streams assistant text + tool parts
  // (including the preliminary, streaming fetch_and_extract output) back.
  return createAgentUIStreamResponse({
    agent,
    uiMessages: messages,
  });
}
