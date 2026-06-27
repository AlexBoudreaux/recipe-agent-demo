import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { CHAT_MODEL_ID } from "@/lib/model";

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

  // Bare string model id routes through the Vercel AI Gateway (AI_GATEWAY_API_KEY).
  // Centralized in @/lib/model so the provider is a one-string swap.
  const result = streamText({
    model: CHAT_MODEL_ID,
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
