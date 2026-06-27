/**
 * Embedding — turns a recipe's searchable text (title + summary + tags) into a
 * 1536-dim vector via text-embedding-3-small using the AI SDK `embed()`.
 *
 * The vector feeds Convex's recipes.by_embedding vector index (dims 1536) and
 * AssociationEngine's similarity ranking. Keep the "what text gets embedded"
 * rule in one place so ingest, seeding, and any re-embed agree exactly.
 */
import { embed } from "ai";
import { embeddingModel } from "./model";

/** Compose the canonical text that represents a recipe in vector space. */
export function recipeEmbeddingText(input: {
  title: string;
  summary: string;
  tags: string[];
}): string {
  const tags = input.tags.length ? `Tags: ${input.tags.join(", ")}` : "";
  return [input.title, input.summary, tags].filter(Boolean).join("\n").trim();
}

/** Embed arbitrary text. Returns a 1536-length number[]. */
export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({ model: embeddingModel, value: text });
  return embedding;
}

/** Embed a recipe (title + summary + tags) for storage/search. */
export async function embedRecipe(input: {
  title: string;
  summary: string;
  tags: string[];
}): Promise<number[]> {
  return embedText(recipeEmbeddingText(input));
}
