import { openai } from "@ai-sdk/openai";

/**
 * Single source of truth for which model the agent uses.
 *
 * We call the OpenAI API directly (provider reads OPENAI_API_KEY from env).
 * Swapping the model is a one-string change to CHAT_MODEL_ID. Swapping the
 * provider (e.g. to Claude) means importing @ai-sdk/anthropic and changing the
 * one `chatModel` line below.
 */
export const CHAT_MODEL_ID = "gpt-5.5";
export const chatModel = openai(CHAT_MODEL_ID);

/** Embedding model for technique/recipe vector search (used in a later chunk). */
export const EMBEDDING_MODEL_ID = "text-embedding-3-small";
export const embeddingModel = openai.textEmbeddingModel(EMBEDDING_MODEL_ID);

/**
 * Image model for recipe cover photos (used in a later chunk).
 * Seedream was Gateway-only; on the direct OpenAI path this is gpt-image-1.
 * Revisit when the image-generation chunk lands.
 */
export const IMAGE_MODEL_ID = "gpt-image-1";
