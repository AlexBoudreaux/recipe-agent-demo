import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Placeholder schema. The real data model (recipes, techniques, menus,
// associations, menu plans, vector index, file storage) lands in a later chunk.
// Keeping one trivial table here so codegen + deploy succeed and the project links.
export default defineSchema({
  placeholder: defineTable({
    note: v.string(),
  }),
});
