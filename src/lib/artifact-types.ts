/**
 * Shared shapes for the streaming artifact panel.
 *
 * These are the wire types that travel from the agent's tools (server) to the
 * artifact panel (client) as tool-output parts on the UI message stream. They
 * import ONLY pure domain types (no `ai`/Convex/server modules) so the client
 * bundle stays clean. The server tool definitions in `recipe-agent-tools.ts`
 * produce exactly these; the panel in `artifact-panel.tsx` consumes them.
 */
import type { Category, Ingredient, Unit } from "./types";
import type { SourceType } from "./source-fetcher";

/** A fully-extracted recipe candidate, with a stable index the agent can cite. */
export interface CandidateRecipe {
  index: number;
  title: string;
  category: Category;
  summary: string;
  yield: { amount: number; unit: Unit };
  ingredients: Ingredient[];
  steps: string[];
  tags: string[];
}

/**
 * A candidate mid-stream: every field may still be missing or half-written. The
 * card renders these defensively (skeletons for absent fields) so the user
 * literally watches the recipe assemble.
 */
export interface PartialCandidate {
  index: number;
  title?: string;
  category?: string;
  summary?: string;
  yield?: { amount?: number; unit?: string };
  ingredients?: Array<{
    name?: string;
    quantity?: number;
    unit?: string;
    prep?: string | null;
  }>;
  steps?: string[];
  tags?: string[];
}

/** The output of the fetch+extract tool, streamed (preliminary) then final. */
export type ExtractEvent =
  | { status: "fetching"; sourceUrl: string }
  | {
      status: "extracting";
      sourceType: SourceType;
      sourceUrl: string;
      sourceTitle?: string;
      candidates: PartialCandidate[];
    }
  | {
      status: "ready";
      sourceType: SourceType;
      sourceUrl: string;
      sourceTitle?: string;
      candidates: CandidateRecipe[];
    }
  | { status: "empty"; sourceUrl: string; message: string }
  | { status: "error"; code: string; message: string; sourceUrl: string };

/** The output of the save tool. The panel uses the id to subscribe to Convex. */
export interface SaveRecipeResult {
  savedRecipeId: string;
  title: string;
}
