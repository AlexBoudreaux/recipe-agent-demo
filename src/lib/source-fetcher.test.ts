/**
 * SourceFetcher tests. These exercise the parts that do NOT need the network:
 * URL classification, video-id extraction, env-based provider selection, the
 * Supadata request/response mapping (via an injected fetch), and the typed
 * error cases. The live blog/transcript fetches are verified by running the
 * module (it is I/O-bound), not here.
 */
import { describe, it, expect } from "vitest";
import {
  classifySource,
  extractYoutubeId,
  selectTranscriptProvider,
  createSupadataProvider,
  fetchSource,
  SourceFetchError,
  type TranscriptProvider,
} from "./source-fetcher";

describe("classifySource", () => {
  it("detects youtube hosts", () => {
    for (const u of [
      "https://www.youtube.com/watch?v=2gmM2icOH9E",
      "https://youtu.be/2gmM2icOH9E",
      "https://m.youtube.com/watch?v=2gmM2icOH9E",
      "https://music.youtube.com/watch?v=2gmM2icOH9E",
      "https://www.youtube.com/shorts/2gmM2icOH9E",
    ]) {
      expect(classifySource(u)).toBe("youtube");
    }
  });

  it("treats everything else as a blog", () => {
    expect(classifySource("https://www.budgetbytes.com/cacio-e-pepe/")).toBe(
      "blog",
    );
  });

  it("throws INVALID_URL on garbage", () => {
    expect(() => classifySource("not a url")).toThrowError(SourceFetchError);
    try {
      classifySource("not a url");
    } catch (e) {
      expect((e as SourceFetchError).code).toBe("INVALID_URL");
    }
  });
});

describe("extractYoutubeId", () => {
  it("pulls the id from every common form", () => {
    expect(extractYoutubeId("https://youtu.be/2gmM2icOH9E")).toBe(
      "2gmM2icOH9E",
    );
    expect(
      extractYoutubeId("https://www.youtube.com/watch?v=2gmM2icOH9E&t=10s"),
    ).toBe("2gmM2icOH9E");
    expect(
      extractYoutubeId("https://www.youtube.com/shorts/2gmM2icOH9E"),
    ).toBe("2gmM2icOH9E");
    expect(extractYoutubeId("https://www.youtube.com/embed/2gmM2icOH9E")).toBe(
      "2gmM2icOH9E",
    );
  });

  it("returns null for channel/playlist-only links", () => {
    expect(extractYoutubeId("https://www.youtube.com/@seriouseats")).toBeNull();
    expect(extractYoutubeId("not a url")).toBeNull();
  });
});

describe("selectTranscriptProvider", () => {
  it("honors explicit TRANSCRIPT_PROVIDER", () => {
    expect(selectTranscriptProvider({ TRANSCRIPT_PROVIDER: "local" }).name).toBe(
      "local",
    );
    expect(
      selectTranscriptProvider({
        TRANSCRIPT_PROVIDER: "supadata",
        SUPADATA_API_KEY: "k",
      }).name,
    ).toBe("supadata");
  });

  it("defaults to supadata on Vercel, local elsewhere", () => {
    expect(
      selectTranscriptProvider({ VERCEL: "1", SUPADATA_API_KEY: "k" }).name,
    ).toBe("supadata");
    expect(selectTranscriptProvider({}).name).toBe("local");
  });
});

describe("createSupadataProvider (injected fetch)", () => {
  const okResponse = (body: unknown, status = 200) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as Response;

  it("builds the GET /youtube/transcript request with text=true + x-api-key", async () => {
    let seenUrl = "";
    let seenKey = "";
    const provider = createSupadataProvider({
      apiKey: "secret",
      fetchImpl: (async (url: string, init?: RequestInit) => {
        seenUrl = url;
        seenKey = (init?.headers as Record<string, string>)["x-api-key"];
        return okResponse({ lang: "en", content: "clean transcript text" });
      }) as unknown as typeof fetch,
    });
    const out = await provider.fetch({
      url: "https://www.youtube.com/watch?v=abc",
      videoId: "abc",
    });
    expect(seenUrl).toContain("/youtube/transcript");
    expect(seenUrl).toContain("text=true");
    expect(seenUrl).toContain("www.youtube.com");
    expect(seenKey).toBe("secret");
    expect(out.text).toBe("clean transcript text");
  });

  it("maps a 404 to NO_TRANSCRIPT", async () => {
    const provider = createSupadataProvider({
      apiKey: "secret",
      fetchImpl: (async () =>
        okResponse({ error: "transcript not found" }, 404)) as unknown as typeof fetch,
    });
    await expect(
      provider.fetch({ url: "https://youtu.be/x", videoId: "x" }),
    ).rejects.toMatchObject({ code: "NO_TRANSCRIPT" });
  });

  it("maps an empty body to NO_TRANSCRIPT", async () => {
    const provider = createSupadataProvider({
      apiKey: "secret",
      fetchImpl: (async () =>
        okResponse({ lang: "en", content: "" })) as unknown as typeof fetch,
    });
    await expect(
      provider.fetch({ url: "https://youtu.be/x", videoId: "x" }),
    ).rejects.toMatchObject({ code: "NO_TRANSCRIPT" });
  });

  it("errors clearly when the api key is missing", async () => {
    const provider = createSupadataProvider({ apiKey: undefined });
    await expect(
      provider.fetch({ url: "https://youtu.be/x", videoId: "x" }),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});

describe("fetchSource with an injected provider (no network)", () => {
  const fakeProvider: TranscriptProvider = {
    name: "local",
    async fetch({ url }) {
      return { text: "fake transcript", title: "Fake Video", url } as never;
    },
  };

  it("routes youtube urls to the provider and shapes the result", async () => {
    const out = await fetchSource("https://youtu.be/2gmM2icOH9E", {
      transcriptProvider: fakeProvider,
    });
    expect(out).toEqual({
      sourceType: "youtube",
      text: "fake transcript",
      title: "Fake Video",
      url: "https://youtu.be/2gmM2icOH9E",
    });
  });

  it("rejects youtube links with no video id", async () => {
    await expect(
      fetchSource("https://www.youtube.com/@channel", {
        transcriptProvider: fakeProvider,
      }),
    ).rejects.toMatchObject({ code: "INVALID_URL" });
  });
});
