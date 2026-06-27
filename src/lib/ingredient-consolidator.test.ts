import { describe, it, expect } from "vitest";
import {
  consolidate,
  consolidateFlat,
  type RecipeIngredients,
} from "./ingredient-consolidator";
import type { Ingredient } from "./types";

const ing = (
  name: string,
  quantity: number,
  unit: Ingredient["unit"],
  prep = "",
): Ingredient => ({ name, quantity, unit, prep });

describe("consolidate — identical ingredients merge", () => {
  it("sums quantities of the same name + unit across recipes", () => {
    const recipes: RecipeIngredients[] = [
      { ingredients: [ing("olive oil", 2, "tbsp")] },
      { ingredients: [ing("olive oil", 3, "tbsp")] },
    ];
    const out = consolidate(recipes);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ name: "olive oil", quantity: 5, unit: "tbsp" });
  });

  it("merges case- and whitespace-insensitively, keeping first display name", () => {
    const out = consolidate([
      { ingredients: [ing("Olive Oil", 1, "tbsp")] },
      { ingredients: [ing("olive  oil", 1, "tbsp")] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("Olive Oil");
    expect(out[0].quantity).toBe(2);
  });
});

describe("consolidate — distinct ingredients stay separate", () => {
  it("keeps different names apart", () => {
    const out = consolidate([
      { ingredients: [ing("garlic", 2, "clove"), ing("onion", 1, "count")] },
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((l) => l.name).sort()).toEqual(["garlic", "onion"]);
  });

  it("keeps the same name under different units on separate lines", () => {
    const out = consolidate([
      { ingredients: [ing("flour", 1, "cup")] },
      { ingredients: [ing("flour", 100, "g")] },
    ]);
    expect(out).toHaveLength(2);
    const cup = out.find((l) => l.unit === "cup");
    const g = out.find((l) => l.unit === "g");
    expect(cup?.quantity).toBe(1);
    expect(g?.quantity).toBe(100);
  });
});

describe("consolidate — scaling", () => {
  it("applies a per-recipe scale factor before summing", () => {
    const out = consolidate([
      { ingredients: [ing("butter", 4, "tbsp")], scale: 2 },
      { ingredients: [ing("butter", 1, "tbsp")], scale: 3 },
    ]);
    // 4*2 + 1*3 = 11
    expect(out[0].quantity).toBe(11);
  });

  it("defaults scale to 1 when omitted", () => {
    const out = consolidate([{ ingredients: [ing("salt", 1, "tsp")] }]);
    expect(out[0].quantity).toBe(1);
  });

  it("scales fractional factors correctly", () => {
    const out = consolidate([
      { ingredients: [ing("sugar", 3, "cup")], scale: 0.5 },
    ]);
    expect(out[0].quantity).toBeCloseTo(1.5, 9);
  });
});

describe("consolidate — determinism + empties", () => {
  it("preserves first-appearance order", () => {
    const out = consolidate([
      { ingredients: [ing("c", 1, "count"), ing("a", 1, "count")] },
      { ingredients: [ing("b", 1, "count"), ing("a", 1, "count")] },
    ]);
    expect(out.map((l) => l.name)).toEqual(["c", "a", "b"]);
  });

  it("returns an empty list for no recipes", () => {
    expect(consolidate([])).toEqual([]);
  });
});

describe("consolidateFlat", () => {
  it("scales and consolidates a flat list", () => {
    const out = consolidateFlat(
      [ing("egg", 2, "count"), ing("egg", 1, "count")],
      2,
    );
    expect(out).toEqual([{ name: "egg", quantity: 6, unit: "count" }]);
  });
});
