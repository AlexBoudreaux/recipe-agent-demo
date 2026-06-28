/**
 * TechniqueExtractor (LLM) — clean source text + provenance + an optional user
 * instruction -> one OR MORE structured Technique objects.
 *
 * A "technique" is reusable cooking know-how that can later be woven INTO a
 * recipe (a salt+baking-soda brine for snappier shrimp, a reverse sear for
 * steak, a cold-start for pasta). Unlike a recipe it is not a whole dish; it is
 * a transferable method plus the ingredients it ADDS.
 *
 * Mirrors recipe-extractor.ts deliberately so the two ingest paths read the
 * same. The hard guarantees this module provides for the deterministic
 * downstream layers:
 *  - addedIngredients[].unit is schema-constrained to the canonical Unit union
 *    (reuses recipe-extractor's `unitEnum`), so saved techniques never carry a
 *    free-text unit the UnitConverter can't handle.
 *  - tags are post-processed through TagVocabulary (assignTags) so they are
 *    guaranteed controlled-vocabulary. These tags are the AssociationEngine's
 *    overlap guardrail, so they MUST be from the same vocabulary as recipe tags.
 *
 * The `applicability` field is the most important one: it is a TEXT description
 * of WHEN/WHAT this technique applies to (e.g. "snappier, crunchier texture for
 * shrimp and other shellfish"). It is embedded (see ingest-technique.ts) and is
 * what drives semantic association to recipes — so the prompt pushes the model
 * to make it specific about ingredients/dishes, not vague.
 *
 * Extraction is INSTRUCTION-DRIVEN. In real use the user names what they want
 * ("extract the shrimp brine"), so when an instruction is present we extract
 * ONLY the technique(s) it names — usually one. With no instruction we still
 * bias hard to the 1-2 most significant transferable techniques, never a pile
 * of micro-tips. Picking among any returned candidates is the agent's job.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { chatModel } from "./model";
import type { AddedIngredient, Unit } from "./types";
import { assignTags, DISH_TAGS, INGREDIENT_TAGS, PROTEIN_TAGS } from "./tag-vocabulary";
import { unitEnum, UNITS } from "./recipe-extractor";
import type { SourceType } from "./source-fetcher";

/** Ingredient a technique ADDS. Mirrors AddedIngredient (no prep), canon unit. */
const addedIngredientSchema = z.object({
  name: z.string().describe("Ingredient name only, no quantity (e.g. 'baking soda')."),
  quantity: z
    .number()
    .describe("Numeric amount in the given unit. Use 1 for unitless items."),
  unit: unitEnum.describe("MUST be one of the canonical units."),
});

const techniqueObjectSchema = z.object({
  title: z.string().describe("Short name for the technique (e.g. 'Salt + Baking Soda Shrimp Brine')."),
  description: z
    .string()
    .describe("1-3 sentences explaining what the technique does and how, so a cook understands it at a glance."),
  applicability: z
    .string()
    .describe(
      "A SPECIFIC text description of WHEN and to WHAT this technique applies — " +
        "name the ingredients, proteins, or dish types it suits and the result it " +
        "produces. E.g. 'snappier, crunchier texture for shrimp and other shellfish " +
        "before searing or grilling'. Be concrete; this drives matching to recipes.",
    ),
  steps: z.array(z.string().min(1)).min(1).describe("Ordered steps to perform the technique."),
  addedIngredients: z
    .array(addedIngredientSchema)
    .describe("Ingredients the technique introduces (may be empty if it adds none)."),
  tags: z
    .array(z.string())
    .describe("Controlled-vocabulary tags only (see allowed list in the prompt). The proteins/dish types this applies to."),
});

/** One technique object, exported for reuse as a save tool's input schema. */
export const techniqueDataSchema = techniqueObjectSchema;

/** Top-level shape: a source yields one or more techniques. */
const extractionSchema = z.object({
  techniques: z
    .array(techniqueObjectSchema)
    .describe("Every distinct reusable technique found in the source, narrowed by any user instruction."),
});

/** An extracted, vocab-cleaned technique. Mirrors the pure Technique shape (no id/embedding yet). */
export interface ExtractedTechnique {
  title: string;
  description: string;
  applicability: string;
  steps: string[];
  addedIngredients: AddedIngredient[];
  /** Already passed through TagVocabulary — guaranteed controlled-vocab values. */
  tags: string[];
}

export interface ExtractTechniquesInput {
  /** Clean text from SourceFetcher. */
  text: string;
  sourceType: SourceType;
  sourceUrl: string;
  /** Page/video title, used as a hint. */
  sourceTitle?: string;
  /** Optional natural-language narrowing ("just the brine, skip the plating tip"). */
  instruction?: string;
}

function buildPrompt(input: ExtractTechniquesInput): string {
  const allowedTags = [...PROTEIN_TAGS, ...INGREDIENT_TAGS, ...DISH_TAGS].join(", ");
  const allowedUnits = UNITS.filter((u) => u !== "").join(", ") + ', or "" (no unit)';
  // Instruction-driven is the COMMON case in real use: the user almost always
  // says "extract the shrimp brine from this video", not "extract everything".
  // When an instruction is present we extract ONLY what it names (usually one
  // technique). With none, we still bias HARD to the 1-2 most significant,
  // transferable techniques — never a pile of micro-tips.
  const scopeRules = input.instruction
    ? [
        `SCOPE — the user gave an explicit instruction, so extract ONLY the technique(s) it names — typically ONE, occasionally two. Do NOT enumerate every other tip mentioned in the source. If the named technique isn't present, return an empty list rather than substituting a different one.`,
      ]
    : [
        `SCOPE — no explicit instruction. Extract only the 1-2 MOST significant, broadly transferable techniques in the source. Prefer the single signature method over a pile of minor tips. Never return more than two. If nothing is genuinely reusable, return an empty list.`,
      ];
  return [
    `You extract reusable COOKING TECHNIQUES from messy source text (a cooking blog article or a video transcript).`,
    input.sourceTitle ? `Source title: ${input.sourceTitle}` : null,
    `Source type: ${input.sourceType}. Source URL: ${input.sourceUrl}`,
    ``,
    `WHAT IS A TECHNIQUE: a reusable method/trick that improves a dish and can be applied to OTHER recipes — a brine, a sear method, a dough hydration trick, a sauce-emulsification step. It is NOT a whole recipe/dish. Capture the transferable know-how plus any ingredients it ADDS. Make it a CLEAN, complete method: good ordered steps, the ingredients it adds, and a specific applicability.`,
    ``,
    ...scopeRules,
    ``,
    `RULES:`,
    `- For a video transcript, reconstruct the technique from spoken instructions; ignore filler, sponsorships, and chit-chat.`,
    `- applicability is the most important field: be SPECIFIC about which ingredients/proteins/dish types it suits and the result. This is what links the technique to recipes. Name the core ingredient (e.g. shrimp, asparagus, corn, potato) explicitly.`,
    `- addedIngredients: only the ingredients the technique itself introduces (e.g. baking soda + salt for a brine). Quantities must be numbers. Units MUST be exactly one of: ${allowedUnits}. Map any wording to these (tablespoon -> tbsp, teaspoon -> tsp, grams -> g, pound -> lb, ounce -> oz, "fl oz" for fluid ounce). A whole item like "2 eggs" -> unit "count". Never invent a unit outside this set. If the technique adds nothing, use an empty array.`,
    `- tags: choose ONLY from this controlled vocabulary, the proteins/main-ingredients/dish types this technique applies to, as many as truly apply: ${allowedTags}. ALWAYS include the core ingredient tag when one exists (shrimp brine -> shrimp; asparagus method -> asparagus; corn method -> corn; potato method -> potato). Do NOT rely on a cooking-method tag (grill/roast/fry) alone — it won't link the technique to anything. Do not invent tags. Omit a tag rather than guess.`,
    input.instruction
      ? `\nUSER INSTRUCTION (extract ONLY this): ${input.instruction}`
      : null,
    ``,
    `SOURCE TEXT:`,
    input.text,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** One raw technique object straight off the schema (pre-clean). */
type RawTechnique = z.infer<typeof techniqueObjectSchema>;

/**
 * Fold one raw LLM technique into a vocab-clean ExtractedTechnique. Centralizes
 * the trim + tag-vocabulary pass so extraction and the save round-trip agree.
 * Tags are run through TagVocabulary and minted extensions are dropped, so what
 * we store is guaranteed in-vocab (and matches recipe tags for association).
 */
export function cleanExtractedTechnique(t: RawTechnique): ExtractedTechnique {
  return {
    title: t.title.trim(),
    description: t.description.trim(),
    applicability: t.applicability.trim(),
    steps: t.steps.map((s) => s.trim()).filter(Boolean),
    addedIngredients: t.addedIngredients.map((ing) => ({
      name: ing.name.trim(),
      quantity: ing.quantity,
      unit: ing.unit as Unit,
    })),
    tags: assignTags(t.tags)
      .filter((a) => !a.extended)
      .map((a) => a.tag.value),
  };
}

/**
 * Extract every technique found in a source as structured, vocab-clean objects.
 * Returns [] when the source contains no reusable technique. Tags are guaranteed
 * controlled vocabulary; added-ingredient units are schema-constrained to canon.
 */
export async function extractTechniques(
  input: ExtractTechniquesInput,
): Promise<ExtractedTechnique[]> {
  const { object } = await generateObject({
    model: chatModel,
    schema: extractionSchema,
    prompt: buildPrompt(input),
  });
  return object.techniques.map(cleanExtractedTechnique);
}
