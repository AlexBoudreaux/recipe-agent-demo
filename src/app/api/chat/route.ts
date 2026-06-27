import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { chatModel } from "@/lib/model";

// Allow streaming responses up to 30s on the edge of Vercel's hobby limit.
export const maxDuration = 30;

const SYSTEM_PROMPT = [
  "You are Recipe Agent, a cooking assistant that helps a single chef capture",
  "recipes and techniques from messy sources, build a library that compounds,",
  "and plan meals while keeping the human in control.",
  "For now this is a skeleton: just answer conversationally and briefly.",
  "The real ingest, search, and planning tools arrive in later chunks.",
].join(" ");

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Calls the OpenAI API directly (OPENAI_API_KEY). Model is centralized in
  // @/lib/model so the model/provider is a one-line swap.
  const result = streamText({
    model: chatModel,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
