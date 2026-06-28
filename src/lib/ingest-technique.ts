/**
 * ingestTechnique — end-to-end backend ingest pipeline for techniques.
 *
 *   fetchSource(url)              -> clean text + sourceType + title
 *   extractTechniques(text, ...)  -> one or more vocab-clean structured techniques
 *   for each technique:
 *     embedTechnique(...)         -> 1536-dim vector (title + applicability + description)
 *     saveTechnique(...)          -> Convex row
 *     associateTechnique(id)      -> fired (non-blocking) so a new technique links
 *                                    to every applicable existing recipe immediately
 *
 * Mirrors ingest-recipe.ts. Techniques have NO cover image (not in the schema),
 * so there is no image step. Talks to Convex through ConvexHttpClient against
 * NEXT_PUBLIC_CONVEX_URL, reusing a caller-provided client when given (seed
 * script / agent). Association is fired but NEVER awaited into the save path and
 * its failures only log, so a flaky association can't fail an ingest.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { fetchSource } from "./source-fetcher";
import { extractTechniques, type ExtractedTechnique } from "./technique-extractor";
import { embedTechnique } from "./embedding";
import { associateTechnique } from "./associate";

/** One saved technique: the structured object plus its new Convex id. */
export interface IngestedTechnique {
  id: Id<"techniques">;
  technique: ExtractedTechnique;
}

export interface IngestTechniqueResult {
  sourceType: "blog" | "youtube";
  sourceUrl: string;
  sourceTitle?: string;
  /** All techniques saved from this source (may be >1). */
  saved: IngestedTechnique[];
  /** Settles when all fired association jobs finish. Optional to await. */
  associationsSettled: Promise<void>;
}

export interface IngestTechniqueOptions {
  /** Reuse an existing client (the agent/seed script may already have one). */
  convex?: ConvexHttpClient;
  /** Skip firing association (e.g. when a caller will reassociateAll afterward). */
  skipAssociation?: boolean;
}

function getConvexClient(provided?: ConvexHttpClient): ConvexHttpClient {
  if (provided) return provided;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set; cannot reach Convex to save techniques.",
    );
  }
  return new ConvexHttpClient(url);
}

/**
 * Embed + save ONE already-extracted technique, then fire association. Shared by
 * the URL pipeline below and the agent's save-technique tool so both paths embed
 * with the single-source-of-truth helper and associate identically.
 *
 * Resolves once the row is SAVED. Association runs in the background; await the
 * returned `associated` promise only if you need it done (e.g. a seed run).
 */
export async function saveExtractedTechnique(
  technique: ExtractedTechnique,
  source: { sourceUrl: string; sourceType: "blog" | "youtube" },
  options: IngestTechniqueOptions = {},
): Promise<{ id: Id<"techniques">; associated: Promise<void> }> {
  const convex = getConvexClient(options.convex);

  const embedding = await embedTechnique({
    title: technique.title,
    applicability: technique.applicability,
    description: technique.description,
  });

  const id = await convex.mutation(api.techniques.saveTechnique, {
    title: technique.title,
    sourceUrl: source.sourceUrl,
    sourceType: source.sourceType,
    description: technique.description,
    applicability: technique.applicability,
    steps: technique.steps,
    addedIngredients: technique.addedIngredients,
    tags: technique.tags,
    embedding,
  });

  // Fire-and-forget association: a new technique scans every existing recipe.
  // NEVER awaited into the save; failures only log so association can't fail a save.
  const associated = options.skipAssociation
    ? Promise.resolve()
    : associateTechnique(id, { convex })
        .then(() => undefined)
        .catch((err) => {
          console.error(`associateTechnique(${id}) failed:`, err);
        });

  return { id, associated };
}

/**
 * Ingest a technique source end-to-end. Resolves once every technique is SAVED;
 * association keeps running in the background and links in later. Await
 * `result.associationsSettled` only if you need associations done (seed script).
 */
export async function ingestTechnique(
  url: string,
  instruction?: string,
  options: IngestTechniqueOptions = {},
): Promise<IngestTechniqueResult> {
  const convex = getConvexClient(options.convex);

  // 1) URL -> clean text (throws typed SourceFetchError on bad link/no transcript)
  const source = await fetchSource(url);

  // 2) text -> structured, vocab-clean techniques (one or more)
  const extracted = await extractTechniques({
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
      associationsSettled: Promise.resolve(),
    };
  }

  // 3) per technique: embed -> save -> fire association. Embedding+save done
  // concurrently across techniques; association promises collected to settle.
  const results = await Promise.all(
    extracted.map(async (technique) => {
      const { id, associated } = await saveExtractedTechnique(
        technique,
        { sourceUrl: source.url, sourceType: source.sourceType },
        { convex, skipAssociation: options.skipAssociation },
      );
      return { id, technique, associated };
    }),
  );

  const saved: IngestedTechnique[] = results.map((r) => ({
    id: r.id,
    technique: r.technique,
  }));
  const associationsSettled = Promise.allSettled(
    results.map((r) => r.associated),
  ).then(() => undefined);

  return {
    sourceType: source.sourceType,
    sourceUrl: source.url,
    sourceTitle: source.title,
    saved,
    associationsSettled,
  };
}
