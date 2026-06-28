/**
 * Re-runnable library seed. Reads the URL list from recipe_list.md and ingests
 * each source through the real backend pipeline (ingestRecipe), reusing ONE
 * ConvexHttpClient. Runs on a residential IP so the free local YouTube
 * transcript path works.
 *
 * Failure isolation: one bad URL (no transcript, unavailable, no recipe found)
 * is logged and skipped — it never aborts the run. Cover images are awaited so
 * the committed library has covers before we report.
 *
 * Usage:  node --env-file=.env.local --import tsx scripts/seed.ts
 *         (pass --clear to wipe the library first via admin.clearAll)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { ingestRecipe } from "../src/lib/ingest-recipe";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadUrls(listFile: string): string[] {
  const raw = readFileSync(join(ROOT, listFile), "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http"));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not set");
  const convex = new ConvexHttpClient(url);

  if (process.argv.includes("--clear")) {
    console.log("Clearing existing library (admin.clearAll)…");
    const cleared = await convex.mutation(api.admin.clearAll, {});
    console.log("Cleared:", cleared);
  }

  // List file: --list=<file> (or first non-flag arg), default recipe_list.md.
  const listArg = process.argv.find((a) => a.startsWith("--list="));
  const positional = process.argv
    .slice(2)
    .find((a) => !a.startsWith("--"));
  const listFile = listArg ? listArg.split("=")[1] : positional ?? "recipe_list.md";

  let urls = loadUrls(listFile);
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  if (limitArg) urls = urls.slice(0, Number(limitArg.split("=")[1]));
  console.log(`Seeding ${urls.length} sources from ${listFile} into ${url}\n`);

  // Capture which rows exist BEFORE this run so we can report only the new ones.
  const before = await convex.query(api.recipes.listRecipes, {});
  const beforeIds = new Set(before.map((r) => r._id));

  const ok: { url: string; titles: string[] }[] = [];
  const failed: { url: string; reason: string }[] = [];
  let totalRecipes = 0;

  for (const [i, src] of urls.entries()) {
    const tag = `[${i + 1}/${urls.length}] ${src}`;
    try {
      const result = await ingestRecipe(src, undefined, { convex });
      if (result.saved.length === 0) {
        failed.push({ url: src, reason: "no recipe found in source" });
        console.log(`${tag}\n  ✗ no recipe found`);
        continue;
      }
      const titles = result.saved.map((s) => s.recipe.title);
      totalRecipes += titles.length;
      console.log(`${tag}\n  ✓ ${titles.length} recipe(s): ${titles.join(" | ")}`);
      console.log(`  …waiting for cover image(s)`);
      await result.imagesSettled;
      console.log(`  ✓ images settled`);
      ok.push({ url: src, titles });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failed.push({ url: src, reason });
      console.log(`${tag}\n  ✗ FAILED: ${reason}`);
    }
  }

  console.log("\n========== SEED SUMMARY ==========");
  console.log(`Sources OK: ${ok.length}/${urls.length}`);
  console.log(`Total recipes saved: ${totalRecipes}`);
  if (failed.length) {
    console.log(`\nFailures (${failed.length}):`);
    for (const f of failed) console.log(`  - ${f.url}\n      ${f.reason}`);
  }

  // Final library composition straight from the seeded deployment.
  const all = await convex.query(api.recipes.listRecipes, {});
  const byCategory: Record<string, number> = {};
  let missingEmbedding = 0;
  let missingImage = 0;
  for (const r of all) {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
    if (!r.embedding || r.embedding.length !== 1536) missingEmbedding++;
    if (!r.imageUrl) missingImage++;
  }

  console.log("\n========== LIBRARY COMPOSITION ==========");
  console.log(`Total recipes in library: ${all.length}`);
  console.log("By category:", byCategory);
  console.log(`SIDE recipes: ${byCategory["side"] ?? 0}`);
  console.log(`Missing 1536 embedding: ${missingEmbedding}`);
  console.log(`Missing cover image: ${missingImage}`);
  console.log("\nTitles:");
  for (const r of all) {
    console.log(`  - [${r.category}] ${r.title}${r.imageUrl ? "" : "  (NO IMAGE)"}`);
  }

  // New rows from THIS run only (additive runs care about what they added).
  const newRows = all.filter((r) => !beforeIds.has(r._id));
  console.log("\n========== NEW THIS RUN ==========");
  console.log(`New recipes added: ${newRows.length}`);
  let newMissingEmb = 0;
  let newMissingImg = 0;
  for (const r of newRows) {
    const embOk = r.embedding && r.embedding.length === 1536;
    if (!embOk) newMissingEmb++;
    if (!r.imageUrl) newMissingImg++;
    console.log(
      `  - [${r.category}] ${r.title}  (emb ${embOk ? "1536" : "MISSING"}, ${r.imageUrl ? "img" : "NO IMAGE"})`,
    );
  }
  console.log(`New rows missing 1536 embedding: ${newMissingEmb}`);
  console.log(`New rows missing cover image: ${newMissingImg}`);
}

main().catch((e) => {
  console.error("Seed run crashed:", e);
  process.exit(1);
});
