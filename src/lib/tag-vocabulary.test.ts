import { describe, it, expect } from "vitest";
import {
  CATEGORIES,
  assignTag,
  assignTags,
  isCategory,
  isControlledTag,
  resolveTag,
  toCategory,
} from "./tag-vocabulary";

describe("categories — closed controlled set", () => {
  it("contains exactly the six PRD categories", () => {
    expect([...CATEGORIES].sort()).toEqual(
      ["appetizer", "beverage", "dessert", "main", "sauce", "side"].sort(),
    );
  });
  it("isCategory accepts members case-insensitively", () => {
    expect(isCategory("Dessert")).toBe(true);
    expect(isCategory("side")).toBe(true);
  });
  it("isCategory rejects non-members", () => {
    expect(isCategory("brunch")).toBe(false);
  });
  it("toCategory maps members through and defaults unknowns to main", () => {
    expect(toCategory("Sauce")).toBe("sauce");
    expect(toCategory("breakfast")).toBe("main");
  });
});

describe("resolveTag — inputs map to existing controlled tags", () => {
  it("maps a canonical tag to itself with its kind", () => {
    expect(resolveTag("chicken")).toEqual({ value: "chicken", kind: "protein" });
    expect(resolveTag("pasta")).toEqual({ value: "pasta", kind: "dish" });
  });
  it("maps synonyms to the canonical protein", () => {
    expect(resolveTag("prawns")?.value).toBe("shrimp");
    expect(resolveTag("salmon")?.value).toBe("fish");
    expect(resolveTag("steak")?.value).toBe("beef");
  });
  it("maps synonyms to the canonical dish type", () => {
    expect(resolveTag("spaghetti")?.value).toBe("pasta");
    expect(resolveTag("ramen")?.value).toBe("noodle");
    expect(resolveTag("burger")?.value).toBe("sandwich");
  });
  it("normalizes case and whitespace", () => {
    expect(resolveTag("  Stir  Fry ")?.value).toBe("stir-fry");
  });
  it("folds simple plurals to a known singular", () => {
    expect(resolveTag("tacos")?.value).toBe("taco");
  });
  it("returns null when nothing in the vocabulary fits", () => {
    expect(resolveTag("quinoa")).toBeNull();
    expect(resolveTag("")).toBeNull();
  });
});

describe("assignTag — extension only when nothing fits", () => {
  it("uses an existing tag (extended:false) when one fits", () => {
    expect(assignTag("prawns")).toEqual({
      tag: { value: "shrimp", kind: "protein" },
      extended: false,
    });
  });
  it("does NOT extend for a known canonical tag", () => {
    expect(assignTag("curry")?.extended).toBe(false);
  });
  it("mints a new tag (extended:true) only when nothing fits", () => {
    const a = assignTag("quinoa", "dish");
    expect(a).toEqual({ tag: { value: "quinoa", kind: "dish" }, extended: true });
  });
  it("defaults a newly minted tag kind to dish", () => {
    expect(assignTag("focaccia-thing")?.tag.kind).toBe("dish");
  });
  it("returns null for empty input", () => {
    expect(assignTag("   ")).toBeNull();
  });
});

describe("assignTags — list assignment", () => {
  it("maps a mixed list, extending only the unknown", () => {
    const out = assignTags(["spaghetti", "chicken", "quinoa"]);
    expect(out).toEqual([
      { tag: { value: "pasta", kind: "dish" }, extended: false },
      { tag: { value: "chicken", kind: "protein" }, extended: false },
      { tag: { value: "quinoa", kind: "dish" }, extended: true },
    ]);
  });
  it("de-duplicates by resolved value (synonyms collapse)", () => {
    const out = assignTags(["prawns", "shrimp"]);
    expect(out).toHaveLength(1);
    expect(out[0].tag.value).toBe("shrimp");
  });
});

describe("isControlledTag", () => {
  it("is true for canonical tags and known synonyms", () => {
    expect(isControlledTag("beef")).toBe(true);
    expect(isControlledTag("prawns")).toBe(true);
  });
  it("is false for unknowns", () => {
    expect(isControlledTag("quinoa")).toBe(false);
  });
});
