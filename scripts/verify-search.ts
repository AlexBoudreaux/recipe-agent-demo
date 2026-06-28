import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

async function main() {
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const queries: Array<{ queryText: string; tags?: string[]; category?: any }> = [
    { queryText: "shrimp" },
    { queryText: "shrimp", tags: ["shrimp"] },
    { queryText: "something spicy and quick" },
    { queryText: "crispy potatoes for a side", category: "side" },
    { queryText: "rich beefy steak dinner" },
  ];
  for (const q of queries) {
    const res = await convex.action(api.search.searchRecipes, {
      queryText: q.queryText,
      ...(q.tags ? { tags: q.tags } : {}),
      ...(q.category ? { category: q.category } : {}),
      limit: 6,
    });
    console.log(`\n=== query "${q.queryText}"${q.tags ? ` tags=${q.tags}` : ""}${q.category ? ` cat=${q.category}` : ""} ===`);
    for (const r of res) {
      console.log(
        `  ${r.score.toFixed(3)} (mean ${r.meaningScore.toFixed(3)})  [${r.category}] ${r.title}  tags=${r.tags.join(",")}${r.sharedTags.length ? ` shared=${r.sharedTags.join(",")}` : ""}`,
      );
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
