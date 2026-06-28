# Recipe Agent Demo — Handoff & Remaining Work

This is a working handoff so a fresh agent has the same understanding the previous
orchestrator (Claude) had. The major build phases are DONE. What's left is bug-fixing,
polish, and demo-readiness. The human (Alex) will be hands-on and wants to walk this
to-do list step by step, not have it executed blindly. Give recommendations, confirm
before big moves, keep changes consistent with what exists.

The original PRD is at `.scratch/recipe-agent/PRD.md` — read it for full product intent.

---

## What this is

A single-user web app: one conversational agent + a live artifact panel. The chef pastes
a blog/YouTube link with plain-language instructions; the agent extracts a clean
structured recipe (or a reusable technique) that streams into the panel and saves to a
library. Techniques auto-associate (bidirectionally) with applicable recipes. The chef
builds menus, gets library-sourced side-dish suggestions, chooses which techniques to
apply (never automatic), and generates a versioned plan: scaled servings, deterministic
unit conversion, ingredients consolidated, shopping list grouped by store area.

It's a portfolio/interview demo (DataRobot). The on-stage proofs are the DETERMINISTIC
unit math (accuracy is non-negotiable, never an LLM guess) and the HUMAN-GATED technique
incorporation (augment, don't automate).

---

## Stack & architecture

- **Next.js 16** (App Router, TS, Turbopack), **React 19**. Deployed on **Vercel**
  (NOT git-linked; deploys are manual `vercel deploy --prod`).
- **Vercel AI SDK v7** (`ai`, `@ai-sdk/react`). The agent is a v7 `ToolLoopAgent`.
- **Model provider: OpenAI DIRECT** via `@ai-sdk/openai` (NOT the Vercel AI Gateway — we
  switched mid-build over billing). Model id `gpt-5.5`, embeddings
  `text-embedding-3-small` (1536 dims), images `gpt-image-1`. All centralized in
  `src/lib/model.ts`; swapping providers = change that one file (+ add e.g.
  `@ai-sdk/anthropic`). Key is `OPENAI_API_KEY`.
- **Convex** = database + vector search + reactive queries + file storage (cover images).
  Dev/live deployment: `reminiscent-parakeet-860` (`https://reminiscent-parakeet-860.convex.cloud`).
  There is NO separate prod Convex deployment; the live Vercel site reads this same one.
- **shadcn/ui + Tailwind v4**, neutral base + a `--brand` (indigo/orange) accent token.
- **Pure-logic deep modules** (no LLM, unit-tested with Vitest, 83 tests):
  `unit-converter` (same-dimension only, returns input unchanged on cross-dimension — the
  trust module), `ingredient-consolidator`, `tag-vocabulary` (controlled tags +
  METHOD_TAGS that don't count for association overlap), `association-engine` (injected
  embedding resolver, tag-overlap filter then cosine rank).
- **Agent + tools** (`src/lib/recipe-agent.ts`, `recipe-agent-tools.ts`): single agent,
  two SOFT modes (ingest/search) that only bias the prompt, never restrict tools. Tools:
  fetch_and_extract (recipe), fetch_and_extract_technique, save_recipe, save_technique,
  find_recipes, search_recipes, get_recipe, create_menu, add_recipe_to_menu,
  set_menu_servings, get_menu, generate_side_dishes, build_menu_plan.
- **Artifact panel**: streams a draft object live, then a Convex reactive query becomes
  source of truth (`saved ?? draft`, no flicker). A discriminated artifact type
  (`src/lib/artifact-types.ts`) decides which view renders. Library grid shows on load.
- **SourceFetcher** (`src/lib/source-fetcher.ts`): blog = readability; YouTube transcript
  is ENV-CONDITIONAL — free local scraper (`youtube-transcript-plus`) for local seeding
  on a residential IP, **Supadata API** (`SUPADATA_API_KEY`) when on Vercel (datacenter
  IPs are bot-blocked from the free scrapers). Selected via `TRANSCRIPT_PROVIDER` /
  `process.env.VERCEL`.

---

## UI / styling decisions (DO NOT relitigate or redesign)

- The shell is intentionally **grid-dominant left panel + chat sidebar on the right**,
  branded **"Cookbook AI"**, with a (non-functional, cosmetic) avatar + settings gear.
  Alex chose this deliberately. Keep it. New views must match the existing components
  and styling (`recipe-grid-card`, `recipe-detail`, `technique-card`, `search-grid`,
  `menu-workspace`, `side-dish-picker`, `menu-plan-view`, `lib/format.ts`, `--brand`).
- Polish-as-you-go: every feature should already look finished, not deferred to a final
  pass. Alex does his own visual once-over and demo prep.

---

## Current state (built + verified)

All chunks 1–8B are built. Verified against the live deployment:
- **Library**: ~43 recipes (down from a 49 peak after one dedup pass), all with canonical
  units, 1536 embeddings, and generated cover photos. Categories: ~19 main, ~10 side,
  ~10 sauce, 1 appetizer, 0 dessert, 0 beverage (empty dessert/beverage is fine).
- **Techniques**: 4 clean techniques (shrimp brine, asparagus salt brine, off-heat corn,
  potato salt-water coating), instruction-driven extraction. Associations are CLEAN —
  each links only to its correct cluster (shrimp→shrimp dishes, etc.), no cross-cluster
  noise (this was a real bug we fixed in the 7A refinement by excluding cooking-METHOD
  tags from the association overlap guardrail). NOTE: steak and pasta clusters have no
  technique by choice — Alex decided to skip reseeding those for the demo.
- **Act 1 ingest**: conversational, streaming card, multi-recipe chooser, saved??draft,
  typed conversational errors. Works.
- **Act 2**: library grid on load, search results grid, recipe detail showing attached
  techniques as visibly NOT-incorporated (lock icon, "Not applied" amber badge, match %
  + reason), conversational technique ingest (verified streaming). Works.
- **Act 3**: menu workspace (servings stepper, imperial/metric toggle, technique-pick
  toggles that default OFF), side-dish picker (3 library sides + reasons), plan view
  (per-recipe woven steps, consolidated ingredients, aisle-grouped shopping list, version
  pills, conflict banner). Deterministic math verified in real saved plans (per-recipe
  scaling, cross-recipe consolidation, same-dimension-only conversion, surgical technique
  weaving, nothing auto-applied).

Git: local repo on branch `main`, NO remote. Checkpoints committed per phase (latest:
`ec26cef`). Commit convention: concise message + `Co-Authored-By: Claude Opus 4.8 (1M
context) <noreply@anthropic.com>` trailer; exclude `excalidraw.log` and `.scratch/verify/`
from commits.

How we verify: spot-check demo-visible work by querying Convex directly with a tiny
`tsx` script using `ConvexHttpClient` + `anyApi` (run from repo root so it resolves
`node_modules`; build refs via `const api = anyApi`), and by reading screenshots. The
Claude-in-Chrome browser CANNOT reach localhost, but it CAN load the live Vercel URL.
A local headless chromium driver exists under `.scratch/verify/` for localhost shots.

---

## Already resolved — do NOT redo

- Empty-unit ingredient display (the brine's added salt/sugar have unit `""` because the
  source video never specified amounts — that's WHY it's a technique not a recipe). The
  app handles this via `measureLabel()` in `src/lib/format.ts` (renders just the name).
  No need to fake units.
- Technique-ingest streaming (earlier stall was just model latency; confirmed working).
- Association cross-cluster noise (fixed in 7A refinement).
- Same-source exact-duplicate rows (one dedup pass already removed those).

---

## Remaining to-do (suggested order)

### A. Bugs (do first)

1. **Chat search doesn't update the artifact panel.** Typing "pull me all the recipes
   with shrimp" does nothing visually. The search backend (`convex/search.ts`
   searchRecipes) and `search-grid` component exist and work when triggered in Search
   mode, but a natural-language find request doesn't render results in the panel. Find
   out whether it's mode-gating, the agent not calling the search/find tool, or the
   artifact-panel derivation not handling that tool's output — and make a chat search
   populate the grid regardless of the ingest/search toggle. Core flow (PRD stories 21–22).

### B. Deploy & demo-readiness (critical, the demo runs from the live URL)

2. **Redeploy the live Vercel site with the latest code and verify it end to end.** The
   site is not git-linked; deploys are manual. A lot landed since the last deploy
   (7A/7B/8A/8B), so the live URL is likely stale. Redeploy, then walk Act 1→3 on the
   live URL.
3. **Verify LIVE YouTube ingest works on Vercel via Supadata.** Seeding used the free
   local scraper, which is IP-blocked on Vercel. Confirm `SUPADATA_API_KEY` is set in
   Vercel env and the env-conditional SourceFetcher picks the Supadata path when `VERCEL`
   is set, then ingest a real YouTube link from the live site as a test.

### C. Visible polish

4. **Prune near-duplicate recipes.** Multi-recipe videos and two overlapping videos
   produced redundant near-dupes visible in the grid: Torchy's Queso ×2, Habanero Diablo
   (sauce + salsa) ×2, Skillet Roasted Broccoli ×2, Pasta alla Gricia ×2, Salsa Tatemada
   Roja ×2. Keep the single best of each so the library reads as distinct dishes.
   (`scripts/dedup.ts` + `admin.deleteRecipe` exist; the prior dedup only caught EXACT
   same-source dups, not these near-dupes.) Re-check the count after.
5. **Render agent chat messages as markdown.** The agent emits `**bold**` etc. and the
   raw asterisks currently show. Add a lightweight markdown renderer (e.g. react-markdown)
   to the ASSISTANT message bubbles only. Keep it minimal (bold, lists, maybe headings),
   nothing elaborate. IMPORTANT: do NOT change the system prompt — this is purely a render
   change.
6. **Library panel: sticky header + browse tabs + filters.** Turn the "Your cookbook /
   43 recipes saved" line into a sticky bar pinned to the top of the scrollable library
   panel. Add tabs to switch the browse view between Recipes / Menus / Techniques (data
   exists: `listRecipes`, `listMenus`, `listTechniques`). Add category/type filters
   (main/side/sauce/etc.) so the chef can filter the grid manually. Match existing styling.

### D. Tuning

7. **Tune search relevance.** Combined vector+tag search returns too many weak matches
   ("something with shrimp" → 12 results, only 4 actually shrimp; brussels sprouts etc.
   trailing). Add a relevance threshold / tighten the ranking blend so results are mostly
   on-target. (`convex/search.ts`.)

### E. Optional / judgment calls

8. **Maybe make the deterministic action buttons hit Convex directly.** "Add side" and
   "Generate plan" currently route through the model (keeps the single-agent architecture
   pure, but a flaky model turn could mis-call a tool). It's mitigated by sending explicit
   ids in both the message and an authoritative body block. For live-demo reliability you
   may prefer these buttons to be deterministic Convex calls. Small change; weigh against
   architectural purity. Discuss with Alex.
9. **Keep error/empty-state work MINIMAL.** Alex explicitly does NOT want heavy
   error/empty-state or conversational-failure investment. Basic exists already. Just
   make sure nothing looks broken; don't over-build.

---

## Explicitly OUT of scope for the demo

- Steak/pasta technique reseed (skipped on purpose).
- The orphaned "after grilling the steak" step in the Grilled Asparagus recipe (ignore).
- Faking units on the brine's salt/sugar (the app handles empty units).
- Filling dessert/beverage categories (fine to leave empty).
- Auth / multi-user, volume↔weight conversion, durable chat persistence, nutrition,
  pantry, meal-plan calendars (all PRD out-of-scope).
