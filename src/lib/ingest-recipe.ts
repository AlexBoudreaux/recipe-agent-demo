/**
 * ingestRecipe — the end-to-end backend ingest pipeline.
 *
 *   fetchSource(url)            -> clean text + sourceType + title
 *   extractRecipes(text, ...)   -> one or more vocab-clean structured recipes
 *   for each recipe:
 *     embedRecipe(...)          -> 1536-dim vector
 *     saveRecipe(...)           -> Convex row (no image yet)
 *     generateAndAttachRecipeImage(...)  -> fired async, failures only log
 *
 * It talks to Convex through ConvexHttpClient against NEXT_PUBLIC_CONVEX_URL,
 * the same pattern the chunk-6 seed script and the chunk-5B agent will reuse.
 * Image generation is kicked off but NEVER awaited into the save path, so a
 * slow or failed cover photo can't fail the ingest.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { fetchSource } from "./source-fetcher";
import { extractRecipes, type ExtractedRecipe } from "./recipe-extractor";
import { embedRecipe } from "./embedding";
import { generateAndAttachRecipeImage } from "./recipe-image";
import { associateRecipe } from "./associate";

/** One saved recipe: the structured object plus its new Convex id. */
export interface IngestedRecipe {
  id: Id<"recipes">;
  recipe: ExtractedRecipe;
}

export interface IngestRecipeResult {
  sourceType: "blog" | "youtube";
  sourceUrl: string;
  sourceTitle?: string;
  /** All recipes saved from this source (may be >1 for a roundup). */
  saved: IngestedRecipe[];
  /** Promise that settles when all async image jobs finish. Optional to await. */
  imagesSettled: Promise<void>;
  /** Promise that settles when all fired association jobs finish. Optional to await. */
  associationsSettled: Promise<void>;
}

export interface IngestRecipeOptions {
  /** Reuse an existing client (the agent/seed script may already have one). */
  convex?: ConvexHttpClient;
  /** Skip kicking off cover-image generation (e.g. fast seeding runs). */
  skipImages?: boolean;
  /** Skip firing association (e.g. when a caller will reassociateAll afterward). */
  skipAssociation?: boolean;
}

function getConvexClient(provided?: ConvexHttpClient): ConvexHttpClient {
  if (provided) return provided;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set; cannot reach Convex to save recipes.",
    );
  }
  return new ConvexHttpClient(url);
}

/**
 * Ingest a recipe source end-to-end. Resolves once every recipe is SAVED (rows
 * exist, embeddings stored); cover images keep generating in the background and
 * patch in later. Await `result.imagesSettled` only if you need the images done
 * (e.g. a seed script that commits a complete library).
 */
export async function ingestRecipe(
  url: string,
  instruction?: string,
  options: IngestRecipeOptions = {},
): Promise<IngestRecipeResult> {
  const convex = getConvexClient(options.convex);

  // 1) URL -> clean text (throws typed SourceFetchError on bad link/no transcript)
  const source = await fetchSource(url);

  // 2) text -> structured, vocab-clean recipes (one or more)
  const extracted = await extractRecipes({
    text: source.text,
    sourceType: source.sourceType,
    sourceUrl: source.url,
    sourceTitle: source.title,
    instruction,
  });

  if (extracted.length === 0) {
    return {
      sourceType: source.sourceType,
      sourceUrl: source.url,
      sourceTitle: source.title,
      saved: [],
      imagesSettled: Promise.resolve(),
      associationsSettled: Promise.resolve(),
    };
  }

  // 3) per recipe: embed -> save. Embedding is required (vector index needs it),
  // so it's part of the save path. Done concurrently across recipes.
  const saved: IngestedRecipe[] = await Promise.all(
    extracted.map(async (recipe) => {
      const embedding = await embedRecipe({
        title: recipe.title,
        summary: recipe.summary,
        tags: recipe.tags,
      });
      const id = await convex.mutation(api.recipes.saveRecipe, {
        title: recipe.title,
        sourceUrl: source.url,
        sourceType: source.sourceType,
        category: recipe.category,
        summary: recipe.summary,
        ingredients: recipe.ingredients,
        yield: recipe.yield,
        steps: recipe.steps,
        tags: recipe.tags,
        embedding,
      });
      return { id, recipe };
    }),
  );

  // 4) fire cover-image generation. NOT awaited into the result — it can only
  // log on failure. We expose a settled-promise so a seed run can opt to wait.
  const imagesSettled = options.skipImages
    ? Promise.resolve()
    : Promise.allSettled(
        saved.map((s) =>
          generateAndAttachRecipeImage(
            s.id,
            { title: s.recipe.title, summary: s.recipe.summary },
            { convex },
          ),
        ),
      ).then(() => undefined);

  // 5) fire bidirectional association: a NEW recipe scans every existing
  // technique so links work regardless of ingest order. NOT awaited into the
  // result and failures only log, so a flaky association can't fail the save.
  const associationsSettled = options.skipAssociation
    ? Promise.resolve()
    : Promise.allSettled(
        saved.map((s) =>
          associateRecipe(s.id, { convex }).catch((err) => {
            console.error(`associateRecipe(${s.id}) failed:`, err);
          }),
        ),
      ).then(() => undefined);

  return {
    sourceType: source.sourceType,
    sourceUrl: source.url,
    sourceTitle: source.title,
    saved,
    imagesSettled,
    associationsSettled,
  };
}
