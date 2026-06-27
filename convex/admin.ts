import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * DEV-ONLY reset. Wipes the whole working set so a seed run starts clean:
 * recipes (+ their stored cover images), techniques, associations, menus,
 * menuPlans. Single-user demo, no auth — do NOT expose this in a real product.
 */
/**
 * DEV-ONLY single-recipe delete (+ its stored image). Used to prune accidental
 * duplicate rows (e.g. a concurrent ingest that re-saved the same source).
 */
export const deleteRecipe = mutation({
  args: { recipeId: v.id("recipes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.recipeId);
    if (!r) return null;
    if (r.imageId) await ctx.storage.delete(r.imageId);
    await ctx.db.delete(args.recipeId);
    return null;
  },
});

export const clearAll = mutation({
  args: {},
  returns: v.object({
    recipes: v.number(),
    techniques: v.number(),
    associations: v.number(),
    menus: v.number(),
    menuPlans: v.number(),
    images: v.number(),
  }),
  handler: async (ctx) => {
    let images = 0;

    const recipes = await ctx.db.query("recipes").collect();
    for (const r of recipes) {
      if (r.imageId) {
        await ctx.storage.delete(r.imageId);
        images++;
      }
      await ctx.db.delete(r._id);
    }

    const techniques = await ctx.db.query("techniques").collect();
    for (const t of techniques) await ctx.db.delete(t._id);

    const associations = await ctx.db.query("associations").collect();
    for (const a of associations) await ctx.db.delete(a._id);

    const menus = await ctx.db.query("menus").collect();
    for (const m of menus) await ctx.db.delete(m._id);

    const menuPlans = await ctx.db.query("menuPlans").collect();
    for (const p of menuPlans) await ctx.db.delete(p._id);

    return {
      recipes: recipes.length,
      techniques: techniques.length,
      associations: associations.length,
      menus: menus.length,
      menuPlans: menuPlans.length,
      images,
    };
  },
});
