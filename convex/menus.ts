import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const createMenu = mutation({
  args: {
    name: v.string(),
    targetServings: v.optional(v.number()),
    recipeRefs: v.optional(v.array(v.id("recipes"))),
  },
  returns: v.id("menus"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("menus", {
      name: args.name,
      targetServings: args.targetServings,
      recipeRefs: args.recipeRefs ?? [],
      createdAt: Date.now(),
    });
  },
});

// Append a recipe to a menu's ordered list. No-op if already present.
export const addRecipeToMenu = mutation({
  args: {
    menuId: v.id("menus"),
    recipeId: v.id("recipes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const menu = await ctx.db.get(args.menuId);
    if (!menu) throw new Error("Menu not found");
    if (menu.recipeRefs.includes(args.recipeId)) return null;
    await ctx.db.patch(args.menuId, {
      recipeRefs: [...menu.recipeRefs, args.recipeId],
    });
    return null;
  },
});

export const setMenuServings = mutation({
  args: { menuId: v.id("menus"), targetServings: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.menuId, { targetServings: args.targetServings });
    return null;
  },
});

// Menu with its recipes hydrated (in stored order) and image URLs resolved.
export const getMenu = query({
  args: { menuId: v.id("menus") },
  handler: async (ctx, args) => {
    const menu = await ctx.db.get(args.menuId);
    if (!menu) return null;

    const recipes = await Promise.all(
      menu.recipeRefs.map(async (id) => {
        const recipe = await ctx.db.get(id);
        if (!recipe) return null;
        const imageUrl = recipe.imageId
          ? await ctx.storage.getUrl(recipe.imageId)
          : null;
        return { ...recipe, imageUrl };
      }),
    );

    return {
      ...menu,
      recipes: recipes.filter((r): r is NonNullable<typeof r> => r !== null),
    };
  },
});

export const listMenus = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("menus")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
  },
});
