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

/**
 * DEV-ONLY single-technique delete (+ its associations and the denormalized
 * techniqueRefs that point at it). Mirrors deleteRecipe; used to prune a
 * technique row (e.g. a verification ingest) without disturbing the rest.
 */
export const deleteTechnique = mutation({
  args: { techniqueId: v.id("techniques") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query("associations")
      .withIndex("by_technique", (q) => q.eq("techniqueId", args.techniqueId))
      .collect();
    for (const link of links) {
      const recipe = await ctx.db.get(link.recipeId);
      if (recipe) {
        await ctx.db.patch(link.recipeId, {
          techniqueRefs: recipe.techniqueRefs.filter(
            (id) => id !== args.techniqueId,
          ),
        });
      }
      await ctx.db.delete(link._id);
    }
    await ctx.db.delete(args.techniqueId);
    return null;
  },
});

/**
 * DEV-ONLY: wipe ONLY techniques + their associations, leaving recipes, menus,
 * and menu plans intact. Used to re-seed the technique layer from scratch
 * (chunk 7A refinement) without re-ingesting the whole recipe library. Also
 * clears the denormalized techniqueRefs on every recipe so nothing dangles.
 */
export const clearTechniques = mutation({
  args: {},
  returns: v.object({
    techniques: v.number(),
    associations: v.number(),
  }),
  handler: async (ctx) => {
    const associations = await ctx.db.query("associations").collect();
    for (const a of associations) await ctx.db.delete(a._id);

    const techniques = await ctx.db.query("techniques").collect();
    for (const t of techniques) await ctx.db.delete(t._id);

    // Drop dangling technique refs on recipes.
    const recipes = await ctx.db.query("recipes").collect();
    for (const r of recipes) {
      if (r.techniqueRefs.length > 0) {
        await ctx.db.patch(r._id, { techniqueRefs: [] });
      }
    }

    return { techniques: techniques.length, associations: associations.length };
  },
});

/**
 * DEV-ONLY: union new controlled tags onto a recipe (targeted re-tag). Used to
 * give a cluster the substantive main-ingredient tag its technique needs to
 * bind to (e.g. tag the asparagus dish "asparagus"). Returns the new tag list.
 */
export const addRecipeTags = mutation({
  args: { recipeId: v.id("recipes"), tags: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.recipeId);
    if (!r) throw new Error(`Recipe ${args.recipeId} not found`);
    const merged = [...new Set([...r.tags, ...args.tags])];
    await ctx.db.patch(args.recipeId, { tags: merged });
    return merged;
  },
});

/** DEV-ONLY: union new controlled tags onto a technique. */
export const addTechniqueTags = mutation({
  args: { techniqueId: v.id("techniques"), tags: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.techniqueId);
    if (!t) throw new Error(`Technique ${args.techniqueId} not found`);
    const merged = [...new Set([...t.tags, ...args.tags])];
    await ctx.db.patch(args.techniqueId, { tags: merged });
    return merged;
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
