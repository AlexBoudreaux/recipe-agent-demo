/**
 * SourceFetcher — turns a source URL into clean plain text ready for LLM
 * extraction. It is a plain server-side TS module (no Next/Convex imports) so
 * it is importable from BOTH the local Node seeding script (chunk 6) AND the
 * server-side agent backend (chunk 5).
 *
 * Two source types:
 *  - "blog": fetch the HTML and run a readability pass (@mozilla/readability +
 *    jsdom) to strip nav/ads/boilerplate and return the main article text.
 *  - "youtube": fetch the video transcript through an ENV-CONDITIONAL provider.
 *
 * The env split is the critical design point. The empirical finding (see PRD
 * "Further Notes") is that free YouTube-transcript scrapers work from a
 * residential IP but are IP-blocked from Vercel's datacenter
 * ("Sign in to confirm you're not a bot" / LOGIN_REQUIRED). So:
 *  - LOCAL (seeding on a residential IP): youtube-transcript-plus (free scrape).
 *  - LIVE (Vercel datacenter IP): the Supadata managed API.
 * Selection is controlled by TRANSCRIPT_PROVIDER (local|supadata), defaulting to
 * "supadata" when process.env.VERCEL is set and "local" otherwise. The provider
 * is injectable so the YouTube path is testable without the network.
 *
 * Failures are thrown as typed errors (never empty strings) so the agent in
 * chunk 5 can surface them conversationally (bad link, no transcript, etc.).
 */
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import {
  fetchTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptVideoUnavailableError,
  YoutubeTranscriptInvalidVideoIdError,
} from "youtube-transcript-plus";

/** Which kind of source a URL points at. Mirrors the Recipe.sourceType field. */
export type SourceType = "blog" | "youtube";

/** The clean, extraction-ready result every fetch resolves to. */
export interface FetchedSource {
  sourceType: SourceType;
  /** Clean plain text: readable article body, or full transcript. Never empty. */
  text: string;
  /** Page/video title when the source exposes one. */
  title?: string;
  /** The original URL, echoed back for provenance (stored as Recipe.sourceUrl). */
  url: string;
}

// ---------------------------------------------------------------------------
// Typed errors. One class per PRD failure case so the agent can branch on the
// `code` and explain it conversationally instead of leaking a stack trace.
// ---------------------------------------------------------------------------

export type SourceFetchErrorCode =
  /** URL is malformed or not http(s). */
  | "INVALID_URL"
  /** The page/endpoint could not be reached or returned a non-2xx status. */
  | "UNREACHABLE"
  /** Blog HTML had no extractable article body. */
  | "NO_CONTENT"
  /** YouTube video exists but has no captions/transcript available. */
  | "NO_TRANSCRIPT"
  /** The video itself is private/removed/unavailable. */
  | "VIDEO_UNAVAILABLE"
  /** The transcript provider failed for some other reason (rate limit, 5xx). */
  | "PROVIDER_ERROR";

/** Single typed error type for every SourceFetcher failure. */
export class SourceFetchError extends Error {
  readonly code: SourceFetchErrorCode;
  readonly url: string;
  constructor(
    code: SourceFetchErrorCode,
    message: string,
    url: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "SourceFetchError";
    this.code = code;
    this.url = url;
  }
}

// ---------------------------------------------------------------------------
// URL classification
// ---------------------------------------------------------------------------

/**
 * Decide whether a URL is a YouTube video or a generic blog. Recognizes the
 * common YouTube hosts (youtube.com/watch, youtu.be/<id>, /shorts/, /embed/,
 * and the m./music. subdomains). Everything else is treated as a blog.
 */
export function classifySource(url: string): SourceType {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    throw new SourceFetchError("INVALID_URL", `Not a valid URL: ${url}`, url);
  }
  const isYoutube =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtu.be";
  return isYoutube ? "youtube" : "blog";
}

/**
 * Pull the 11-char video id out of any common YouTube URL form. Returns null
 * when no id is present (e.g. a channel or playlist-only link).
 */
export function extractYoutubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  // youtu.be/<id>
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return isValidId(id) ? id : null;
  }
  // youtube.com/watch?v=<id>
  const v = u.searchParams.get("v");
  if (v && isValidId(v)) return v;
  // youtube.com/shorts/<id>, /embed/<id>, /v/<id>, /live/<id>
  const m = u.pathname.match(/\/(?:shorts|embed|v|live)\/([^/?#]+)/);
  if (m && isValidId(m[1])) return m[1];
  return null;
}

function isValidId(id: string | undefined): id is string {
  return !!id && /^[\w-]{11}$/.test(id);
}

// ---------------------------------------------------------------------------
// Transcript provider abstraction (injectable for tests + the env split)
// ---------------------------------------------------------------------------

/** A normalized transcript a provider returns. */
export interface ProviderTranscript {
  text: string;
  /** Some providers (Supadata metadata, etc.) cannot supply a title; optional. */
  title?: string;
}

/**
 * Pulls a transcript for a YouTube video. Implementations may scrape directly
 * (local) or call a managed API (Supadata). Inject a fake in tests to exercise
 * the YouTube path without the network.
 *
 * Contract: throw SourceFetchError on failure; never return empty text.
 */
export interface TranscriptProvider {
  readonly name: "local" | "supadata";
  fetch(input: { url: string; videoId: string }): Promise<ProviderTranscript>;
}

/**
 * LOCAL provider: youtube-transcript-plus direct scrape. Works from a
 * residential IP (seeding), blocked from Vercel. Maps the library's typed
 * errors onto our SourceFetchError codes.
 */
export const localTranscriptProvider: TranscriptProvider = {
  name: "local",
  async fetch({ url, videoId }) {
    try {
      const result = await fetchTranscript(videoId, { videoDetails: true });
      const segments = Array.isArray(result) ? result : result.segments;
      const title = Array.isArray(result)
        ? undefined
        : result.videoDetails?.title;
      const text = joinSegments(segments.map((s) => s.text));
      if (!text) {
        throw new SourceFetchError(
          "NO_TRANSCRIPT",
          "This video has no readable transcript.",
          url,
        );
      }
      return { text, title };
    } catch (err) {
      if (err instanceof SourceFetchError) throw err;
      if (
        err instanceof YoutubeTranscriptDisabledError ||
        err instanceof YoutubeTranscriptNotAvailableError
      ) {
        throw new SourceFetchError(
          "NO_TRANSCRIPT",
          "This video has no captions/transcript available.",
          url,
          { cause: err },
        );
      }
      if (err instanceof YoutubeTranscriptVideoUnavailableError) {
        throw new SourceFetchError(
          "VIDEO_UNAVAILABLE",
          "This video is private, removed, or otherwise unavailable.",
          url,
          { cause: err },
        );
      }
      if (err instanceof YoutubeTranscriptInvalidVideoIdError) {
        throw new SourceFetchError(
          "INVALID_URL",
          "That does not look like a valid YouTube video.",
          url,
          { cause: err },
        );
      }
      throw new SourceFetchError(
        "PROVIDER_ERROR",
        `Local transcript scrape failed: ${describe(err)}`,
        url,
        { cause: err },
      );
    }
  },
};

/** Shape of a Supadata `text=true` transcript response. */
interface SupadataTextResponse {
  lang?: string;
  availableLangs?: string[];
  content?: string;
  error?: string;
  message?: string;
}

/**
 * Build the SUPADATA provider. Calls GET /v1/youtube/transcript?url=...&text=true
 * with the x-api-key header (request shape verified against the live API on
 * 2026-06-27). Factory form so the api key + a custom fetch are injectable.
 */
export function createSupadataProvider(opts?: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}): TranscriptProvider {
  const apiKey = opts?.apiKey ?? process.env.SUPADATA_API_KEY;
  const doFetch = opts?.fetchImpl ?? fetch;
  const baseUrl = opts?.baseUrl ?? "https://api.supadata.ai/v1";
  return {
    name: "supadata",
    async fetch({ url }) {
      if (!apiKey) {
        throw new SourceFetchError(
          "PROVIDER_ERROR",
          "SUPADATA_API_KEY is not set; cannot fetch transcript via Supadata.",
          url,
        );
      }
      const endpoint = new URL(`${baseUrl}/youtube/transcript`);
      endpoint.searchParams.set("url", url);
      endpoint.searchParams.set("text", "true");
      let res: Response;
      try {
        res = await doFetch(endpoint.toString(), {
          headers: { "x-api-key": apiKey },
        });
      } catch (err) {
        throw new SourceFetchError(
          "UNREACHABLE",
          `Could not reach Supadata: ${describe(err)}`,
          url,
          { cause: err },
        );
      }
      const body = (await res.json().catch(() => ({}))) as SupadataTextResponse;
      if (!res.ok) {
        // Supadata returns 404/422-style codes when a video has no transcript.
        const detail = body.message ?? body.error ?? `HTTP ${res.status}`;
        if (
          res.status === 404 ||
          /transcript|caption|not.?found/i.test(detail)
        ) {
          throw new SourceFetchError(
            "NO_TRANSCRIPT",
            "This video has no captions/transcript available (Supadata).",
            url,
          );
        }
        throw new SourceFetchError(
          "PROVIDER_ERROR",
          `Supadata error: ${detail}`,
          url,
        );
      }
      const text = typeof body.content === "string" ? body.content.trim() : "";
      if (!text) {
        throw new SourceFetchError(
          "NO_TRANSCRIPT",
          "Supadata returned an empty transcript for this video.",
          url,
        );
      }
      return { text };
    },
  };
}

/**
 * Pick the provider from the environment. TRANSCRIPT_PROVIDER overrides
 * everything; otherwise default to "supadata" on Vercel and "local" elsewhere.
 */
export function selectTranscriptProvider(
  env: Record<string, string | undefined> = process.env,
): TranscriptProvider {
  const explicit = env.TRANSCRIPT_PROVIDER?.toLowerCase();
  const choice =
    explicit === "local" || explicit === "supadata"
      ? explicit
      : env.VERCEL
        ? "supadata"
        : "local";
  return choice === "supadata"
    ? createSupadataProvider({ apiKey: env.SUPADATA_API_KEY })
    : localTranscriptProvider;
}

// ---------------------------------------------------------------------------
// Blog path
// ---------------------------------------------------------------------------

/** Browser-like UA so blogs don't serve us a bot wall. */
const BLOG_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchBlog(
  url: string,
  doFetch: typeof fetch,
): Promise<FetchedSource> {
  let res: Response;
  try {
    res = await doFetch(url, {
      headers: { "user-agent": BLOG_UA, accept: "text/html,*/*" },
      redirect: "follow",
    });
  } catch (err) {
    throw new SourceFetchError(
      "UNREACHABLE",
      `Could not reach ${url}: ${describe(err)}`,
      url,
      { cause: err },
    );
  }
  if (!res.ok) {
    throw new SourceFetchError(
      "UNREACHABLE",
      `${url} returned HTTP ${res.status}.`,
      url,
    );
  }
  const html = await res.text();
  // jsdom needs the document URL to resolve relative links inside Readability.
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  const text = normalizeWhitespace(article?.textContent ?? "");
  if (!text) {
    throw new SourceFetchError(
      "NO_CONTENT",
      `Could not extract readable content from ${url}.`,
      url,
    );
  }
  return {
    sourceType: "blog",
    text,
    title: article?.title?.trim() || dom.window.document.title || undefined,
    url,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface FetchSourceOptions {
  /** Override the YouTube transcript provider (defaults to env selection). */
  transcriptProvider?: TranscriptProvider;
  /** Override fetch for the blog path (testing). */
  fetchImpl?: typeof fetch;
}

/**
 * Turn a source URL into clean, extraction-ready text. Detects blog vs YouTube
 * from the URL, runs the right path, and returns a FetchedSource with non-empty
 * text. Throws a typed SourceFetchError on any failure.
 */
export async function fetchSource(
  url: string,
  options: FetchSourceOptions = {},
): Promise<FetchedSource> {
  const trimmed = url.trim();
  const sourceType = classifySource(trimmed); // throws INVALID_URL on garbage

  if (sourceType === "blog") {
    return fetchBlog(trimmed, options.fetchImpl ?? fetch);
  }

  const videoId = extractYoutubeId(trimmed);
  if (!videoId) {
    throw new SourceFetchError(
      "INVALID_URL",
      "That YouTube link has no video id (channel/playlist links aren't supported).",
      trimmed,
    );
  }
  const provider = options.transcriptProvider ?? selectTranscriptProvider();
  const { text, title } = await provider.fetch({ url: trimmed, videoId });
  return { sourceType: "youtube", text, title, url: trimmed };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Join transcript segments into one space-separated, de-noised string. */
function joinSegments(parts: string[]): string {
  // Scrapers (youtube-transcript-plus) hand back raw caption markup with HTML
  // entities like &#39; and &amp;; decode them so the LLM sees clean prose.
  return normalizeWhitespace(decodeEntities(parts.join(" ")));
}

/** Common named entities seen in YouTube caption text. */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
  "#34": '"',
};

/** Decode HTML entities (named + numeric decimal/hex) into plain characters. */
function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Collapse runs of whitespace/newlines into single spaces/paragraph breaks. */
function normalizeWhitespace(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

/** Best-effort one-line description of an unknown thrown value. */
function describe(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
