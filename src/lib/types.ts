/**
 * Plain, dependency-free domain types for the pure-logic modules.
 *
 * These intentionally mirror the Convex "Data model" in the PRD so the pure
 * modules and the Convex schema (built in parallel) line up. They do NOT import
 * from convex/ on purpose: these modules stay pure and dependency-free so they
 * are trivially unit-testable. The Convex layer can structurally re-use or map
 * to these shapes without creating a dependency in this direction.
 */

/** The unit of measure on an ingredient line. */
export type Unit =
  // volume
  | "tsp"
  | "tbsp"
  | "fl oz"
  | "cup"
  | "pint"
  | "quart"
  | "gallon"
  | "ml"
  | "l"
  // weight
  | "oz"
  | "lb"
  | "g"
  | "kg"
  // count / unitless (never converted, only scaled)
  | "count"
  | "pinch"
  | "clove"
  | "can"
  | "bunch"
  | "";

/** The dimension a unit belongs to. Conversion is only ever within a dimension. */
export type Dimension = "volume" | "weight" | "count";

/** A normalized ingredient line. Matches the PRD data model exactly. */
export interface Ingredient {
  name: string;
  quantity: number;
  unit: Unit;
  /**
   * Preparation note, e.g. "minced", "diced". Optional to match the Convex
   * `ingredientValidator` ({name,quantity,unit,prep?}); may be omitted/empty.
   */
  prep?: string;
}

/** An ingredient a technique contributes (no prep field, per the PRD). */
export interface AddedIngredient {
  name: string;
  quantity: number;
  unit: Unit;
}

/** Controlled recipe categories. Exactly the PRD set. */
export type Category =
  | "main"
  | "side"
  | "dessert"
  | "beverage"
  | "appetizer"
  | "sauce";

/**
 * What a tag describes. The controlled vocabulary is split into these kinds.
 * "ingredient" is a SUBSTANTIVE main-ingredient tag (asparagus, corn, potato)
 * for dishes whose identity is a vegetable, not a protein or a dish-form.
 */
export type TagKind = "protein" | "dish" | "ingredient";

/**
 * A controlled-vocabulary tag. `value` is the canonical lowercase token used
 * for matching/storage; `kind` says whether it is a protein or a dish-type tag.
 */
export interface Tag {
  value: string;
  kind: TagKind;
}

/** Embedding vector. Production uses text-embedding-3-small (1536 dims). */
export type Embedding = number[];

/**
 * A recipe, trimmed to the fields the pure modules actually read. The full
 * Convex record carries more (imageId, createdAt, sourceUrl, ...). These
 * modules only need identity, the controlled tags, the ingredient list, the
 * yield, and the embedding.
 */
export interface Recipe {
  id: string;
  title: string;
  category: Category;
  tags: string[];
  ingredients: Ingredient[];
  /** How much the recipe makes, used as the scaling baseline. */
  yield: { amount: number; unit: Unit };
  embedding?: Embedding;
}

/** A reusable technique, trimmed to the fields the pure modules read. */
export interface Technique {
  id: string;
  title: string;
  /** Free text describing where this technique applies; embedded in prod. */
  applicability: string;
  tags: string[];
  addedIngredients: AddedIngredient[];
  embedding?: Embedding;
}
