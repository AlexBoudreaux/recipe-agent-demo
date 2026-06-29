/**
 * Tool definitions for the RecipeAgent (chunk 5B, ACT 1 — recipes only).
 *
 * Four tools, all server-side:
 *  - fetch_and_extract: the conversational extractor. Fetches a source and
 *    STREAMS the candidate recipe(s) as they build (async-generator tool ->
 *    preliminary tool outputs the artifact panel renders live). One extraction,
 *    one source of truth; the agent reasons over the final candidates.
 *  - save_recipe: embed + saveRecipe + fire-and-forget cover image. The chosen
 *    candidate is passed back through the same constrained recipe schema so the
 *    deterministic units/category survive the round-trip.
 *  - find_recipes / get_recipe: read tools over Convex (used more in search mode,
 *    but always available — modes are soft).
 *
 * Typed SourceFetchError codes and empty extractions are caught here and turned
 * into structured result events, never thrown, so the agent can phrase every
 * failure conversationally instead of leaking a stack trace.
 */
import { tool } from "ai";
import { z } from "zod";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { fetchSource, SourceFetchError } from "./source-fetcher";
import {
  streamExtractRecipes,
  cleanExtractedRecipe,
  recipeDataSchema,
} from "./recipe-extractor";
import {
  streamExtractTechniques,
  cleanExtractedTechnique,
  techniqueDataSchema,
} from "./technique-extractor";
import { saveExtractedTechnique } from "./ingest-technique";
import { embedRecipe } from "./embedding";
import { generateAndAttachRecipeImage } from "./recipe-image";
import { associateRecipe } from "./associate";
import { matchSideDishes } from "./side-dish-matcher";
import { buildMenuPlan } from "./plan-builder";
import type {
  CandidateRecipe,
  CandidateTechnique,
  ExtractEvent,
  PartialCandidate,
  PartialTechniqueCandidate,
  PlanEvent,
  SaveRecipeResult,
  SaveTechniqueResult,
  SearchEvent,
  SearchResultItem,
  SideDishEvent,
  TechniqueExtractEvent,
} from "./artifact-types";

function convexClient(): ConvexHttpClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set; agent cannot reach Convex.");
  }
  return new ConvexHttpClient(url);
}

// ---------------------------------------------------------------------------
// fetch_and_extract — streaming extractor
// ---------------------------------------------------------------------------

const fetchAndExtract = tool({
  description:
    "Fetch a recipe source (a cooking blog URL or a YouTube link) and extract " +
    "the recipe(s) it contains. The recipe streams into the side panel as it " +
    "builds. A single source may contain MULTIPLE recipes; this returns all of " +
    "them with a stable `index` so you can refer to 'the 2nd one'. Pass the " +
    "user's narrowing instruction (e.g. 'just the spicy pasta') as `instruction` " +
    "when they gave one. Does NOT save anything — saving is a separate step.",
  inputSchema: z.object({
    url: z.string().describe("The blog or YouTube URL to ingest."),
    instruction: z
      .string()
      .nullable()
      .describe(
        "Optional plain-language narrowing of what to extract, or null. " +
          "E.g. 'only the spicy one', 'skip the dessert'.",
      ),
  }),
  // Async generator => the SDK streams each yield as a preliminary tool output.
  // The LAST yielded value is the final result the agent reasons over.
  async *execute({ url, instruction }): AsyncGenerator<ExtractEvent> {
    yield { status: "fetching", sourceUrl: url };

    let source;
    try {
      source = await fetchSource(url);
    } catch (err) {
      if (err instanceof SourceFetchError) {
        yield {
          status: "error",
          code: err.code,
          message: err.message,
          sourceUrl: url,
        };
        return;
      }
      yield {
        status: "error",
        code: "UNKNOWN",
        message: err instanceof Error ? err.message : String(err),
        sourceUrl: url,
      };
      return;
    }

    const { partialRecipes, final } = streamExtractRecipes({
      text: source.text,
      sourceType: source.sourceType,
      sourceUrl: source.url,
      sourceTitle: source.title,
      instruction: instruction ?? undefined,
    });

    try {
      for await (const partials of partialRecipes) {
        // Transient, display-only partials: cast past DeepPartial's nested
        // `| undefined`s; the artifact card renders every field defensively.
        const candidates = partials.map((p, index) => ({
          index,
          ...p,
        })) as PartialCandidate[];
        yield {
          status: "extracting",
          sourceType: source.sourceType,
          sourceUrl: source.url,
          sourceTitle: source.title,
          candidates,
        };
      }

      const recipes = await final();
      if (recipes.length === 0) {
        yield {
          status: "empty",
          sourceUrl: source.url,
          message:
            "No recipe was found in that source — it may be commentary, a " +
            "channel/playlist page, or a video with no actual cooking.",
        };
        return;
      }

      const candidates: CandidateRecipe[] = recipes.map((r, index) => ({
        index,
        ...r,
      }));
      yield {
        status: "ready",
        sourceType: source.sourceType,
        sourceUrl: source.url,
        sourceTitle: source.title,
        candidates,
      };
    } catch (err) {
      yield {
        status: "error",
        code: "EXTRACTION_FAILED",
        message: err instanceof Error ? err.message : String(err),
        sourceUrl: source.url,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// save_recipe — embed + persist + fire cover image
// ---------------------------------------------------------------------------

const saveRecipe = tool({
  description:
    "Save ONE chosen recipe to the library. Call this only after the user has " +
    "confirmed which recipe to save (when a source had several). Pass the exact " +
    "recipe object from fetch_and_extract's candidates. Embedding, persistence, " +
    "and the cover photo are handled here; the photo generates in the background " +
    "and never blocks the save.",
  inputSchema: z.object({
    recipe: recipeDataSchema.describe(
      "The chosen recipe, copied verbatim from a fetch_and_extract candidate.",
    ),
    sourceUrl: z.string(),
    sourceType: z.enum(["blog", "youtube"]),
  }),
  async execute({ recipe, sourceUrl, sourceType }): Promise<SaveRecipeResult> {
    const convex = convexClient();
    const clean = cleanExtractedRecipe(recipe);

    const embedding = await embedRecipe({
      title: clean.title,
      summary: clean.summary,
      tags: clean.tags,
    });

    const savedRecipeId = await convex.mutation(api.recipes.saveRecipe, {
      title: clean.title,
      sourceUrl,
      sourceType,
      category: clean.category,
      summary: clean.summary,
      ingredients: clean.ingredients,
      yield: clean.yield,
      steps: clean.steps,
      tags: clean.tags,
      embedding,
    });

    // Fire-and-forget: a slow or failed cover photo must never fail the save.
    void generateAndAttachRecipeImage(
      savedRecipeId,
      { title: clean.title, summary: clean.summary },
      { convex },
    );

    // Fire-and-forget association: a new recipe scans every existing technique
    // so attached know-how appears immediately, regardless of ingest order.
    // Never awaited; a failure here must not fail the save.
    void associateRecipe(savedRecipeId, { convex }).catch((err) => {
      console.error(`associateRecipe(${savedRecipeId}) failed:`, err);
    });

    return { savedRecipeId, title: clean.title };
  },
});

// ---------------------------------------------------------------------------
// Read tools over Convex
// ---------------------------------------------------------------------------

const findRecipes = tool({
  description:
    "Search the saved library by controlled-vocab tags and/or category. Use " +
    "this to answer 'what can I make with shrimp?' or 'show me my sides'. " +
    "Returns a slim list (id, title, category, summary, tags).",
  inputSchema: z.object({
    category: z
      .enum(["main", "side", "dessert", "beverage", "appetizer", "sauce"])
      .nullable()
      .describe("Restrict to one category, or null."),
    tags: z
      .array(z.string())
      .nullable()
      .describe("Match recipes carrying ANY of these controlled tags, or null."),
    limit: z.number().nullable().describe("Max results (default 20)."),
  }),
  async execute({ category, tags, limit }) {
    const convex = convexClient();
    const rows = await convex.query(api.recipes.findRecipes, {
      ...(category ? { category } : {}),
      ...(tags && tags.length ? { tags } : {}),
      limit: limit ?? 20,
    });
    return rows.map((r) => ({
      id: r._id,
      title: r.title,
      category: r.category,
      summary: r.summary,
      tags: r.tags,
      imageUrl: r.imageUrl,
    }));
  },
});

const getRecipe = tool({
  description:
    "Load one saved recipe in full by its id (ingredients, steps, image).",
  inputSchema: z.object({ recipeId: z.string() }),
  async execute({ recipeId }) {
    const convex = convexClient();
    const recipe = await convex.query(api.recipes.getRecipe, {
      recipeId: recipeId as Id<"recipes">,
    });
    if (!recipe) return { found: false as const };
    return {
      found: true as const,
      id: recipe._id,
      title: recipe.title,
      category: recipe.category,
      summary: recipe.summary,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      tags: recipe.tags,
      yield: recipe.yield,
      imageUrl: recipe.imageUrl,
    };
  },
});

// ---------------------------------------------------------------------------
// fetch_and_extract_technique — streaming technique extractor
// ---------------------------------------------------------------------------

const fetchAndExtractTechnique = tool({
  description:
    "Fetch a source (a cooking blog URL or a YouTube link) and extract reusable " +
    "TECHNIQUES from it — transferable know-how like a brine, a sear method, or a " +
    "dough-hydration trick, NOT a whole dish. Use this (instead of " +
    "fetch_and_extract) when the chef wants to capture a technique, e.g. 'save the " +
    "shrimp brine technique from this video'. The technique streams into the side " +
    "panel as it builds. A source may yield MULTIPLE candidate techniques; this " +
    "returns all of them with a stable `index` so you can offer a choice. Pass the " +
    "chef's narrowing words (e.g. 'just the brine, skip the plating tip') as " +
    "`instruction`. Does NOT save anything — saving is a separate step.",
  inputSchema: z.object({
    url: z.string().describe("The blog or YouTube URL to ingest."),
    instruction: z
      .string()
      .nullable()
      .describe(
        "The technique the chef named, or null. E.g. 'the salt + baking soda " +
          "shrimp brine', 'the reverse sear'.",
      ),
  }),
  async *execute({ url, instruction }): AsyncGenerator<TechniqueExtractEvent> {
    yield { kind: "technique", status: "fetching", sourceUrl: url };

    let source;
    try {
      source = await fetchSource(url);
    } catch (err) {
      if (err instanceof SourceFetchError) {
        yield {
          kind: "technique",
          status: "error",
          code: err.code,
          message: err.message,
          sourceUrl: url,
        };
        return;
      }
      yield {
        kind: "technique",
        status: "error",
        code: "UNKNOWN",
        message: err instanceof Error ? err.message : String(err),
        sourceUrl: url,
      };
      return;
    }

    const { partialTechniques, final } = streamExtractTechniques({
      text: source.text,
      sourceType: source.sourceType,
      sourceUrl: source.url,
      sourceTitle: source.title,
      instruction: instruction ?? undefined,
    });

    try {
      for await (const partials of partialTechniques) {
        const candidates = partials.map((p, index) => ({
          index,
          ...p,
        })) as PartialTechniqueCandidate[];
        yield {
          kind: "technique",
          status: "extracting",
          sourceType: source.sourceType,
          sourceUrl: source.url,
          sourceTitle: source.title,
          candidates,
        };
      }

      const techniques = await final();
      if (techniques.length === 0) {
        yield {
          kind: "technique",
          status: "empty",
          sourceUrl: source.url,
          message:
            "No reusable technique was found in that source — it may be a full " +
            "recipe (try capturing it as a recipe instead) or just commentary.",
        };
        return;
      }

      const candidates: CandidateTechnique[] = techniques.map((t, index) => ({
        index,
        ...t,
      }));
      yield {
        kind: "technique",
        status: "ready",
        sourceType: source.sourceType,
        sourceUrl: source.url,
        sourceTitle: source.title,
        candidates,
      };
    } catch (err) {
      yield {
        kind: "technique",
        status: "error",
        code: "EXTRACTION_FAILED",
        message: err instanceof Error ? err.message : String(err),
        sourceUrl: source.url,
      };
    }
  },
});

// ---------------------------------------------------------------------------
// save_technique — embed + persist + fire bidirectional association
// ---------------------------------------------------------------------------

const saveTechnique = tool({
  description:
    "Save ONE chosen technique to the library. Call this only after the chef has " +
    "confirmed which technique to save (when a source had several). Pass the exact " +
    "technique object from fetch_and_extract_technique's candidates. Embedding, " +
    "persistence, and association are handled here: the newly saved technique is " +
    "automatically linked to every applicable recipe already in the library " +
    "(association runs in the background and never blocks the save).",
  inputSchema: z.object({
    technique: techniqueDataSchema.describe(
      "The chosen technique, copied verbatim from a fetch_and_extract_technique candidate.",
    ),
    sourceUrl: z.string(),
    sourceType: z.enum(["blog", "youtube"]),
  }),
  async execute({ technique, sourceUrl, sourceType }): Promise<SaveTechniqueResult> {
    const convex = convexClient();
    const clean = cleanExtractedTechnique(technique);

    // Embed + save + fire association in one shared helper (same path the URL
    // pipeline and seed script use, so association behaves identically).
    const { id } = await saveExtractedTechnique(
      clean,
      { sourceUrl, sourceType },
      { convex },
    );

    return { savedTechniqueId: id, title: clean.title };
  },
});

// ---------------------------------------------------------------------------
// search_recipes — combined tag + meaning search over the library
// ---------------------------------------------------------------------------

const searchRecipes = tool({
  description:
    "Search the saved library by MEANING and tags together (PRD combined search). " +
    "Use this in search mode for natural-language queries like 'something with " +
    "shrimp', 'a cozy fall dinner', or 'spicy noodles'. Pass the chef's words as " +
    "`queryText`; add `tags`/`category` only if they clearly name one. Returns " +
    "ranked recipes that render as a grid in the side panel. If it returns an " +
    "empty list, tell the chef nothing matched and suggest a different search.",
  inputSchema: z.object({
    queryText: z
      .string()
      .describe("The chef's natural-language search, e.g. 'something with shrimp'."),
    category: z
      .enum(["main", "side", "dessert", "beverage", "appetizer", "sauce"])
      .nullable()
      .describe("Restrict to one category, or null."),
    tags: z
      .array(z.string())
      .nullable()
      .describe("Controlled-vocab tags to bias toward, or null."),
    limit: z.number().nullable().describe("Max results (default 12)."),
  }),
  async execute({ queryText, category, tags, limit }): Promise<SearchEvent> {
    const convex = convexClient();
    const results = (await convex.action(api.search.searchRecipes, {
      queryText,
      ...(category ? { category } : {}),
      ...(tags && tags.length ? { tags } : {}),
      limit: limit ?? 12,
    })) as Array<{
      id: Id<"recipes">;
      title: string;
      category: SearchResultItem["category"];
      summary: string;
      tags: string[];
      imageUrl: string | null;
      score: number;
      meaningScore: number;
      sharedTags: string[];
    }>;

    return {
      kind: "search",
      query: queryText,
      results: results.map((r) => ({ ...r, id: r.id as string })),
    };
  },
});

// ---------------------------------------------------------------------------
// Menus (ACT 3) — create, build up, and read a menu the chef is planning.
// ---------------------------------------------------------------------------

const createMenu = tool({
  description:
    "Create a new menu (a meal the chef is planning) and return its id. Call " +
    "this when the chef wants to start planning a meal. Optionally seed it with " +
    "recipe ids and a target serving count. Use the returned menuId for the " +
    "follow-up add_recipe_to_menu / set_menu_servings / build_menu_plan calls.",
  inputSchema: z.object({
    name: z.string().describe("A short name for the menu, e.g. 'Saturday shrimp dinner'."),
    recipeIds: z
      .array(z.string())
      .nullable()
      .describe("Recipe ids to add up front (in course order), or null."),
    targetServings: z
      .number()
      .nullable()
      .describe("How many people to cook for, or null to decide later."),
  }),
  async execute({ name, recipeIds, targetServings }) {
    const convex = convexClient();
    const menuId = await convex.mutation(api.menus.createMenu, {
      name,
      ...(targetServings != null ? { targetServings } : {}),
      ...(recipeIds && recipeIds.length
        ? { recipeRefs: recipeIds as Id<"recipes">[] }
        : {}),
    });
    return { menuId: menuId as string, name };
  },
});

const addRecipeToMenu = tool({
  description:
    "Add one recipe to a menu (appended in course order; a no-op if already " +
    "present). Use after the chef picks a main or a suggested side. Needs the " +
    "menuId and the recipe id.",
  inputSchema: z.object({
    menuId: z.string(),
    recipeId: z.string(),
  }),
  async execute({ menuId, recipeId }) {
    const convex = convexClient();
    await convex.mutation(api.menus.addRecipeToMenu, {
      menuId: menuId as Id<"menus">,
      recipeId: recipeId as Id<"recipes">,
    });
    return { ok: true as const, menuId, recipeId };
  },
});

const setMenuServings = tool({
  description:
    "Set how many people a menu should serve. The plan scales every recipe to " +
    "this number. Needs the menuId and the serving count.",
  inputSchema: z.object({
    menuId: z.string(),
    targetServings: z.number(),
  }),
  async execute({ menuId, targetServings }) {
    const convex = convexClient();
    await convex.mutation(api.menus.setMenuServings, {
      menuId: menuId as Id<"menus">,
      targetServings,
    });
    return { ok: true as const, menuId, targetServings };
  },
});

const getMenu = tool({
  description:
    "Load a menu with its recipes hydrated (titles, categories, ingredients, " +
    "yields). Use to see what's on a menu before suggesting a side or building " +
    "a plan.",
  inputSchema: z.object({ menuId: z.string() }),
  async execute({ menuId }) {
    const convex = convexClient();
    const menu = await convex.query(api.menus.getMenu, {
      menuId: menuId as Id<"menus">,
    });
    if (!menu) return { found: false as const };
    return {
      found: true as const,
      id: menu._id,
      name: menu.name,
      targetServings: menu.targetServings ?? null,
      recipes: menu.recipes.map((r) => ({
        id: r._id,
        title: r.title,
        category: r.category,
        tags: r.tags,
        yield: r.yield,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// generate_side_dishes — deterministic filter + LLM rank of THREE library sides.
// ---------------------------------------------------------------------------

const generateSideDishes = tool({
  description:
    "Suggest three complementary SIDE dishes for a main, drawn ONLY from the " +
    "chef's saved library (never invented). A deterministic filter first excludes " +
    "any side that shares the main's protein (no shrimp side for a shrimp main), " +
    "then the model ranks three of the survivors with a one-line pairing reason " +
    "each. Pass the main recipe's id. The chef then picks which side(s) to add to " +
    "the menu with add_recipe_to_menu.",
  inputSchema: z.object({
    mainRecipeId: z
      .string()
      .describe("The id of the main dish to find sides for."),
  }),
  async execute({ mainRecipeId }): Promise<SideDishEvent> {
    const convex = convexClient();
    const result = await matchSideDishes(mainRecipeId, { convex });
    return {
      kind: "sides",
      main: result.main,
      consideredCount: result.consideredCount,
      suggestions: result.suggestions.map((s) => ({
        id: s.recipe.id,
        title: s.recipe.title,
        summary: s.recipe.summary,
        category: s.recipe.category,
        tags: s.recipe.tags,
        imageUrl: s.recipe.imageUrl,
        reason: s.reason,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// build_menu_plan — deterministic scaling/consolidation + LLM weave/aisle group.
// ---------------------------------------------------------------------------

const buildMenuPlanTool = tool({
  description:
    "Generate the final cookable plan for a menu and save it as a NEW versioned " +
    "snapshot (regenerating never overwrites history). All quantity math is " +
    "deterministic: every recipe is scaled to the serving count and converted to " +
    "the chosen unit system (same-dimension only), and identical ingredients are " +
    "consolidated into one shopping list grouped by store area. CRITICAL: only the " +
    "techniques the chef EXPLICITLY chose (appliedTechniqueIds) are woven in — " +
    "never auto-apply an associated technique. Default to applying NONE. If two " +
    "chosen techniques conflict for a recipe, the result lists it under `conflicts` " +
    "— surface that to the chef instead of pretending the plan is clean.",
  inputSchema: z.object({
    menuId: z.string(),
    servings: z
      .number()
      .nullable()
      .describe("People to cook for, or null to use the menu's target."),
    unitSystem: z
      .enum(["metric", "imperial"])
      .nullable()
      .describe("Unit system for the plan, or null (defaults to imperial)."),
    appliedTechniqueIds: z
      .array(z.string())
      .nullable()
      .describe(
        "The technique ids the CHEF chose to incorporate. Null or [] means apply " +
          "NONE. Only techniques already associated with a recipe take effect.",
      ),
  }),
  async execute({ menuId, servings, unitSystem, appliedTechniqueIds }): Promise<PlanEvent> {
    const convex = convexClient();
    const plan = await buildMenuPlan(menuId, {
      convex,
      ...(servings != null ? { servings } : {}),
      ...(unitSystem != null ? { unitSystem } : {}),
      appliedTechniqueIds: appliedTechniqueIds ?? [],
    });
    return {
      kind: "plan",
      planId: plan.planId as string,
      version: plan.version,
      menuId: plan.menuId as string,
      servings: plan.servings,
      unitSystem: plan.unitSystem,
      appliedTechniques: plan.appliedTechniques as string[],
      consolidatedIngredients: plan.consolidatedIngredients.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unit: l.unit,
        fromRecipeIds: l.fromRecipeIds as string[],
      })),
      perRecipeSteps: plan.perRecipeSteps.map((s) => ({
        recipeId: s.recipeId as string,
        title: s.title,
        steps: s.steps,
      })),
      shoppingList: plan.shoppingList,
      conflicts: plan.conflicts.map((c) => ({
        recipeId: c.recipeId as string,
        recipeTitle: c.recipeTitle,
        techniqueIds: c.techniqueIds as string[],
        message: c.message,
      })),
    };
  },
});

/** The agent's full toolset. Names match the `tool-<name>` UI part types. */
export const recipeAgentTools = {
  fetch_and_extract: fetchAndExtract,
  save_recipe: saveRecipe,
  fetch_and_extract_technique: fetchAndExtractTechnique,
  save_technique: saveTechnique,
  search_recipes: searchRecipes,
  find_recipes: findRecipes,
  get_recipe: getRecipe,
  create_menu: createMenu,
  add_recipe_to_menu: addRecipeToMenu,
  set_menu_servings: setMenuServings,
  get_menu: getMenu,
  generate_side_dishes: generateSideDishes,
  build_menu_plan: buildMenuPlanTool,
};
