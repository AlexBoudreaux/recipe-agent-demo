/**
 * Recipe cover-photo generation (LLM image model), fully decoupled from saving.
 *
 * Contract that the rest of the pipeline relies on: this NEVER throws upward and
 * NEVER blocks a save. A slow or failed image just logs and returns false. The
 * recipe row is already persisted; the image patches in async when (if) it
 * lands. PRD user stories 13 + 14.
 *
 * Flow: generateImage (gpt-image-1 via the OpenAI provider) -> Convex
 * generateUploadUrl -> POST the bytes -> setRecipeImage(recipeId, storageId).
 */
import { generateImage } from "ai";
import { openai } from "@ai-sdk/openai";
import type { ConvexHttpClient } from "convex/browser";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { IMAGE_MODEL_ID } from "./model";

/** Build the cover-photo prompt from the recipe's own words. */
function imagePrompt(input: { title: string; summary: string }): string {
  return [
    `A photorealistic, appetizing overhead food-magazine cover photo of "${input.title}".`,
    input.summary,
    `Natural light, shallow depth of field, styled on a clean surface, no text, no hands, no utensils in frame.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface GenerateRecipeImageDeps {
  convex: ConvexHttpClient;
  /** Override for tests; defaults to global fetch (used to POST bytes). */
  fetchImpl?: typeof fetch;
}

/**
 * Generate a cover image for a saved recipe and attach it. Returns true on
 * success, false on ANY failure (image model down, upload failed, etc.). Always
 * resolves — callers can fire-and-forget without a try/catch.
 */
export async function generateAndAttachRecipeImage(
  recipeId: Id<"recipes">,
  recipe: { title: string; summary: string },
  deps: GenerateRecipeImageDeps,
): Promise<boolean> {
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const { image } = await generateImage({
      model: openai.image(IMAGE_MODEL_ID),
      prompt: imagePrompt(recipe),
      size: "1024x1024",
    });

    // 1) short-lived signed upload URL from Convex
    const uploadUrl = await deps.convex.mutation(api.images.generateUploadUrl, {});

    // 2) POST the raw bytes; Convex returns { storageId }
    const res = await doFetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": image.mediaType || "image/png" },
      body: image.uint8Array as unknown as BodyInit,
    });
    if (!res.ok) {
      throw new Error(`storage upload returned HTTP ${res.status}`);
    }
    const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };

    // 3) attach to the recipe
    await deps.convex.mutation(api.recipes.setRecipeImage, { recipeId, storageId });
    return true;
  } catch (err) {
    // Swallow by design: image generation must never break ingestion.
    console.error(
      `[recipe-image] cover generation failed for "${recipe.title}" (${recipeId}); leaving image unset:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
