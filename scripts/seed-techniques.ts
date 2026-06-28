/**
 * Seed techniques from technique_list.md through the real ingest pipeline, then
 * rebuild associations over the whole library and print proof.
 *
 * Re-runnable: skips a URL whose technique(s) already exist (matched by
 * sourceUrl). Cleanup: deletes the misfiled "Shrimp Brine" recipe (category
 * sauce) so the brine lives as a TECHNIQUE, not a duplicate sauce. Leaves
 * "Basic Shrimp Stock" alone.
 *
 * Usage: node --env-file=.env.local --import tsx scripts/seed-techniques.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { ingestTechnique } from "../src/lib/ingest-technique";
import { reassociateAll, ASSOCIATION_MIN_SCORE } from "../src/lib/associate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

/** One technique source: a URL plus an optional natural-language instruction. */
interface TechniqueSource {
  url: string;
  instruction?: string;
}

/**
 * Parse technique_list.md lines of the form `URL | instruction` (split on the
 * FIRST " | "). The instruction narrows extraction to the named technique(s);
 * a bare URL (no pipe) extracts the 1-2 most significant techniques.
 */
function loadSources(listFile: string): TechniqueSource[] {
  const raw = readFileSync(join(ROOT, listFile), "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("http"))
    .map((line) => {
      const sep = line.indexOf(" | ");
      if (sep === -1) return { url: line };
      const url = line.slice(0, sep).trim();
      const instruction = line.slice(sep + 3).trim();
      return { url, instruction: instruction || undefined };
    });
}

async function main() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL not set");
  const convex = new ConvexHttpClient(url);

  const sources = loadSources("technique_list.md");
  console.log(`Seeding ${sources.length} technique sources into ${url}\n`);

  // --- cleanup: delete the misfiled "Shrimp Brine" sauce (keep Basic Shrimp Stock) ---
  const recipes = await convex.query(api.recipes.listRecipes, {});
  const misfiled = recipes.filter(
    (r) => r.title.trim().toLowerCase() === "shrimp brine" && r.category === "sauce",
  );
  for (const r of misfiled) {
    await convex.mutation(api.admin.deleteRecipe, { recipeId: r._id });
    console.log(`Deleted misfiled sauce: "${r.title}" (${r._id})`);
  }
  if (misfiled.length === 0) console.log(`No misfiled "Shrimp Brine" sauce found (already removed).`);
  console.log("");

  // --- ingest techniques (skip association here; reassociateAll runs after) ---
  const existing = await convex.query(api.techniques.listTechniques, {});
  const existingUrls = new Set(existing.map((t) => t.sourceUrl));

  for (const [i, src] of sources.entries()) {
    const tag = `[${i + 1}/${sources.length}] ${src.url}${src.instruction ? `  ⟪${src.instruction}⟫` : ""}`;
    if (existingUrls.has(src.url)) {
      console.log(`${tag}\n  • skipped (already ingested)`);
      continue;
    }
    try {
      const result = await ingestTechnique(src.url, src.instruction, {
        convex,
        skipAssociation: true,
      });
      if (result.saved.length === 0) {
        console.log(`${tag}\n  ✗ no technique found`);
        continue;
      }
      console.log(`${tag}\n  ✓ ${result.saved.length} technique(s):`);
      for (const s of result.saved) {
        const t = s.technique;
        console.log(`    ── ${t.title}  [${s.id}]`);
        console.log(`       applicability: ${t.applicability}`);
        console.log(`       tags: ${t.tags.join(", ") || "(none)"}`);
        console.log(
          `       addedIngredients: ${
            t.addedIngredients
              .map((a) => `${a.quantity}${a.unit ? " " + a.unit : ""} ${a.name}`)
              .join("; ") || "(none)"
          }`,
        );
        console.log(`       steps (${t.steps.length}):`);
        t.steps.forEach((st, n) => console.log(`         ${n + 1}. ${st}`));
      }
    } catch (err) {
      console.log(`${tag}\n  ✗ FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --- rebuild associations over the whole library ---
  console.log(`\n========== REASSOCIATE ALL (minScore=${ASSOCIATION_MIN_SCORE}) ==========`);
  const saved = await reassociateAll({ convex });
  console.log(`Saved ${saved.length} association(s).`);

  // --- report association table grouped by technique ---
  const techniques = await convex.query(api.techniques.listTechniques, {});
  console.log("\n========== ASSOCIATION TABLE ==========");
  for (const t of techniques) {
    const links = await convex.query(api.associations.getRecipesForTechnique, {
      techniqueId: t._id,
    });
    console.log(`\n▶ ${t.title}  (tags: ${t.tags.join(", ") || "none"})`);
    if (links.length === 0) {
      console.log(`    (no associations)`);
      continue;
    }
    for (const l of links) {
      console.log(
        `    ${l.score.toFixed(3)}  [${l.category}] ${l.title}  — ${l.reason ?? ""}`,
      );
    }
  }
}

main().catch((e) => {
  console.error("seed-techniques crashed:", e);
  process.exit(1);
});
