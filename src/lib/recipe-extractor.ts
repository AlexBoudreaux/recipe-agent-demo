/**
 * RecipeExtractor (LLM) — clean source text + provenance + an optional user
 * instruction -> one OR MORE structured Recipe objects.
 *
 * The hard guarantee this module exists to provide: the structured output is
 * SAFE for the deterministic downstream modules. Specifically:
 *  - `unit` is constrained, at the SCHEMA level, to exactly the canonical Unit
 *    string union (src/lib/types.ts). The UnitConverter only works on those
 *    exact strings, so the extractor must never emit "tablespoons"/"grams"/etc.
 *  - `category` is constrained to the Category enum.
 *  - `tags` are post-processed through TagVocabulary (assignTags) so what we
 *    store is guaranteed controlled-vocabulary, never raw LLM noise.
 *
 * A single source may contain several recipes (a roundup post, a video with two
 * dishes), so this always returns an array. Picking WHICH to save is the agent's
 * job (chunk 5B); here we extract everything found, narrowed only by an optional
 * user instruction.
 */
import { generateObject, streamObject, type DeepPartial } from "ai";
import { z } from "zod";
import { chatModel } from "./model";
import type { Category, Recipe, Unit } from "./types";
import { assignTags, CATEGORIES, DISH_TAGS, INGREDIENT_TAGS, PROTEIN_TAGS } from "./tag-vocabulary";
import type { SourceType } from "./source-fetcher";

/**
 * The canonical unit list. Kept here (not imported from a const) because the
 * type union in types.ts is types-only; this is the runtime mirror the Zod
 * enum is built from. If types.ts Unit changes, change this too — they MUST
 * stay in lockstep (the as-const + satisfies below makes a drift a type error).
 */
const UNITS = [
  // volume
  "tsp",
  "tbsp",
  "fl oz",
  "cup",
  "pint",
  "quart",
  "gallon",
  "ml",
  "l",
  // weight
  "oz",
  "lb",
  "g",
  "kg",
  // count / unitless
  "count",
  "pinch",
  "clove",
  "can",
  "bunch",
  "",
] as const satisfies readonly Unit[];

// Compile-time guard: every Unit literal must be present in UNITS (and vice
// versa). If types.ts Unit drifts from this list, one of these lines fails.
type _UnitsCoverAll = Exclude<Unit, (typeof UNITS)[number]> extends never
  ? true
  : ["UNITS missing", Exclude<Unit, (typeof UNITS)[number]>];
const _unitsCoverAll: _UnitsCoverAll = true;
void _unitsCoverAll;

/** Zod enum of canonical units. Exported so the technique extractor reuses the
 * exact same constrained unit set (one source of truth for added-ingredient units). */
export const unitEnum = z.enum(UNITS);
/** Runtime list of canonical units (excludes `""`/no-unit by default callers filter). */
export { UNITS };
const categoryEnum = z.enum(CATEGORIES as readonly [Category, ...Category[]]);

/** Ingredient as the LLM must return it. unit is hard-constrained to canon. */
const ingredientSchema = z.object({
  name: z.string().describe("Ingredient name only, no quantity (e.g. 'garlic')"),
  quantity: z
    .number()
    .describe("Numeric amount in the given unit. Use 1 for unitless items."),
  unit: unitEnum.describe("MUST be one of the canonical units."),
  // nullable (not optional): OpenAI strict structured outputs require every key
  // present in `required`, so use null to mean "no prep" and drop it on the way out.
  prep: z
    .string()
    .nullable()
    .describe("Preparation note like 'minced' or 'diced'. Use null if none."),
});

const recipeObjectSchema = z.object({
  title: z.string().describe("The dish name."),
  category: categoryEnum,
  summary: z
    .string()
    .describe("One or two sentences a cook can scan. Plain, appetizing, no fluff."),
  yield: z.object({
    amount: z.number().describe("How much it makes in the given unit."),
    unit: unitEnum.describe("Usually 'count' for servings; a canonical unit."),
  }),
  ingredients: z.array(ingredientSchema).min(1),
  steps: z.array(z.string().min(1)).min(1).describe("Ordered cooking steps."),
  tags: z
    .array(z.string())
    .describe(
      "Controlled-vocabulary tags only (see allowed list in the prompt).",
    ),
});

/**
 * One recipe object, exported for reuse as the save tool's input schema. The
 * agent passes a chosen candidate back through this same shape, so units stay
 * canonical and category stays in-enum even on the save path.
 */
export const recipeDataSchema = recipeObjectSchema;

/** The top-level shape: a source yields one or more recipes. */
const extractionSchema = z.object({
  recipes: z
    .array(recipeObjectSchema)
    .describe("Every distinct recipe found in the source, narrowed by any user instruction."),
});

/** An extracted, vocab-cleaned recipe. Mirrors the pure Recipe shape (no id/embedding yet). */
export interface ExtractedRecipe {
  title: string;
  category: Category;
  summary: string;
  yield: { amount: number; unit: Unit };
  ingredients: Recipe["ingredients"];
  steps: string[];
  /** Already passed through TagVocabulary — guaranteed controlled-vocab values. */
  tags: string[];
}

export interface ExtractRecipesInput {
  /** Clean text from SourceFetcher. */
  text: string;
  sourceType: SourceType;
  sourceUrl: string;
  /** Page/video title, used as a hint. */
  sourceTitle?: string;
  /** Optional natural-language narrowing ("just the spicy pasta, skip the salad"). */
  instruction?: string;
}

function buildPrompt(input: ExtractRecipesInput): string {
  const allowedTags = [...PROTEIN_TAGS, ...INGREDIENT_TAGS, ...DISH_TAGS].join(", ");
  const allowedUnits = UNITS.filter((u) => u !== "").join(", ") + ", or \"\" (no unit)";
  const allowedCategories = (CATEGORIES as readonly string[]).join(", ");
  return [
    `You extract structured recipes from messy source text (a cooking blog article or a video transcript).`,
    input.sourceTitle ? `Source title: ${input.sourceTitle}` : null,
    `Source type: ${input.sourceType}. Source URL: ${input.sourceUrl}`,
    ``,
    `RULES:`,
    `- A source may contain multiple distinct recipes. Extract EACH as its own object.`,
    `- A source may contain none (it's just commentary). Then return an empty list.`,
    `- For a video transcript, reconstruct the recipe from spoken instructions; ignore filler, sponsorships, and chit-chat.`,
    `- Quantities must be numbers. Convert fractions/ranges to a single number (e.g. "1 to 2 cloves" -> 1.5, "half" -> 0.5).`,
    `- Units MUST be exactly one of: ${allowedUnits}. Map any wording to these (tablespoon/tablespoons -> tbsp, teaspoon -> tsp, grams -> g, pound/pounds -> lb, ounce -> oz, fluid ounce -> "fl oz", liter -> l, milliliter -> ml, a whole item like "2 eggs" -> unit "count"). Never invent a unit outside this set.`,
    `- category MUST be one of: ${allowedCategories}.`,
    `- tags: choose ONLY from this controlled vocabulary, as many as truly apply (proteins + dish types): ${allowedTags}. Do not invent tags. Omit a tag rather than guess.`,
    `- summary: 1-2 plain sentences.`,
    input.instruction
      ? `\nUSER INSTRUCTION (narrow what you extract accordingly): ${input.instruction}`
      : null,
    ``,
    `SOURCE TEXT:`,
    input.text,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** One raw recipe object straight off the schema (pre-clean). */
type RawRecipe = z.infer<typeof recipeObjectSchema>;

/**
 * Fold one raw LLM recipe into a vocab-clean ExtractedRecipe. Centralizes the
 * trim + tag-vocabulary pass so the blocking and streaming paths agree exactly.
 * Tags are run through TagVocabulary and minted extensions are dropped, so what
 * we store is guaranteed in-vocab.
 */
export function cleanExtractedRecipe(r: RawRecipe): ExtractedRecipe {
  return {
    title: r.title.trim(),
    category: r.category,
    summary: r.summary.trim(),
    yield: { amount: r.yield.amount, unit: r.yield.unit },
    ingredients: r.ingredients.map((ing) => ({
      name: ing.name.trim(),
      quantity: ing.quantity,
      unit: ing.unit,
      ...(ing.prep && ing.prep.trim() ? { prep: ing.prep.trim() } : {}),
    })),
    steps: r.steps.map((s) => s.trim()).filter(Boolean),
    tags: assignTags(r.tags)
      .filter((a) => !a.extended)
      .map((a) => a.tag.value),
  };
}

/**
 * Extract every recipe found in a source as structured, vocab-clean objects.
 * Returns [] when the source contains no recipe. Tags are guaranteed controlled
 * vocabulary; units and category are schema-constrained to the canonical sets.
 */
export async function extractRecipes(
  input: ExtractRecipesInput,
): Promise<ExtractedRecipe[]> {
  const { object } = await generateObject({
    model: chatModel,
    schema: extractionSchema,
    prompt: buildPrompt(input),
  });
  return object.recipes.map(cleanExtractedRecipe);
}

/** A recipe as it looks mid-stream: every field may still be absent/partial. */
export type PartialExtractedRecipe = DeepPartial<RawRecipe>;

/**
 * The streaming twin of {@link extractRecipes}. Used by the agent's
 * fetch+extract tool so the recipe can build LIVE in the artifact panel. The
 * returned object exposes:
 *  - `partialRecipes`: an async iterable of the recipes-so-far (DeepPartial),
 *    re-emitted on every delta — feed these straight to the UI.
 *  - `final()`: resolves to the fully cleaned, vocab-safe ExtractedRecipe[] once
 *    the stream completes (the array the agent reasons over and saves).
 *
 * Same schema, prompt, and cleaning as the blocking path, so a recipe looks the
 * same whether it streamed in or not.
 */
export function streamExtractRecipes(input: ExtractRecipesInput): {
  partialRecipes: AsyncIterable<PartialExtractedRecipe[]>;
  final: () => Promise<ExtractedRecipe[]>;
} {
  const result = streamObject({
    model: chatModel,
    schema: extractionSchema,
    prompt: buildPrompt(input),
  });

  async function* partialRecipes(): AsyncIterable<PartialExtractedRecipe[]> {
    for await (const partial of result.partialObjectStream) {
      yield (partial.recipes ?? []).filter(Boolean) as PartialExtractedRecipe[];
    }
  }

  return {
    partialRecipes: partialRecipes(),
    final: async () => (await result.object).recipes.map(cleanExtractedRecipe),
  };
}
