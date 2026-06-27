/**
 * Single source of truth for which model the agent uses.
 *
 * Every model call in the app routes through the Vercel AI Gateway. The AI SDK
 * resolves a bare string model id (e.g. "openai/gpt-5.5") through the gateway
 * automatically when AI_GATEWAY_API_KEY is set, so swapping providers is a
 * one-string change here with no other code touched.
 *
 * Swap to Claude by setting CHAT_MODEL_ID to "anthropic/claude-opus-4.8".
 */
export const CHAT_MODEL_ID = "openai/gpt-5.5";

/** Embedding model for technique/recipe vector search (used in a later chunk). */
export const EMBEDDING_MODEL_ID = "openai/text-embedding-3-small";

/** Image model for recipe cover photos (used in a later chunk). */
export const IMAGE_MODEL_ID = "bytedance/seedream-4.5";
