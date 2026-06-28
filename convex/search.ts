/**
 * search — combined tag + meaning recipe search (PRD story 22).
 *
 * Convex vector search (ctx.vectorSearch) can only run in an ACTION, so the
 * whole combined search lives here. The flow:
 *   1. Embed the query text (text-embedding-3-small, 1536 dims) via a plain
 *      fetch to OpenAI. A plain fetch (not the AI SDK) keeps the Convex bundle
 *      clean and runs in the default V8 runtime. OPENAI_API_KEY is a Convex
 *      environment variable (set with `npx convex env set`).
 *   2. ctx.vectorSearch("recipes", "by_embedding", { vector, limit, filter })
 *      for the MEANING ranking, optionally filtered to a category (the vector
 *      index's filterField).
 *   3. Pull the deterministic TAG/category matches via api.recipes.findRecipes.
 *   4. UNION both candidate sets, hydrate the rows, and re-rank by a combined
 *      score = cosine meaning score + a per-shared-tag boost. This is what makes
 *      it "tags AND meaning": tag matches guarantee precision (a near-miss with
 *      no shared tag ranks below a real tag match) while the vector score orders
 *      within that.
 *
 * Single entry point `searchRecipes`, callable from BOTH 7B's search UI
 * (useAction) and the agent's search-mode tool (convex.action over HTTP).
 */
import { action } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { categoryValidator } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";

/** One ranked search hit. Explicit type so the action handler's return is
 * annotated, which breaks the self-referential `api` inference cycle. */
type SearchResult = {
  id: Id<"recipes">;
  title: string;
  category: Doc<"recipes">["category"];
  summary: string;
  tags: string[];
  imageUrl: string | null;
  score: number;
  meaningScore: number;
  sharedTags: string[];
};

const EMBEDDING_MODEL = "text-embedding-3-small";
/** Boost added to a candidate's score per requested tag it carries. Tuned so a
 * couple of shared tags clearly outrank a pure semantic near-miss. */
const TAG_WEIGHT = 0.15;

/** Embed query text via OpenAI's REST API (plain fetch, V8-runtime friendly). */
async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in the Convex deployment env.");
  }
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`OpenAI embeddings failed: ${detail}`);
  }
  const body = (await res.json()) as { data?: Array<{ embedding: number[] }> };
  const embedding = body.data?.[0]?.embedding;
  if (!embedding) throw new Error("OpenAI embeddings returned no vector.");
  return embedding;
}

/**
 * Combined tag + meaning search over the recipe library. Returns recipes ranked
 * by a blended score, newest-relevant first. Empty query text is allowed (falls
 * back to a pure tag/category filter).
 */
export const searchRecipes = action({
  args: {
    queryText: v.string(),
    category: v.optional(categoryValidator),
    tags: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  // Explicit returns validator: also breaks the self-referential `api` type
  // cycle (this action calls ctx.runQuery(api.recipes.*), and inferring its
  // return through `api` would otherwise widen the whole api type to `any`).
  returns: v.array(
    v.object({
      id: v.id("recipes"),
      title: v.string(),
      category: categoryValidator,
      summary: v.string(),
      tags: v.array(v.string()),
      imageUrl: v.union(v.string(), v.null()),
      score: v.number(),
      meaningScore: v.number(),
      sharedTags: v.array(v.string()),
    }),
  ),
  handler: async (ctx, args): Promise<SearchResult[]> => {
    const limit = args.limit ?? 10;
    const tags = args.tags ?? [];
    const query = args.queryText.trim();

    // --- 1+2) MEANING: vector search (skipped if there is no query text) ---
    const vectorScore = new Map<string, number>();
    if (query.length > 0) {
      const vector = await embedQuery(query);
      const poolSize = Math.min(Math.max(limit * 3, 24), 256);
      const results = await ctx.vectorSearch("recipes", "by_embedding", {
        vector,
        limit: poolSize,
        ...(args.category
          ? { filter: (q) => q.eq("category", args.category!) }
          : {}),
      });
      for (const r of results) vectorScore.set(r._id, r._score);
    }

    // --- 3) TAGS: deterministic tag/category matches ---
    const tagRows = await ctx.runQuery(api.recipes.findRecipes, {
      ...(args.category ? { category: args.category } : {}),
      ...(tags.length ? { tags } : {}),
      limit: 200,
    });
    const tagMatchIds = new Set(tagRows.map((r) => r._id as string));

    // --- 4) UNION + hydrate + combined re-rank ---
    const candidateIds = new Set<string>([...vectorScore.keys(), ...tagMatchIds]);
    if (candidateIds.size === 0) return [];

    const rows = await ctx.runQuery(api.recipes.getRecipesByIds, {
      ids: [...candidateIds] as Id<"recipes">[],
    });

    const ranked = rows
      .map((r) => {
        const meaning = vectorScore.get(r._id) ?? 0;
        const sharedTags = tags.filter((t) => r.tags.includes(t));
        const score = meaning + sharedTags.length * TAG_WEIGHT;
        return {
          id: r._id,
          title: r.title,
          category: r.category,
          summary: r.summary,
          tags: r.tags,
          imageUrl: r.imageUrl,
          score,
          meaningScore: meaning,
          sharedTags,
        };
      })
      .sort((a, b) =>
        b.score !== a.score ? b.score - a.score : a.title.localeCompare(b.title),
      )
      .slice(0, limit);

    return ranked;
  },
});
