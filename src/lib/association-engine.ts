/**
 * AssociationEngine — given a recipe (or a technique), find matching items in
 * the OTHER set using a controlled-tag filter PLUS a vector-similarity rank, and
 * return matches each carrying a score (for explainability).
 *
 * Runs bidirectionally: a newly saved technique scans existing recipes, and a
 * newly saved recipe scans existing techniques. Order of ingestion never
 * matters because both directions use the same logic.
 *
 * Dependency injection: this module NEVER calls an embedding API. The caller
 * passes an `EmbeddingResolver` that maps an item id to its vector. Production
 * wires this to the stored text-embedding-3-small vectors (1536 dims); tests
 * pass a stub map so results are fully deterministic.
 */
import type { Embedding } from "./types";

/** Anything the engine can match: it needs an id and controlled tags. */
export interface Taggable {
  id: string;
  tags: string[];
}

/**
 * Injected vector source. Returns the embedding for an item id, or undefined if
 * the item has no embedding yet (the engine then scores it 0 rather than guess).
 */
export type EmbeddingResolver = (id: string) => Embedding | undefined;

/** A single association result. */
export interface Match<T extends Taggable> {
  item: T;
  /** Cosine similarity in [0, 1] (negative values clamped to 0). */
  score: number;
  /** The controlled tags the source and this item share. */
  sharedTags: string[];
}

export interface AssociationOptions {
  /** Drop matches whose score is below this. Default 0 (keep all tag matches). */
  minScore?: number;
  /** Cap the number of returned matches (after sorting). Default unlimited. */
  limit?: number;
  /**
   * Require at least one shared controlled tag to be eligible. Default true.
   * This is the "clearly-inapplicable items excluded" guardrail: an item with
   * no tag overlap is dropped no matter how its vector looks.
   */
  requireTagOverlap?: boolean;
}

/**
 * Cosine similarity of two equal-length vectors, clamped to [0, 1]. Returns 0
 * for missing vectors, length mismatch, or a zero-magnitude vector.
 */
export function cosineSimilarity(a?: Embedding, b?: Embedding): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  const sim = dot / (Math.sqrt(magA) * Math.sqrt(magB));
  return sim < 0 ? 0 : sim > 1 ? 1 : sim;
}

/** Controlled tags shared by two taggable items (de-duplicated). */
export function sharedTags(a: Taggable, b: Taggable): string[] {
  const setB = new Set(b.tags);
  return [...new Set(a.tags)].filter((t) => setB.has(t));
}

/**
 * Core association. Generic over the source and candidate types so it serves
 * both directions. Steps:
 *   1. Tag filter — keep candidates sharing >=1 controlled tag (unless disabled).
 *   2. Vector rank — score survivors by cosine similarity of injected embeddings.
 *   3. Threshold + sort + limit — drop below minScore, sort by score desc
 *      (ties broken by more shared tags, then id for determinism), cap to limit.
 */
export function associate<S extends Taggable, C extends Taggable>(
  source: S,
  candidates: C[],
  resolver: EmbeddingResolver,
  options: AssociationOptions = {},
): Match<C>[] {
  const { minScore = 0, limit, requireTagOverlap = true } = options;
  const sourceVec = resolver(source.id);

  const matches: Match<C>[] = [];
  for (const candidate of candidates) {
    if (candidate.id === source.id) continue;
    const shared = sharedTags(source, candidate);
    if (requireTagOverlap && shared.length === 0) continue;
    const score = cosineSimilarity(sourceVec, resolver(candidate.id));
    if (score < minScore) continue;
    matches.push({ item: candidate, score, sharedTags: shared });
  }

  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.sharedTags.length !== a.sharedTags.length) {
      return b.sharedTags.length - a.sharedTags.length;
    }
    return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
  });

  return typeof limit === "number" ? matches.slice(0, limit) : matches;
}

/**
 * Direction 1: a technique scanning recipes. Thin wrapper over `associate` so
 * call sites read clearly. `technique` and `recipes` only need id + tags here.
 */
export function matchRecipesForTechnique<C extends Taggable>(
  technique: Taggable,
  recipes: C[],
  resolver: EmbeddingResolver,
  options?: AssociationOptions,
): Match<C>[] {
  return associate(technique, recipes, resolver, options);
}

/** Direction 2: a recipe scanning techniques. */
export function matchTechniquesForRecipe<C extends Taggable>(
  recipe: Taggable,
  techniques: C[],
  resolver: EmbeddingResolver,
  options?: AssociationOptions,
): Match<C>[] {
  return associate(recipe, techniques, resolver, options);
}
