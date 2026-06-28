import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  ingredientValidator,
  yieldValidator,
  sourceTypeValidator,
  categoryValidator,
} from "./schema";

// Save a fully-extracted recipe. imageId is intentionally NOT accepted here:
// image generation is async and must never block a save (see setRecipeImage).
export const saveRecipe = mutation({
  args: {
    title: v.string(),
    sourceUrl: v.string(),
    sourceType: sourceTypeValidator,
    category: categoryValidator,
    summary: v.string(),
    ingredients: v.array(ingredientValidator),
    yield: yieldValidator,
    steps: v.array(v.string()),
    tags: v.array(v.string()),
    embedding: v.array(v.float64()),
    // optional: pre-link techniques at save time (association engine usually
    // does this separately via saveAssociation, but allow seeding).
    techniqueRefs: v.optional(v.array(v.id("techniques"))),
  },
  returns: v.id("recipes"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("recipes", {
      title: args.title,
      sourceUrl: args.sourceUrl,
      sourceType: args.sourceType,
      category: args.category,
      summary: args.summary,
      ingredients: args.ingredients,
      yield: args.yield,
      steps: args.steps,
      tags: args.tags,
      techniqueRefs: args.techniqueRefs ?? [],
      embedding: args.embedding,
      createdAt: Date.now(),
    });
  },
});

// Attach (or replace) the async-generated cover image on a recipe.
export const setRecipeImage = mutation({
  args: {
    recipeId: v.id("recipes"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.recipeId, { imageId: args.storageId });
    return null;
  },
});

// Single recipe by id, with a served image URL resolved for convenience.
export const getRecipe = query({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) return null;
    const imageUrl = recipe.imageId
      ? await ctx.storage.getUrl(recipe.imageId)
      : null;
    return { ...recipe, imageUrl };
  },
});

// Whole library, newest first. Light list for the library grid.
export const listRecipes = query({
  args: {},
  handler: async (ctx) => {
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
    return await Promise.all(
      recipes.map(async (r) => ({
        ...r,
        imageUrl: r.imageId ? await ctx.storage.getUrl(r.imageId) : null,
      })),
    );
  },
});

// Load a set of recipes by id, preserving the caller's order (used by the
// vector search action to hydrate the rows the vector index returned by id).
// Missing ids are skipped. Image URLs are resolved for convenience.
export const getRecipesByIds = query({
  args: { ids: v.array(v.id("recipes")) },
  handler: async (ctx, args) => {
    const rows = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return await Promise.all(
      rows
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .map(async (r) => ({
          ...r,
          imageUrl: r.imageId ? await ctx.storage.getUrl(r.imageId) : null,
        })),
    );
  },
});

// Tag/category filtered search.
//
// VECTOR-SEARCH SEAM: this query is the deterministic (tag + category) filter.
// Convex vector search (ctx.vectorSearch on recipes.by_embedding) can only run
// in an ACTION, not a query. The planned wiring for combined tag+meaning search:
//   1. An action embeds the user's query text.
//   2. It calls ctx.vectorSearch("recipes", "by_embedding", { vector, limit,
//      filter: q => q.eq("category", category) }) -> ordered {_id, _score}.
//   3. It loads those ids and optionally intersects/re-ranks with the tag matches
//      returned by THIS query (calling it via ctx.runQuery).
// Keeping the structured filter here means the action only adds ranking on top;
// nothing about the filter contract changes when vector search lands.
export const findRecipes = query({
  args: {
    category: v.optional(categoryValidator),
    // match recipes containing ANY of these tags (controlled vocab)
    tags: v.optional(v.array(v.string())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Use the category index when filtering by category, else scan newest-first.
    let rows;
    if (args.category !== undefined) {
      const category = args.category;
      rows = await ctx.db
        .query("recipes")
        .withIndex("by_category", (q) => q.eq("category", category))
        .collect();
    } else {
      rows = await ctx.db
        .query("recipes")
        .withIndex("by_createdAt")
        .order("desc")
        .collect();
    }

    const tags = args.tags;
    const filtered =
      tags && tags.length > 0
        ? rows.filter((r) => r.tags.some((t) => tags.includes(t)))
        : rows;

    return filtered.slice(0, limit);
  },
});
