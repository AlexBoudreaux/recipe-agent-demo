/**
 * Shared shapes for the streaming artifact panel.
 *
 * These are the wire types that travel from the agent's tools (server) to the
 * artifact panel (client) as tool-output parts on the UI message stream. They
 * import ONLY pure domain types (no `ai`/Convex/server modules) so the client
 * bundle stays clean. The server tool definitions in `recipe-agent-tools.ts`
 * produce exactly these; the panel in `artifact-panel.tsx` consumes them.
 */
import type { AddedIngredient, Category, Ingredient, Unit } from "./types";
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

// ---------------------------------------------------------------------------
// Techniques — mirror the recipe shapes so the panel renders a TECHNIQUE card
// through the SAME streaming + saved??draft pattern. The `kind` discriminator on
// the events lets one deriveArtifact pass tell recipe streams from technique
// streams without guessing.
// ---------------------------------------------------------------------------

/** A fully-extracted technique candidate, with a stable index the agent can cite. */
export interface CandidateTechnique {
  index: number;
  title: string;
  description: string;
  applicability: string;
  steps: string[];
  addedIngredients: AddedIngredient[];
  tags: string[];
}

/** A technique mid-stream: every field may still be missing or half-written. */
export interface PartialTechniqueCandidate {
  index: number;
  title?: string;
  description?: string;
  applicability?: string;
  steps?: string[];
  addedIngredients?: Array<{
    name?: string;
    quantity?: number;
    unit?: string;
  }>;
  tags?: string[];
}

/** The output of the fetch+extract-technique tool, streamed then final. */
export type TechniqueExtractEvent =
  | { kind: "technique"; status: "fetching"; sourceUrl: string }
  | {
      kind: "technique";
      status: "extracting";
      sourceType: SourceType;
      sourceUrl: string;
      sourceTitle?: string;
      candidates: PartialTechniqueCandidate[];
    }
  | {
      kind: "technique";
      status: "ready";
      sourceType: SourceType;
      sourceUrl: string;
      sourceTitle?: string;
      candidates: CandidateTechnique[];
    }
  | { kind: "technique"; status: "empty"; sourceUrl: string; message: string }
  | {
      kind: "technique";
      status: "error";
      code: string;
      message: string;
      sourceUrl: string;
    };

/** The output of the save-technique tool. The panel subscribes to Convex by id. */
export interface SaveTechniqueResult {
  savedTechniqueId: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Search — the agent's search-mode tool returns ranked recipe hits the panel
// renders as a grid (combined tag + meaning search, PRD stories 21-22).
// ---------------------------------------------------------------------------

/** One ranked recipe hit, slim enough to render a grid card. */
export interface SearchResultItem {
  id: string;
  title: string;
  category: Category;
  summary: string;
  tags: string[];
  imageUrl: string | null;
  score: number;
  meaningScore: number;
  sharedTags: string[];
}

/** The output of the search_recipes tool. */
export type SearchEvent = {
  kind: "search";
  query: string;
  results: SearchResultItem[];
};

// ---------------------------------------------------------------------------
// Menus & plans (ACT 3). The agent's menu/side/plan tools return these so 8B's
// menu + side-picker + plan UI can render them. Pure shapes only.
// ---------------------------------------------------------------------------

/** One suggested side plus why it pairs with the main (side-dish matcher). */
export interface SideSuggestionItem {
  id: string;
  title: string;
  summary: string;
  category: Category;
  tags: string[];
  imageUrl: string | null;
  reason: string;
}

/** The output of the generate_side_dishes tool. */
export type SideDishEvent = {
  kind: "sides";
  main: { id: string; title: string; tags: string[] };
  /** How many library sides survived the deterministic protein-overlap filter. */
  consideredCount: number;
  suggestions: SideSuggestionItem[];
};

/** One consolidated shopping line in a built plan. */
export interface PlanIngredientLine {
  name: string;
  quantity: number;
  unit: string;
  fromRecipeIds: string[];
}

/** One recipe's woven/scaled steps in a built plan. */
export interface PlanRecipeStepsItem {
  recipeId: string;
  title: string;
  steps: string[];
}

/** One store-area-grouped shopping section. */
export interface PlanShoppingGroup {
  area: string;
  items: Array<{ name: string; quantity: number; unit: string }>;
}

/** A flagged clash between two chosen techniques on one recipe. */
export interface PlanConflictItem {
  recipeId: string;
  recipeTitle: string;
  techniqueIds: string[];
  message: string;
}

/** The output of the build_menu_plan tool. The panel subscribes to Convex by id. */
export type PlanEvent = {
  kind: "plan";
  planId: string;
  version: number;
  menuId: string;
  servings: number;
  unitSystem: "metric" | "imperial";
  appliedTechniques: string[];
  consolidatedIngredients: PlanIngredientLine[];
  perRecipeSteps: PlanRecipeStepsItem[];
  shoppingList: PlanShoppingGroup[];
  conflicts: PlanConflictItem[];
};
