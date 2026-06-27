import { describe, it, expect } from "vitest";
import {
  associate,
  cosineSimilarity,
  matchRecipesForTechnique,
  matchTechniquesForRecipe,
  sharedTags,
  type EmbeddingResolver,
  type Taggable,
} from "./association-engine";

/**
 * Fixtures. Embeddings are tiny 3-dim stubs injected via a resolver so the
 * whole test is deterministic. Directions of the vectors encode "meaning":
 * the shrimp-brine technique points along the shrimp/seafood axis.
 */
const VECTORS: Record<string, number[]> = {
  // technique
  "tech-brine": [1, 0, 0], // "seafood brining"
  // recipes
  "rec-shrimp-scampi": [0.95, 0.05, 0], // very close to brine axis
  "rec-fish-tacos": [0.8, 0.2, 0], // close-ish
  "rec-beef-stew": [0, 1, 0], // orthogonal, different domain
  "rec-no-embedding": undefined as unknown as number[],
};

const resolver: EmbeddingResolver = (id) => VECTORS[id];

const tech: Taggable = { id: "tech-brine", tags: ["shrimp", "fish"] };

const recipes: Taggable[] = [
  { id: "rec-shrimp-scampi", tags: ["shrimp", "pasta"] },
  { id: "rec-fish-tacos", tags: ["fish", "taco"] },
  { id: "rec-beef-stew", tags: ["beef", "stew"] }, // no tag overlap with tech
  { id: "rec-no-embedding", tags: ["shrimp"] }, // tag overlap but no vector
];

describe("cosineSimilarity", () => {
  it("is 1 for identical direction", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 9);
  });
  it("is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 9);
  });
  it("clamps negatives to 0", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBe(0);
  });
  it("returns 0 for missing or mismatched vectors", () => {
    expect(cosineSimilarity(undefined, [1, 2])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe("sharedTags", () => {
  it("returns the controlled-tag overlap", () => {
    expect(
      sharedTags({ id: "a", tags: ["shrimp", "fish"] }, { id: "b", tags: ["fish"] }),
    ).toEqual(["fish"]);
  });
  it("is empty when nothing overlaps", () => {
    expect(
      sharedTags({ id: "a", tags: ["beef"] }, { id: "b", tags: ["fish"] }),
    ).toEqual([]);
  });
});

describe("associate — tag filter excludes clearly-inapplicable items", () => {
  it("drops candidates with no shared tag (beef stew gone)", () => {
    const out = associate(tech, recipes, resolver);
    const ids = out.map((m) => m.item.id);
    expect(ids).not.toContain("rec-beef-stew");
  });
  it("keeps a tag-overlapping candidate even with no embedding (score 0)", () => {
    const out = associate(tech, recipes, resolver);
    const noEmb = out.find((m) => m.item.id === "rec-no-embedding");
    expect(noEmb).toBeDefined();
    expect(noEmb?.score).toBe(0);
  });
  it("can require no tag overlap when disabled", () => {
    const out = associate(tech, recipes, resolver, {
      requireTagOverlap: false,
    });
    expect(out.map((m) => m.item.id)).toContain("rec-beef-stew");
  });
});

describe("associate — vector similarity ranks sensibly", () => {
  it("ranks the closest recipe first", () => {
    const out = associate(tech, recipes, resolver);
    expect(out[0].item.id).toBe("rec-shrimp-scampi");
    expect(out[1].item.id).toBe("rec-fish-tacos");
  });
  it("scores decrease with vector distance", () => {
    const out = associate(tech, recipes, resolver);
    const scampi = out.find((m) => m.item.id === "rec-shrimp-scampi")!;
    const tacos = out.find((m) => m.item.id === "rec-fish-tacos")!;
    expect(scampi.score).toBeGreaterThan(tacos.score);
  });
  it("reports shared tags for explainability", () => {
    const out = associate(tech, recipes, resolver);
    const scampi = out.find((m) => m.item.id === "rec-shrimp-scampi")!;
    expect(scampi.sharedTags).toEqual(["shrimp"]);
  });
});

describe("associate — minScore and limit", () => {
  it("drops matches below minScore", () => {
    const out = associate(tech, recipes, resolver, { minScore: 0.5 });
    const ids = out.map((m) => m.item.id);
    expect(ids).toContain("rec-shrimp-scampi");
    expect(ids).toContain("rec-fish-tacos");
    expect(ids).not.toContain("rec-no-embedding"); // score 0
  });
  it("caps results to limit", () => {
    const out = associate(tech, recipes, resolver, { limit: 1 });
    expect(out).toHaveLength(1);
    expect(out[0].item.id).toBe("rec-shrimp-scampi");
  });
  it("never matches an item against itself", () => {
    const out = associate(tech, [tech, ...recipes], resolver);
    expect(out.map((m) => m.item.id)).not.toContain("tech-brine");
  });
});

describe("bidirectional — both wrappers agree on a symmetric match", () => {
  it("technique->recipes finds the shrimp recipe", () => {
    const out = matchRecipesForTechnique(tech, recipes, resolver, {
      minScore: 0.5,
    });
    expect(out.map((m) => m.item.id)).toContain("rec-shrimp-scampi");
  });
  it("recipe->techniques finds the brine technique (reverse direction)", () => {
    const recipe: Taggable = { id: "rec-shrimp-scampi", tags: ["shrimp", "pasta"] };
    const techniques: Taggable[] = [
      tech,
      { id: "tech-sear", tags: ["beef"] }, // no overlap, excluded
    ];
    const out = matchTechniquesForRecipe(recipe, techniques, resolver, {
      minScore: 0.5,
    });
    expect(out.map((m) => m.item.id)).toEqual(["tech-brine"]);
  });
});
