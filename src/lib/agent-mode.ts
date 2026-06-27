/**
 * The two SOFT agent modes. The toggle only biases the agent (system prompt and
 * which tools are emphasized); it never restricts what the agent can do. Wiring
 * this into the request body and system prompt comes in a later chunk. For now
 * it just renders and holds state.
 */
export type AgentMode = "ingest" | "search";

export const AGENT_MODES: { value: AgentMode; label: string; hint: string }[] = [
  {
    value: "ingest",
    label: "Ingest",
    hint: "Paste a blog or YouTube link to capture a recipe or technique",
  },
  {
    value: "search",
    label: "Search",
    hint: "Find recipes in your library by ingredient, type, or meaning",
  },
];
