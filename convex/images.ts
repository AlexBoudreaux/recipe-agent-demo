import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Step 1 of image upload: get a short-lived URL the client/seeder POSTs the
// image bytes to. The POST response returns a { storageId } which is then
// handed to setRecipeImage (in recipes.ts) to attach it to a recipe.
// Flow: generateUploadUrl -> POST bytes -> setRecipeImage(recipeId, storageId).
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

// Resolve a served (CDN) URL for a stored image. Returns null if missing.
export const getImageUrl = query({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
