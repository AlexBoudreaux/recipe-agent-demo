import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
async function run() {
  const all = await convex.query(api.recipes.listRecipes, {});
  // dup key = title + sourceUrl. Keep earliest createdAt, delete the rest.
  const groups = new Map<string, typeof all>();
  for (const r of all) {
    const k = `${r.title}|||${r.sourceUrl}`;
    if (!groups.has(k)) groups.set(k, [] as any);
    groups.get(k)!.push(r);
  }
  let deleted = 0;
  for (const [k, rows] of groups) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort((a,b)=>a.createdAt-b.createdAt);
    for (const r of sorted.slice(1)) {
      console.log(`Deleting dup: ${r.title} (${new Date(r.createdAt).toISOString()}) ${r._id}`);
      await convex.mutation(api.admin.deleteRecipe, { recipeId: r._id });
      deleted++;
    }
  }
  console.log("Deleted", deleted, "duplicate row(s)");
  const after = await convex.query(api.recipes.listRecipes, {});
  const byCat: Record<string,number> = {};
  for (const r of after) byCat[r.category]=(byCat[r.category]??0)+1;
  console.log("Now TOTAL", after.length, byCat);
}
run();
