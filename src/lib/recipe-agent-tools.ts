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
import { embedRecipe } from "./embedding";
import { generateAndAttachRecipeImage } from "./recipe-image";
import type {
  CandidateRecipe,
  ExtractEvent,
  PartialCandidate,
  SaveRecipeResult,
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

/** The agent's full toolset. Names match the `tool-<name>` UI part types. */
export const recipeAgentTools = {
  fetch_and_extract: fetchAndExtract,
  save_recipe: saveRecipe,
  find_recipes: findRecipes,
  get_recipe: getRecipe,
};
