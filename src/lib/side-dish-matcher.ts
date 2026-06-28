/**
 * SideDishMatcher — given a main dish, suggest exactly three complementary
 * SIDES drawn from the chef's OWN seeded library (never invented).
 *
 * Two stages, in the spirit of the rest of the app: a DETERMINISTIC filter first,
 * then a thin LLM ranking pass.
 *   1. filterSideCandidates (pure, no LLM): keep only category=side recipes, drop
 *      the main itself, and EXCLUDE any side that shares a PROTEIN tag with the
 *      main (no shrimp side for a shrimp main, no pork side for a pork main). This
 *      is the trust guardrail — protein overlap is decided by code, not the model.
 *   2. rankSides (LLM): from the surviving candidates ONLY, pick the three that
 *      pair best and give a one-line reason each. The model never sees a recipe
 *      that isn't already in the library, so it cannot fabricate a side.
 *
 * PRD stories 27-29: complementary sides, from my own saved sides, three options
 * each with a reason it pairs well.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Category } from "./types";
import { chatModel } from "./model";
import { PROTEIN_TAGS } from "./tag-vocabulary";

const PROTEIN_SET = new Set<string>(PROTEIN_TAGS);

/** A side recipe as the matcher reasons over and returns it. */
export interface SideCandidate {
  id: string;
  title: string;
  summary: string;
  category: Category;
  tags: string[];
  imageUrl: string | null;
}

/** One suggested side plus why it pairs with the main. */
export interface SideSuggestion {
  recipe: SideCandidate;
  reason: string;
}

/** The full matcher result (also carries the main for the UI/agent context). */
export interface SideMatchResult {
  main: { id: string; title: string; tags: string[] };
  suggestions: SideSuggestion[];
  /** How many sides survived the deterministic filter (for explainability). */
  consideredCount: number;
}

/** The controlled PROTEIN tags a recipe carries — the overlap-exclusion key. */
export function proteinTagsOf(tags: string[]): string[] {
  return tags.filter((t) => PROTEIN_SET.has(t));
}

/**
 * DETERMINISTIC pre-filter (no LLM). From a pool of side recipes, keep only the
 * ones eligible to pair with `main`: not the main itself, and sharing NONE of the
 * main's protein tags. A shrimp main never gets a shrimp/shellfish side; a pork
 * main never gets the pork-laden twice-baked potatoes. Order is preserved so the
 * result is deterministic.
 */
export function filterSideCandidates(
  main: { id: string; tags: string[] },
  sides: SideCandidate[],
): SideCandidate[] {
  const mainProteins = new Set(proteinTagsOf(main.tags));
  return sides.filter((s) => {
    if (s.id === main.id) return false;
    return !proteinTagsOf(s.tags).some((p) => mainProteins.has(p));
  });
}

/** LLM ranking schema: pick from the supplied candidates by id, with a reason. */
const rankSchema = z.object({
  picks: z
    .array(
      z.object({
        id: z.string().describe("The id of a side, copied EXACTLY from the candidate list."),
        reason: z
          .string()
          .describe(
            "One short sentence on why this side pairs well with the main " +
              "(contrast in texture/richness, complementary flavors, balance).",
          ),
      }),
    )
    .describe("The best sides to pair, ordered best-first."),
});

function convexClient(provided?: ConvexHttpClient): ConvexHttpClient {
  if (provided) return provided;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set; cannot reach Convex.");
  }
  return new ConvexHttpClient(url);
}

export interface MatchSideDishesOptions {
  convex?: ConvexHttpClient;
  /** How many suggestions to return (default 3, capped by candidate count). */
  count?: number;
}

/**
 * Suggest complementary sides for a main recipe id. Loads the main and the
 * library's sides from Convex, applies the deterministic protein-overlap filter,
 * then asks the LLM to rank `count` of the survivors with a pairing reason each.
 *
 * Returns at most `count` suggestions (fewer only when the filtered library has
 * fewer eligible sides). Every suggested recipe is a real saved side.
 */
export async function matchSideDishes(
  mainRecipeId: string,
  options: MatchSideDishesOptions = {},
): Promise<SideMatchResult> {
  const convex = convexClient(options.convex);
  const count = options.count ?? 3;

  const main = await convex.query(api.recipes.getRecipe, {
    recipeId: mainRecipeId as Id<"recipes">,
  });
  if (!main) throw new Error(`Main recipe ${mainRecipeId} not found.`);

  const sideRows = await convex.query(api.recipes.findRecipes, {
    category: "side",
    limit: 200,
  });
  const sides: SideCandidate[] = sideRows.map((r) => ({
    id: r._id,
    title: r.title,
    summary: r.summary,
    category: r.category,
    tags: r.tags,
    imageUrl: null,
  }));

  const eligible = filterSideCandidates({ id: main._id, tags: main.tags }, sides);

  const result: SideMatchResult = {
    main: { id: main._id, title: main.title, tags: main.tags },
    suggestions: [],
    consideredCount: eligible.length,
  };

  if (eligible.length === 0) return result;

  // Rank the survivors. The model only ever sees real, eligible sides.
  const ranked = await rankSides(
    { title: main.title, summary: main.summary, tags: main.tags },
    eligible,
    count,
  );

  // Map the chosen ids back to full candidates, guarding against any stray id and
  // de-duplicating. Fall back to filtered order if the model returns too few.
  const byId = new Map(eligible.map((s) => [s.id, s]));
  const seen = new Set<string>();
  const suggestions: SideSuggestion[] = [];
  for (const pick of ranked) {
    const recipe = byId.get(pick.id);
    if (!recipe || seen.has(recipe.id)) continue;
    seen.add(recipe.id);
    suggestions.push({ recipe, reason: pick.reason.trim() });
    if (suggestions.length >= count) break;
  }
  for (const s of eligible) {
    if (suggestions.length >= count) break;
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    suggestions.push({ recipe: s, reason: "Complements the main from your library." });
  }

  result.suggestions = suggestions;
  return result;
}

/** Ask the LLM to rank up to `count` of the eligible sides with a reason each. */
async function rankSides(
  main: { title: string; summary: string; tags: string[] },
  candidates: SideCandidate[],
  count: number,
): Promise<Array<{ id: string; reason: string }>> {
  const target = Math.min(count, candidates.length);
  const prompt = [
    `You help a chef pick side dishes for a main course. Choose the ${target} sides from the CANDIDATES below that pair BEST with the main. Consider contrast and balance (a rich main wants a bright or crisp side, a starchy main wants something fresh, etc.).`,
    ``,
    `Rules:`,
    `- Pick ONLY from the candidate list. Use each side's id EXACTLY as given.`,
    `- Return exactly ${target} picks, best first, each with one short pairing reason.`,
    `- Never invent a side that is not in the list.`,
    ``,
    `MAIN: ${main.title}`,
    `Summary: ${main.summary}`,
    `Tags: ${main.tags.join(", ") || "none"}`,
    ``,
    `CANDIDATE SIDES:`,
    ...candidates.map(
      (s) => `- id=${s.id} | ${s.title} | tags=${s.tags.join(",") || "none"} | ${s.summary}`,
    ),
  ].join("\n");

  const { object } = await generateObject({
    model: chatModel,
    schema: rankSchema,
    prompt,
  });
  return object.picks;
}
