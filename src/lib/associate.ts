/**
 * associate — bidirectional recipe<->technique association wiring.
 *
 * This is the IMPURE glue between the PURE AssociationEngine (association-engine.ts)
 * and the Convex data layer. It is importable from BOTH a Node seed script AND
 * the Next.js server (it only uses ConvexHttpClient + pure TS — no `convex/`
 * server imports, which Convex can't bundle anyway).
 *
 * The recipe.embedding / technique.embedding vectors stored at ingest are the
 * truth here: we read rows (with their stored 1536-dim embeddings + controlled
 * tags), run the pure engine over them, and write each match back through
 * api.associations.saveAssociation (which upserts on the pair and keeps
 * recipe.techniqueRefs in sync). Because every direction uses the same stored
 * vectors + the same engine, order of ingestion never matters and re-running is
 * idempotent.
 *
 * Three entry points:
 *   - associateTechnique(id): a (new) technique scans ALL recipes.
 *   - associateRecipe(id):    a (new) recipe scans ALL techniques.
 *   - reassociateAll():       full rebuild over the whole library.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Embedding } from "./types";
import {
  associate,
  type Match,
  type Taggable,
  type EmbeddingResolver,
} from "./association-engine";
import { isSubstantiveTag } from "./tag-vocabulary";

/**
 * Minimum cosine score (within the SUBSTANTIVE-tag-overlapping candidate set)
 * for an association to be saved. Tuned against the seeded library (see chunk 7A
 * verification): the qualifying-tag overlap filter does the coarse exclusion (a
 * shrimp technique only ever sees shrimp/shellfish dishes; a pure cooking-method
 * overlap like grill/roast can no longer qualify a pair — see isSubstantiveTag),
 * and this threshold trims weak semantic matches among the survivors so a
 * technique links only to the dishes it genuinely suits.
 */
export const ASSOCIATION_MIN_SCORE = 0.3;

/** A taggable item carrying its stored embedding, as loaded from Convex. */
interface Embedded extends Taggable {
  title: string;
  embedding?: Embedding;
}

/** Build an EmbeddingResolver over a fixed set of loaded rows. */
function resolverFor(items: Embedded[]): EmbeddingResolver {
  const map = new Map<string, Embedding | undefined>();
  for (const it of items) map.set(it.id, it.embedding);
  return (id: string) => map.get(id);
}

/** Human-readable why-matched string from shared tags + the technique applicability. */
function buildReason(sharedTags: string[], applicability: string): string {
  const tagPart = sharedTags.length
    ? `Shares tags: ${sharedTags.join(", ")}`
    : "Semantic match";
  const appl = applicability.trim().replace(/\s+/g, " ");
  const applPart = appl
    ? `; applies to ${appl.charAt(0).toLowerCase()}${appl.slice(1)}`
    : "";
  // Keep reasons short for the UI.
  const reason = `${tagPart}${applPart}`;
  return reason.length > 240 ? reason.slice(0, 237) + "…" : reason;
}

function getClient(provided?: ConvexHttpClient): ConvexHttpClient {
  if (provided) return provided;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set; cannot reach Convex to associate.");
  }
  return new ConvexHttpClient(url);
}

export interface AssociateOptions {
  convex?: ConvexHttpClient;
  /** Override the saved-match threshold (defaults to ASSOCIATION_MIN_SCORE). */
  minScore?: number;
}

/** One saved association, returned for reporting/verification. */
export interface SavedAssociation {
  recipeId: Id<"recipes">;
  techniqueId: Id<"techniques">;
  recipeTitle: string;
  techniqueTitle: string;
  score: number;
  sharedTags: string[];
  reason: string;
}

/** Load all recipes as Embedded taggables (id, tags, embedding, title). */
async function loadRecipes(convex: ConvexHttpClient): Promise<Embedded[]> {
  const rows = await convex.query(api.recipes.listRecipes, {});
  return rows.map((r) => ({
    id: r._id,
    title: r.title,
    tags: r.tags,
    embedding: r.embedding,
  }));
}

/** Load all techniques as Embedded taggables (id, tags, embedding, title). */
async function loadTechniques(convex: ConvexHttpClient): Promise<Embedded[]> {
  const rows = await convex.query(api.techniques.listTechniques, {});
  return rows.map((t) => ({
    id: t._id,
    title: t.title,
    tags: t.tags,
    embedding: t.embedding,
  }));
}

/**
 * Persist a set of engine matches as associations between `technique` and the
 * matched recipes. `applicability` feeds the human-readable reason. Returns the
 * saved rows (for reporting). saveAssociation upserts, so this is idempotent.
 */
async function persistMatches(
  convex: ConvexHttpClient,
  technique: { id: Id<"techniques">; title: string; applicability: string },
  matches: Match<Embedded>[],
): Promise<SavedAssociation[]> {
  const saved: SavedAssociation[] = [];
  for (const m of matches) {
    const reason = buildReason(m.sharedTags, technique.applicability);
    await convex.mutation(api.associations.saveAssociation, {
      recipeId: m.item.id as Id<"recipes">,
      techniqueId: technique.id,
      score: m.score,
      reason,
    });
    saved.push({
      recipeId: m.item.id as Id<"recipes">,
      techniqueId: technique.id,
      recipeTitle: m.item.title,
      techniqueTitle: technique.title,
      score: m.score,
      sharedTags: m.sharedTags,
      reason,
    });
  }
  return saved;
}

/**
 * Direction 1: a technique scans ALL recipes and saves an association for each
 * recipe it matches above the threshold. Used when a NEW technique is ingested.
 */
export async function associateTechnique(
  techniqueId: Id<"techniques">,
  options: AssociateOptions = {},
): Promise<SavedAssociation[]> {
  const convex = getClient(options.convex);
  const minScore = options.minScore ?? ASSOCIATION_MIN_SCORE;

  const technique = await convex.query(api.techniques.getTechnique, { techniqueId });
  if (!technique) throw new Error(`Technique ${techniqueId} not found.`);

  const recipes = await loadRecipes(convex);
  const source: Embedded = {
    id: technique._id,
    title: technique.title,
    tags: technique.tags,
    embedding: technique.embedding,
  };
  // The resolver must cover the source AND every candidate.
  const resolver = resolverFor([source, ...recipes]);
  const matches = associate(source, recipes, resolver, {
    minScore,
    isQualifyingTag: isSubstantiveTag,
  });

  return persistMatches(
    convex,
    { id: technique._id, title: technique.title, applicability: technique.applicability },
    matches,
  );
}

/**
 * Direction 2: a recipe scans ALL techniques and saves an association for each
 * technique it matches above the threshold. Used when a NEW recipe is ingested,
 * so association works regardless of whether the recipe or the technique came
 * first.
 */
export async function associateRecipe(
  recipeId: Id<"recipes">,
  options: AssociateOptions = {},
): Promise<SavedAssociation[]> {
  const convex = getClient(options.convex);
  const minScore = options.minScore ?? ASSOCIATION_MIN_SCORE;

  const recipe = await convex.query(api.recipes.getRecipe, { recipeId });
  if (!recipe) throw new Error(`Recipe ${recipeId} not found.`);

  const techniques = await loadTechniques(convex);
  const source: Embedded = {
    id: recipe._id,
    title: recipe.title,
    tags: recipe.tags,
    embedding: recipe.embedding,
  };
  const resolver = resolverFor([source, ...techniques]);
  const matches = associate(source, techniques, resolver, {
    minScore,
    isQualifyingTag: isSubstantiveTag,
  });

  // Here the SOURCE is the recipe and the MATCHES are techniques. saveAssociation
  // is keyed (recipeId, techniqueId); the reason describes the technique, so
  // build it per matched technique (we need each technique's applicability).
  const techById = new Map(
    (await convex.query(api.techniques.listTechniques, {})).map((t) => [t._id, t]),
  );
  const saved: SavedAssociation[] = [];
  for (const m of matches) {
    const tech = techById.get(m.item.id as Id<"techniques">);
    const reason = buildReason(m.sharedTags, tech?.applicability ?? "");
    await convex.mutation(api.associations.saveAssociation, {
      recipeId: recipe._id,
      techniqueId: m.item.id as Id<"techniques">,
      score: m.score,
      reason,
    });
    saved.push({
      recipeId: recipe._id,
      techniqueId: m.item.id as Id<"techniques">,
      recipeTitle: recipe.title,
      techniqueTitle: m.item.title,
      score: m.score,
      sharedTags: m.sharedTags,
      reason,
    });
  }
  return saved;
}

/**
 * Full rebuild: associate EVERY technique against EVERY recipe. Idempotent
 * (saveAssociation upserts), so it can be run last after a seed settles and
 * re-run later. Loads each set once and reuses one resolver per direction.
 */
export async function reassociateAll(
  options: AssociateOptions = {},
): Promise<SavedAssociation[]> {
  const convex = getClient(options.convex);
  const minScore = options.minScore ?? ASSOCIATION_MIN_SCORE;

  const recipes = await loadRecipes(convex);
  const techniqueRows = await convex.query(api.techniques.listTechniques, {});

  const all: SavedAssociation[] = [];
  // One resolver covering both sets is valid in either direction (ids are unique).
  const resolver = resolverFor([
    ...recipes,
    ...techniqueRows.map((t) => ({
      id: t._id,
      title: t.title,
      tags: t.tags,
      embedding: t.embedding,
    })),
  ]);

  for (const t of techniqueRows) {
    const source: Embedded = {
      id: t._id,
      title: t.title,
      tags: t.tags,
      embedding: t.embedding,
    };
    const matches = associate(source, recipes, resolver, {
    minScore,
    isQualifyingTag: isSubstantiveTag,
  });
    const saved = await persistMatches(
      convex,
      { id: t._id, title: t.title, applicability: t.applicability },
      matches,
    );
    all.push(...saved);
  }
  return all;
}
