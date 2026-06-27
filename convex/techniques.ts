import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { addedIngredientValidator, sourceTypeValidator } from "./schema";

// Save a fully-extracted technique.
export const saveTechnique = mutation({
  args: {
    title: v.string(),
    sourceUrl: v.string(),
    sourceType: sourceTypeValidator,
    description: v.string(),
    applicability: v.string(),
    steps: v.array(v.string()),
    addedIngredients: v.array(addedIngredientValidator),
    embedding: v.array(v.float64()),
  },
  returns: v.id("techniques"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("techniques", {
      title: args.title,
      sourceUrl: args.sourceUrl,
      sourceType: args.sourceType,
      description: args.description,
      applicability: args.applicability,
      steps: args.steps,
      addedIngredients: args.addedIngredients,
      embedding: args.embedding,
      createdAt: Date.now(),
    });
  },
});

export const getTechnique = query({
  args: { techniqueId: v.id("techniques") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.techniqueId);
  },
});

export const listTechniques = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("techniques")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
  },
});

// Techniques associated with a recipe, each carrying its association score +
// reason (explainability). These are stored-but-NOT-yet-incorporated by design:
// the UI marks them as available know-how, the human chooses what to apply.
export const getTechniquesForRecipe = query({
  args: { recipeId: v.id("recipes") },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("associations")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
      .collect();

    const results = await Promise.all(
      links.map(async (link) => {
        const technique = await ctx.db.get(link.techniqueId);
        if (!technique) return null;
        return {
          ...technique,
          associationId: link._id,
          score: link.score,
          reason: link.reason ?? null,
        };
      }),
    );

    // Highest match score first.
    return results
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score);
  },
});
