import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Upsert a recipe<->technique association with its match score + reason.
// Bidirectional association engine calls this for each match it computes.
// Also keeps recipe.techniqueRefs in sync so a recipe row carries its links.
export const saveAssociation = mutation({
  args: {
    recipeId: v.id("recipes"),
    techniqueId: v.id("techniques"),
    score: v.number(),
    reason: v.optional(v.string()),
  },
  returns: v.id("associations"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("associations")
      .withIndex("by_recipe_technique", (q) =>
        q.eq("recipeId", args.recipeId).eq("techniqueId", args.techniqueId),
      )
      .unique();

    let associationId;
    if (existing) {
      await ctx.db.patch(existing._id, {
        score: args.score,
        reason: args.reason,
      });
      associationId = existing._id;
    } else {
      associationId = await ctx.db.insert("associations", {
        recipeId: args.recipeId,
        techniqueId: args.techniqueId,
        score: args.score,
        reason: args.reason,
        createdAt: Date.now(),
      });
    }

    // keep denormalized refs on the recipe in sync
    const recipe = await ctx.db.get(args.recipeId);
    if (recipe && !recipe.techniqueRefs.includes(args.techniqueId)) {
      await ctx.db.patch(args.recipeId, {
        techniqueRefs: [...recipe.techniqueRefs, args.techniqueId],
      });
    }

    return associationId;
  },
});

// Associations for a technique (the recipe side), for bidirectional views.
export const getRecipesForTechnique = query({
  args: { techniqueId: v.id("techniques") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("associations")
      .withIndex("by_technique", (q) => q.eq("techniqueId", args.techniqueId))
      .collect();

    const results = await Promise.all(
      links.map(async (link) => {
        const recipe = await ctx.db.get(link.recipeId);
        if (!recipe) return null;
        return {
          ...recipe,
          associationId: link._id,
          score: link.score,
          reason: link.reason ?? null,
        };
      }),
    );

    return results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score);
  },
});
