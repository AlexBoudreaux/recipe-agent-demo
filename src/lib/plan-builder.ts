/**
 * PlanBuilder — turns a menu plus the chef's explicit choices (serving count,
 * unit system, which associated techniques to apply) into a saved, versioned
 * MenuPlan snapshot.
 *
 * The division of labor is the whole point of the demo:
 *   - ALL quantity math is DETERMINISTIC. UnitConverter scales every ingredient
 *     to the target serving count and converts it into the chosen unit system,
 *     SAME-DIMENSION ONLY (volume<->volume, weight<->weight — never volume<->weight,
 *     which would need a density guess we refuse to make). IngredientConsolidator
 *     merges identical lines across recipes into one summed shopping line. The LLM
 *     never produces a number.
 *   - Technique incorporation is NEVER automatic. Only the techniques the chef
 *     names in `appliedTechniqueIds` are woven in, and only into the recipe they
 *     are actually associated with. Unchosen associated techniques change nothing.
 *     The LLM is used ONLY for two prose tasks: weaving a chosen technique into a
 *     recipe's steps, and grouping the finished shopping list by store area.
 *   - If two chosen techniques conflict for one recipe, the plan FLAGS it (returns
 *     a conflict) and leaves that recipe's steps unchanged rather than emitting a
 *     silently broken plan.
 *
 * Persistence is via api.menuPlans.saveMenuPlan, which auto-versions per menu, so
 * regenerating creates a new version and never overwrites history.
 */
import { generateObject } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import type { Ingredient, Unit } from "./types";
import { chatModel } from "./model";
import { convert, dimensionOf, scaleMeasure, servingFactor } from "./unit-converter";
import { consolidate, type RecipeIngredients } from "./ingredient-consolidator";

export type UnitSystem = "metric" | "imperial";

/** Units native to each system. Anything NOT native is converted into-system. */
const METRIC_UNITS = new Set<string>(["g", "kg", "ml", "l"]);
const IMPERIAL_UNITS = new Set<string>([
  "oz",
  "lb",
  "tsp",
  "tbsp",
  "fl oz",
  "cup",
  "pint",
  "quart",
  "gallon",
]);

/**
 * The canonical target unit for a (system, dimension). Count/unitless has none.
 * Conversion is always toward this base; it is what makes the math deterministic
 * and same-dimension (we only ever ask for volume->volume or weight->weight).
 */
function targetUnit(system: UnitSystem, dim: ReturnType<typeof dimensionOf>): Unit | null {
  if (dim === "count") return null;
  if (system === "metric") return dim === "volume" ? "ml" : "g";
  return dim === "volume" ? "fl oz" : "oz";
}

/**
 * Convert a measure into the chosen unit system, SAME-DIMENSION ONLY. A unit
 * already native to the system is left untouched (so an imperial plan over
 * imperial recipes stays clean: tsp stays tsp). Count/unitless is never
 * converted. `convert` itself refuses any cross-dimension request, so even a bad
 * call here returns the value unchanged rather than a fabricated number.
 */
function toSystem(measure: { quantity: number; unit: Unit }, system: UnitSystem): {
  quantity: number;
  unit: Unit;
} {
  const dim = dimensionOf(measure.unit);
  if (dim === "count") return measure;
  const native = system === "metric" ? METRIC_UNITS : IMPERIAL_UNITS;
  if (native.has(measure.unit)) return measure;
  const target = targetUnit(system, dim);
  if (!target) return measure;
  return convert(measure, target);
}

/** Lowercase + collapse whitespace — mirrors IngredientConsolidator's key rule. */
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
/** The consolidation merge key: normalized name + unit. */
function lineKey(name: string, unit: string): string {
  return `${normalizeName(name)} ${unit}`;
}

/** A consolidated shopping line with provenance for explainability. */
export interface PlanConsolidatedLine {
  name: string;
  quantity: number;
  unit: string;
  fromRecipeIds: Id<"recipes">[];
}

/** Steps for one recipe after (optional) technique weaving + scaling. */
export interface PlanRecipeSteps {
  recipeId: Id<"recipes">;
  title: string;
  steps: string[];
}

/** A flagged conflict between two chosen techniques on one recipe. */
export interface PlanConflict {
  recipeId: Id<"recipes">;
  recipeTitle: string;
  techniqueIds: Id<"techniques">[];
  message: string;
}

/** One area-grouped shopping section. */
export interface ShoppingGroup {
  area: string;
  items: Array<{ name: string; quantity: number; unit: string }>;
}

/** The built (and saved) plan. */
export interface BuiltMenuPlan {
  planId: Id<"menuPlans">;
  version: number;
  menuId: Id<"menus">;
  servings: number;
  unitSystem: UnitSystem;
  appliedTechniques: Id<"techniques">[];
  consolidatedIngredients: PlanConsolidatedLine[];
  perRecipeSteps: PlanRecipeSteps[];
  shoppingList: ShoppingGroup[];
  /** Non-empty when two chosen techniques conflicted for a recipe. */
  conflicts: PlanConflict[];
}

export interface BuildMenuPlanOptions {
  servings?: number;
  unitSystem?: UnitSystem;
  /** The techniques the CHEF chose to apply. Defaults to NONE (apply nothing). */
  appliedTechniqueIds?: string[];
  convex?: ConvexHttpClient;
}

function convexClient(provided?: ConvexHttpClient): ConvexHttpClient {
  if (provided) return provided;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set; cannot reach Convex.");
  }
  return new ConvexHttpClient(url);
}

/** A line contributed by one recipe (already scaled + system-converted). */
interface ContributedLine extends Ingredient {
  recipeId: Id<"recipes">;
}

/**
 * Build, persist, and return a menu plan. See the module header for the
 * deterministic-vs-LLM split. Throws if the menu is missing or empty.
 */
export async function buildMenuPlan(
  menuId: string,
  options: BuildMenuPlanOptions = {},
): Promise<BuiltMenuPlan> {
  const convex = convexClient(options.convex);
  const id = menuId as Id<"menus">;

  const menu = await convex.query(api.menus.getMenu, { menuId: id });
  if (!menu) throw new Error(`Menu ${menuId} not found.`);
  if (menu.recipes.length === 0) {
    throw new Error("Menu has no recipes; add at least one recipe before planning.");
  }

  const servings = options.servings ?? menu.targetServings ?? 4;
  const unitSystem: UnitSystem = options.unitSystem ?? "imperial";
  const appliedSet = new Set(options.appliedTechniqueIds ?? []);
  const appliedTechniques = [...appliedSet] as Id<"techniques">[];

  const contributed: ContributedLine[] = [];
  const perRecipeSteps: PlanRecipeSteps[] = [];
  const conflicts: PlanConflict[] = [];

  for (const recipe of menu.recipes) {
    const factor = servingFactor(recipe.yield.amount, servings);

    // --- DETERMINISTIC: scale every ingredient, then convert into the system ---
    for (const ing of recipe.ingredients) {
      const scaled = scaleMeasure({ quantity: ing.quantity, unit: ing.unit as Unit }, factor);
      const conv = toSystem(scaled, unitSystem);
      contributed.push({
        name: ing.name,
        quantity: conv.quantity,
        unit: conv.unit,
        ...(ing.prep ? { prep: ing.prep } : {}),
        recipeId: recipe._id,
      });
    }

    // --- Which associated techniques did the CHEF choose for THIS recipe? ---
    // Only associated AND chosen techniques are eligible; nothing is automatic.
    const associated = await convex.query(api.techniques.getTechniquesForRecipe, {
      recipeId: recipe._id,
    });
    const chosen = associated.filter((t) => appliedSet.has(t._id));

    // Applied techniques also CONTRIBUTE their added ingredients to the shopping
    // list, scaled by this recipe's factor and converted into the system.
    for (const tech of chosen) {
      for (const ing of tech.addedIngredients) {
        const scaled = scaleMeasure({ quantity: ing.quantity, unit: ing.unit as Unit }, factor);
        const conv = toSystem(scaled, unitSystem);
        contributed.push({
          name: ing.name,
          quantity: conv.quantity,
          unit: conv.unit,
          recipeId: recipe._id,
        });
      }
    }

    // --- Steps: only woven when the chef chose a technique for this recipe ---
    if (chosen.length === 0) {
      // Unchanged recipe: steps are kept verbatim (quantities are handled
      // separately; prose is never rewritten when nothing was chosen).
      perRecipeSteps.push({
        recipeId: recipe._id,
        title: recipe.title,
        steps: recipe.steps,
      });
    } else {
      const woven = await weaveTechniques(recipe, chosen);
      if (woven.conflict) {
        conflicts.push({
          recipeId: recipe._id,
          recipeTitle: recipe.title,
          techniqueIds: chosen.map((t) => t._id),
          message: woven.conflict,
        });
        // Don't emit a broken plan: leave this recipe's steps unchanged.
        perRecipeSteps.push({
          recipeId: recipe._id,
          title: recipe.title,
          steps: recipe.steps,
        });
      } else {
        perRecipeSteps.push({
          recipeId: recipe._id,
          title: recipe.title,
          steps: woven.steps,
        });
      }
    }
  }

  // --- DETERMINISTIC: consolidate identical lines across recipes ---------------
  // IngredientConsolidator does the summing (scale already applied above, so 1).
  const grouped: RecipeIngredients[] = [{ ingredients: contributed, scale: 1 }];
  const summed = consolidate(grouped);
  // Recompute provenance with the same key rule so each line shows its sources.
  const provenance = new Map<string, Set<Id<"recipes">>>();
  for (const line of contributed) {
    const key = lineKey(line.name, line.unit);
    if (!provenance.has(key)) provenance.set(key, new Set());
    provenance.get(key)!.add(line.recipeId);
  }
  const consolidatedIngredients: PlanConsolidatedLine[] = summed.map((l) => ({
    name: l.name,
    quantity: round(l.quantity),
    unit: l.unit,
    fromRecipeIds: [...(provenance.get(lineKey(l.name, l.unit)) ?? new Set())],
  }));

  // --- LLM (no numbers): group the finished shopping list by store area --------
  const shoppingList = await groupByStoreArea(consolidatedIngredients);

  // --- Persist as a new version ------------------------------------------------
  const { planId, version } = await convex.mutation(api.menuPlans.saveMenuPlan, {
    menuId: id,
    servings,
    unitSystem,
    appliedTechniques,
    consolidatedIngredients: consolidatedIngredients.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unit: l.unit,
      fromRecipeIds: l.fromRecipeIds,
    })),
    perRecipeSteps: perRecipeSteps.map((s) => ({
      recipeId: s.recipeId,
      title: s.title,
      steps: s.steps,
    })),
    shoppingList,
  });

  return {
    planId,
    version,
    menuId: id,
    servings,
    unitSystem,
    appliedTechniques,
    consolidatedIngredients,
    perRecipeSteps,
    shoppingList,
    conflicts,
  };
}

/** Round to 2 decimals to keep stored quantities tidy (math stays exact above). */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// LLM task 1: weave chosen techniques into one recipe's steps (prose only).
// ---------------------------------------------------------------------------

const weaveSchema = z.object({
  conflict: z
    .string()
    .nullable()
    .describe(
      "If two of the chosen techniques CANNOT both be applied to this dish " +
        "(they are mutually exclusive), a one-sentence explanation of the clash. " +
        "Otherwise null.",
    ),
  steps: z
    .array(z.string().min(1))
    .describe(
      "The recipe's full ordered steps with each chosen technique woven in at " +
        "the right point. Empty array if conflict is set.",
    ),
});

async function weaveTechniques(
  recipe: Doc<"recipes">,
  techniques: Array<Doc<"techniques"> & { score: number }>,
): Promise<{ steps: string[]; conflict: string | null }> {
  const prompt = [
    `You weave reusable cooking TECHNIQUES into a recipe's steps. The chef has explicitly chosen these techniques for this dish; incorporate them — do not ask, do not omit.`,
    ``,
    `Rules:`,
    `- Return the recipe's COMPLETE ordered steps with each technique integrated at the correct point (e.g. a brine happens before cooking).`,
    `- Do NOT restate or change any quantities — amounts are computed elsewhere. Describe the action, not the numbers.`,
    `- Keep the chef's original steps intact except where a technique modifies them.`,
    `- If two chosen techniques are mutually exclusive for this dish, set "conflict" to a one-sentence explanation and return an empty steps array. Otherwise leave conflict null.`,
    ``,
    `RECIPE: ${recipe.title}`,
    `Current steps:`,
    ...recipe.steps.map((s, i) => `  ${i + 1}. ${s}`),
    ``,
    `CHOSEN TECHNIQUES:`,
    ...techniques.map(
      (t) =>
        `- ${t.title}: ${t.description}\n  steps: ${t.steps.join(" | ")}\n  adds: ${
          t.addedIngredients.map((a) => a.name).join(", ") || "nothing"
        }`,
    ),
  ].join("\n");

  const { object } = await generateObject({
    model: chatModel,
    schema: weaveSchema,
    prompt,
  });
  if (object.conflict) return { steps: recipe.steps, conflict: object.conflict };
  return { steps: object.steps, conflict: null };
}

// ---------------------------------------------------------------------------
// LLM task 2: assign each shopping line a store area. The model returns ONLY a
// name->area mapping; we assemble the groups so quantities/units are untouched.
// ---------------------------------------------------------------------------

const STORE_AREAS = [
  "Produce",
  "Meat & Seafood",
  "Dairy & Eggs",
  "Pantry & Dry Goods",
  "Spices & Seasonings",
  "Bakery",
  "Frozen",
  "Other",
] as const;

const aisleSchema = z.object({
  assignments: z
    .array(
      z.object({
        name: z.string().describe("An ingredient name, copied EXACTLY from the list."),
        area: z.enum(STORE_AREAS).describe("The store area this ingredient lives in."),
      }),
    )
    .describe("One assignment per ingredient in the list."),
});

async function groupByStoreArea(
  lines: PlanConsolidatedLine[],
): Promise<ShoppingGroup[]> {
  if (lines.length === 0) return [];

  const prompt = [
    `Group these shopping-list ingredients by the area of a grocery store where each is found. Use ONLY these areas: ${STORE_AREAS.join(", ")}.`,
    `Return one assignment per ingredient, using the ingredient name EXACTLY as written. Do not merge, rename, or add ingredients.`,
    ``,
    `INGREDIENTS:`,
    ...lines.map((l) => `- ${l.name}`),
  ].join("\n");

  const { object } = await generateObject({
    model: chatModel,
    schema: aisleSchema,
    prompt,
  });

  // Build a name->area lookup (normalized). Unmapped lines fall to "Other".
  const areaOf = new Map<string, string>();
  for (const a of object.assignments) {
    areaOf.set(normalizeName(a.name), a.area);
  }

  // Assemble groups DETERMINISTICALLY from the real lines, preserving order and
  // copying quantities/units verbatim. The LLM only chose the bucket.
  const groups = new Map<string, ShoppingGroup>();
  const order: string[] = [];
  for (const line of lines) {
    const area = areaOf.get(normalizeName(line.name)) ?? "Other";
    if (!groups.has(area)) {
      groups.set(area, { area, items: [] });
      order.push(area);
    }
    groups.get(area)!.items.push({ name: line.name, quantity: line.quantity, unit: line.unit });
  }
  return order.map((a) => groups.get(a)!);
}
