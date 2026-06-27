import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  consolidatedIngredientValidator,
  perRecipeStepsValidator,
  shoppingGroupValidator,
} from "./schema";

// Save a generated plan as a NEW versioned snapshot. Version auto-increments
// per menu so regenerating never overwrites history.
export const saveMenuPlan = mutation({
  args: {
    menuId: v.id("menus"),
    servings: v.number(),
    unitSystem: v.union(v.literal("metric"), v.literal("imperial")),
    appliedTechniques: v.array(v.id("techniques")),
    consolidatedIngredients: v.array(consolidatedIngredientValidator),
    perRecipeSteps: v.array(perRecipeStepsValidator),
    shoppingList: v.array(shoppingGroupValidator),
  },
  returns: v.object({ planId: v.id("menuPlans"), version: v.number() }),
  handler: async (ctx, args) => {
    // latest existing version for this menu
    const latest = await ctx.db
      .query("menuPlans")
      .withIndex("by_menu_version", (q) => q.eq("menuId", args.menuId))
      .order("desc")
      .first();
    const version = (latest?.version ?? 0) + 1;

    const planId = await ctx.db.insert("menuPlans", {
      menuId: args.menuId,
      createdAt: Date.now(),
      version,
      servings: args.servings,
      unitSystem: args.unitSystem,
      appliedTechniques: args.appliedTechniques,
      consolidatedIngredients: args.consolidatedIngredients,
      perRecipeSteps: args.perRecipeSteps,
      shoppingList: args.shoppingList,
    });

    return { planId, version };
  },
});

export const getMenuPlan = query({
  args: { planId: v.id("menuPlans") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.planId);
  },
});

// Most recent plan version for a menu (what the UI opens by default).
export const getLatestMenuPlan = query({
  args: { menuId: v.id("menus") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuPlans")
      .withIndex("by_menu_version", (q) => q.eq("menuId", args.menuId))
      .order("desc")
      .first();
  },
});

// All versions for a menu, newest first (version history).
export const listMenuPlans = query({
  args: { menuId: v.id("menus") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuPlans")
      .withIndex("by_menu_version", (q) => q.eq("menuId", args.menuId))
      .order("desc")
      .collect();
  },
});
