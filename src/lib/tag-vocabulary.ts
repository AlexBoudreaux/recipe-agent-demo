/**
 * TagVocabulary — the controlled tag set (proteins, dish types) and the
 * controlled category set, plus the rules for assigning a raw input to the
 * vocabulary. Pure: no LLM, no I/O.
 *
 * Core rule from the PRD: map an input to an EXISTING controlled tag whenever
 * one fits (via canonicalization + synonyms); only mint a NEW tag when nothing
 * existing fits. This keeps search and association reliable instead of letting
 * a hundred near-duplicate tags accrete.
 */
import type { Category, Tag, TagKind } from "./types";

/** The six controlled recipe categories, exactly per the PRD. */
export const CATEGORIES: readonly Category[] = [
  "main",
  "side",
  "dessert",
  "beverage",
  "appetizer",
  "sauce",
] as const;

/** Canonical protein tags. */
export const PROTEIN_TAGS: readonly string[] = [
  "chicken",
  "beef",
  "pork",
  "lamb",
  "fish",
  "shrimp",
  "shellfish",
  "tofu",
  "egg",
  "bean",
  "turkey",
] as const;

/** Canonical dish-type tags. */
export const DISH_TAGS: readonly string[] = [
  "pasta",
  "soup",
  "salad",
  "stew",
  "stir-fry",
  "curry",
  "sandwich",
  "taco",
  "pizza",
  "rice",
  "noodle",
  "bread",
  "cake",
  "roast",
  "grill",
] as const;

/**
 * Synonym table mapping common input variants to a canonical tag. Keys are
 * normalized (lowercase, singular-ish) inputs; values are the canonical tag.
 * The canonical tags themselves are added automatically below, so only true
 * aliases need to live here.
 */
const RAW_SYNONYMS: Record<string, string> = {
  // proteins
  chickens: "chicken",
  poultry: "chicken",
  hen: "chicken",
  steak: "beef",
  "ground beef": "beef",
  bacon: "pork",
  ham: "pork",
  prawn: "shrimp",
  prawns: "shrimp",
  salmon: "fish",
  tuna: "fish",
  cod: "fish",
  crab: "shellfish",
  lobster: "shellfish",
  mussel: "shellfish",
  clam: "shellfish",
  eggs: "egg",
  beans: "bean",
  chickpea: "bean",
  lentil: "bean",
  // dish types
  spaghetti: "pasta",
  noodles: "noodle",
  ramen: "noodle",
  sandwiches: "sandwich",
  burger: "sandwich",
  tacos: "taco",
  stirfry: "stir-fry",
  "stir fry": "stir-fry",
  soups: "soup",
  salads: "salad",
  loaf: "bread",
  cakes: "cake",
};

/** Build the canonical lookup: every canonical tag maps to itself + synonyms. */
function buildSynonymMap(): Map<string, Tag> {
  const map = new Map<string, Tag>();
  for (const value of PROTEIN_TAGS) {
    map.set(value, { value, kind: "protein" });
  }
  for (const value of DISH_TAGS) {
    map.set(value, { value, kind: "dish" });
  }
  for (const [alias, canonical] of Object.entries(RAW_SYNONYMS)) {
    const tag = map.get(canonical);
    if (tag) map.set(normalizeInput(alias), { ...tag });
  }
  return map;
}

/** Normalize an input token: lowercase, trim, collapse whitespace. */
export function normalizeInput(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

const SYNONYM_MAP = buildSynonymMap();

/** True if the string is one of the six controlled categories. */
export function isCategory(input: string): input is Category {
  return (CATEGORIES as readonly string[]).includes(normalizeInput(input));
}

/**
 * Coerce an input to a controlled category, defaulting to "main" when it does
 * not match. Categories are a closed set (never extended), unlike tags.
 */
export function toCategory(input: string): Category {
  const n = normalizeInput(input);
  return isCategory(n) ? (n as Category) : "main";
}

/**
 * Resolve a single raw input to an EXISTING controlled tag, or null if nothing
 * in the vocabulary fits. Tries exact canonical match, then synonyms, then a
 * conservative singular/plural fold.
 */
export function resolveTag(input: string): Tag | null {
  const n = normalizeInput(input);
  if (!n) return null;
  const direct = SYNONYM_MAP.get(n);
  if (direct) return { ...direct };
  // Conservative plural fold: "tacos" -> "taco" if the singular is known.
  if (n.endsWith("s")) {
    const singular = SYNONYM_MAP.get(n.slice(0, -1));
    if (singular) return { ...singular };
  }
  return null;
}

/** Result of assigning a raw input: a controlled tag and whether it is new. */
export interface TagAssignment {
  tag: Tag;
  /** True when no existing controlled tag fit, so this is a freshly minted one. */
  extended: boolean;
}

/**
 * Assign a raw input to a tag. If an existing controlled tag fits, return it
 * with `extended: false`. Only when nothing fits do we MINT a new tag (the
 * extension path), defaulting its kind to "dish" unless a kind is supplied.
 */
export function assignTag(input: string, kind: TagKind = "dish"): TagAssignment | null {
  const n = normalizeInput(input);
  if (!n) return null;
  const existing = resolveTag(n);
  if (existing) return { tag: existing, extended: false };
  return { tag: { value: n, kind }, extended: true };
}

/**
 * Assign a list of raw inputs to controlled tags, de-duplicated by value.
 * Convenience over assignTag for the extractor's typical "here are candidate
 * tags from the LLM" case.
 */
export function assignTags(inputs: string[], kind: TagKind = "dish"): TagAssignment[] {
  const seen = new Set<string>();
  const out: TagAssignment[] = [];
  for (const raw of inputs) {
    const a = assignTag(raw, kind);
    if (!a) continue;
    if (seen.has(a.tag.value)) continue;
    seen.add(a.tag.value);
    out.push(a);
  }
  return out;
}

/** True if a value already exists in the controlled vocabulary. */
export function isControlledTag(value: string): boolean {
  return SYNONYM_MAP.has(normalizeInput(value));
}
