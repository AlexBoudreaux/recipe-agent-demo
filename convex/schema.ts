import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Embedding dimension for text-embedding-3-small.
export const EMBEDDING_DIM = 1536;

// Reusable shapes. These MUST match the pure-logic modules built in parallel.
// Ingredient: {name, quantity, unit, prep}
export const ingredientValidator = v.object({
  name: v.string(),
  quantity: v.number(),
  unit: v.string(),
  prep: v.optional(v.string()),
});

// Technique-added ingredient: {name, quantity, unit} (no prep)
export const addedIngredientValidator = v.object({
  name: v.string(),
  quantity: v.number(),
  unit: v.string(),
});

// Recipe yield: {amount, unit}
export const yieldValidator = v.object({
  amount: v.number(),
  unit: v.string(),
});

export const sourceTypeValidator = v.union(
  v.literal("blog"),
  v.literal("youtube"),
);

// Recipe categories (controlled).
export const categoryValidator = v.union(
  v.literal("main"),
  v.literal("side"),
  v.literal("dessert"),
  v.literal("beverage"),
  v.literal("appetizer"),
  v.literal("sauce"),
);

// MenuPlan sub-shapes.
// Consolidated ingredient line for the whole menu (post merge + scale).
export const consolidatedIngredientValidator = v.object({
  name: v.string(),
  quantity: v.number(),
  unit: v.string(),
  // which recipes contributed to this line, for explainability
  fromRecipeIds: v.optional(v.array(v.id("recipes"))),
});

// Steps for one recipe after techniques woven in + scaling.
export const perRecipeStepsValidator = v.object({
  recipeId: v.id("recipes"),
  title: v.string(),
  steps: v.array(v.string()),
});

// Shopping list grouped by store area (aisle grouping done by LLM at plan time).
export const shoppingGroupValidator = v.object({
  area: v.string(),
  items: v.array(
    v.object({
      name: v.string(),
      quantity: v.number(),
      unit: v.string(),
    }),
  ),
});

export default defineSchema({
  menus: defineTable({
    name: v.string(),
    createdAt: v.number(),
    // ordered references to recipes; order is meaningful (course order)
    recipeRefs: v.array(v.id("recipes")),
    targetServings: v.optional(v.number()),
  }).index("by_createdAt", ["createdAt"]),

  recipes: defineTable({
    title: v.string(),
    sourceUrl: v.string(),
    sourceType: sourceTypeValidator,
    category: categoryValidator,
    summary: v.string(),
    ingredients: v.array(ingredientValidator),
    yield: yieldValidator,
    steps: v.array(v.string()),
    tags: v.array(v.string()), // controlled vocab enforced in logic layer
    techniqueRefs: v.array(v.id("techniques")),
    imageId: v.optional(v.id("_storage")), // async-generated cover, may be absent
    embedding: v.array(v.float64()), // of title+summary+tags
    createdAt: v.number(),
  })
    .index("by_category", ["category"])
    .index("by_createdAt", ["createdAt"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIM,
      filterFields: ["category"],
    }),

  techniques: defineTable({
    title: v.string(),
    sourceUrl: v.string(),
    sourceType: sourceTypeValidator,
    description: v.string(),
    applicability: v.string(), // text, embedded
    steps: v.array(v.string()),
    addedIngredients: v.array(addedIngredientValidator),
    embedding: v.array(v.float64()),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: EMBEDDING_DIM,
    }),

  // Bidirectional link recipe <-> technique with a match score for explainability.
  associations: defineTable({
    recipeId: v.id("recipes"),
    techniqueId: v.id("techniques"),
    score: v.number(), // 0..1 match score
    reason: v.optional(v.string()), // human-readable why-matched
    createdAt: v.number(),
  })
    .index("by_recipe", ["recipeId"])
    .index("by_technique", ["techniqueId"])
    .index("by_recipe_technique", ["recipeId", "techniqueId"]),

  // Versioned snapshot of a generated menu plan. New version per regenerate.
  menuPlans: defineTable({
    menuId: v.id("menus"),
    createdAt: v.number(),
    version: v.number(),
    servings: v.number(),
    unitSystem: v.union(v.literal("metric"), v.literal("imperial")),
    appliedTechniques: v.array(v.id("techniques")),
    consolidatedIngredients: v.array(consolidatedIngredientValidator),
    perRecipeSteps: v.array(perRecipeStepsValidator),
    shoppingList: v.array(shoppingGroupValidator), // grouped by store area
  })
    .index("by_menu", ["menuId"])
    .index("by_menu_version", ["menuId", "version"]),
});
