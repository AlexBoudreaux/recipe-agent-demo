# PRD: Recipe Agent (augment-the-chef demo)

Status: ready-for-agent

## Problem Statement

I cook a lot, and the recipes I want live in places that are hostile to actually cooking from them. A great recipe is buried in a 12-minute YouTube video or behind a wall of blog narrative and ads. When I find techniques worth reusing (a salt-and-baking-soda brine for shrimp), that knowledge evaporates because it lives in one video I will never find again. When I plan a real meal I have to manually reconcile servings, convert units, figure out a complementary side, and hand-write a shopping list that I then re-sort in my head by where things are in the store. None of these tools learn. Every recipe starts from zero, and nothing I save makes the next meal easier to plan.

I want a tool that captures recipes and techniques from the messy sources I already use, builds knowledge that compounds as I add to it, and helps me plan and shop, without taking the thinking away from me. It should augment me as the chef, not cook for me.

## Solution

A web app with a single conversational agent and a live artifact panel. I paste a blog URL or YouTube link with a plain-language instruction ("save the second recipe, the spicy pasta, ignore the first") and the agent extracts a clean, structured recipe that streams into the panel as it is built, then saves it. I can also ingest techniques, which the agent automatically associates with every applicable recipe in my library, in both directions, so order of ingestion does not matter.

When I plan a meal I create a menu, add recipes, ask the agent to find a complementary side from my own library, and then ask for a final plan. Crucially, the agent never silently rewrites a recipe. I decide which associated techniques get incorporated. Once I choose, the agent produces a snapshot plan with the techniques woven into the steps and ingredients, scaled to my serving count, converted to my chosen unit system using deterministic math (never an LLM guess), with a shopping list grouped by area of the store.

The library is seeded with ~30 real recipes so it feels alive from the first second, and recipes carry generated cover photos so it looks like a real product.

## User Stories

1. As a chef, I want to paste a recipe blog URL into one chat box, so that I can capture a recipe without copying and pasting fields by hand.
2. As a chef, I want to paste a YouTube link, so that I can capture recipes that only exist as cooking videos.
3. As a chef, I want to add a plain-language instruction alongside a link, so that I can tell the agent exactly what to extract.
4. As a chef, I want the agent to handle a source that contains multiple recipes, so that I can capture each one separately from a single link.
5. As a chef, I want to tell the agent to save only one of several recipes in a source, so that I do not clutter my library with ones I do not want.
6. As a chef, I want the agent to figure out on its own whether I am giving it a recipe or a technique, so that I do not have to flip a hard switch for every input.
7. As a chef, I want a soft ingest/search mode toggle, so that I can bias the agent toward what I am mostly doing without being locked out of other actions.
8. As a chef, I want to watch the recipe build live in a side panel as it is extracted, so that the tool feels responsive and I can see it working.
9. As a chef, I want extracted recipes to have a normalized ingredient list with quantity, unit, and prep, so that the data is consistent and machine-usable.
10. As a chef, I want each recipe classified into a category (main, side, dessert, beverage, appetizer, sauce), so that the library is organized and searchable.
11. As a chef, I want each recipe tagged from a controlled vocabulary (proteins, dish types), so that searching and matching are reliable.
12. As a chef, I want a short generated summary for each recipe, so that I can scan my library quickly.
13. As a chef, I want a generated cover photo for each recipe, so that the library looks real and appetizing.
14. As a chef, I want image generation to never block saving a recipe, so that a slow or failed image does not break ingestion.
15. As a chef, I want to ingest a cooking technique from a URL or video, so that I can capture reusable know-how, not just whole recipes.
16. As a chef, I want the agent to suggest the techniques it found in a source and let me pick which to extract, so that I stay in control of what gets saved.
17. As a chef, I want a saved technique to carry its own steps and the ingredients it adds, so that it can later be incorporated into a recipe concretely.
18. As a chef, I want a newly saved technique automatically associated with every applicable existing recipe, so that my whole library benefits immediately.
19. As a chef, I want a newly ingested recipe automatically associated with every applicable existing technique, so that association works regardless of ingest order.
20. As a chef, I want to see why a technique was associated with a recipe (a match score/reason), so that I trust the association and can spot mistakes.
21. As a chef, I want to search my library for a recipe by ingredient or type, so that I can find what I saved.
22. As a chef, I want search to combine tags and meaning, so that I get the right matches and not near-miss noise.
23. As a chef, I want to open a recipe and see techniques attached to it, so that I know what know-how applies, even before applying it.
24. As a chef, I want attached techniques to be visibly NOT yet incorporated into the steps, so that I can tell stored knowledge from applied knowledge.
25. As a chef, I want to create a menu, so that I can plan a full meal from multiple recipes.
26. As a chef, I want to add a recipe to a menu, so that I can assemble the meal I am planning.
27. As a chef, I want to ask the agent to find a side dish that complements a main, so that I do not have to brainstorm pairings myself.
28. As a chef, I want the side suggestions drawn from my own saved sides, so that the library demonstrably compounds in value.
29. As a chef, I want three side options each with a reason it pairs well, so that I can make an informed pick.
30. As a chef, I want to add a chosen side to the menu, so that my meal plan is complete.
31. As a chef, I want to choose which associated techniques get incorporated into a recipe, so that the agent augments rather than overrides my judgment.
32. As a chef, I want the agent to never auto-incorporate a technique, so that nothing changes my recipe without my say-so.
33. As a chef, I want the agent to flag when two chosen techniques conflict, so that I can resolve it rather than get a silently broken recipe.
34. As a chef, I want to generate a final plan for a menu, so that I get one cookable document for the whole meal.
35. As a chef, I want the plan to weave my chosen techniques into the relevant steps and ingredients, so that the technique actually changes how I cook the dish.
36. As a chef, I want the plan scaled to a serving count I choose, so that I can cook for the right number of people.
37. As a chef, I want unit conversion done by deterministic math, not the LLM, so that quantities are always correct.
38. As a chef, I want conversions limited to same-dimension (volume to volume, weight to weight), so that the tool never fakes a conversion it cannot do reliably.
39. As a chef, I want a shopping list for the whole menu, so that I can buy everything in one trip.
40. As a chef, I want the shopping list to consolidate the same ingredient across recipes, so that I do not buy duplicates.
41. As a chef, I want the shopping list grouped by area of the store, so that shopping is fast.
42. As a chef, I want a generated plan saved as a versioned snapshot, so that I can reopen exactly what I generated and regenerate without losing history.
43. As a chef, I want to keep chatting within one task across multiple messages, so that I can refine a search or extraction without losing context.
44. As a chef, I want to clear the chat when I move to a new task, so that old context does not bleed into the next thing I do.
45. As a chef, I want failures explained conversationally (bad link, no transcript, no recipe found, empty search), so that I am never staring at a stack trace.
46. As a chef, I want the library pre-populated with real recipes when I open the app, so that it feels like a real product, not an empty shell.
47. As a developer/presenter, I want the app deployed live on Vercel, so that I can demo it from a real URL.
48. As a developer/presenter, I want the model provider swappable with one change, so that I can pick the best cost/quality option without rewrites.

## Implementation Decisions

### Architecture
- A single agent (`RecipeAgent`, built on the Vercel AI SDK `ToolLoopAgent`) on one chat endpoint owns the whole conversation. There are two SOFT modes (ingest, search) exposed as a UI toggle that biases the system prompt and which tools are emphasized; it never restricts available tools. The agent classifies user intent (recipe vs technique, which subset to save) from the URL plus the user's message and branches accordingly.
- Ingestion is conversational, not fire-and-forget. The agent may propose options (e.g. multiple recipes or candidate techniques found in a source) and wait for the user to choose. The underlying extraction steps are deterministic tools the agent calls after intent is settled.
- The model provider is accessed through the Vercel AI Gateway (single key, string model ids). Default model `openai/gpt-5.5` for all text tasks; swappable to Claude with a one-string change.

### Modules
- `UnitConverter` (deep, pure): same-dimension unit conversion (vol↔vol, weight↔weight) and serving scaling. No LLM. Returns original unit unchanged when a conversion is not same-dimension. This is the correctness-critical "trust" module.
- `IngredientConsolidator` (deep, pure): merges identical ingredients across recipes and scales quantities for a target serving count. No LLM.
- `AssociationEngine` (deep): given a recipe or a technique, computes matches against the other set via controlled-tag filter plus vector-similarity rank, returning matches with a score. Vector/embedding access is injected so it is testable with stubs. Runs bidirectionally (new technique scans recipes; new recipe scans techniques).
- `TagVocabulary` (deep): the controlled tag set and the rules for assigning tags; allows extension only when no existing tag fits.
- `SourceFetcher` (deep interface, env-conditional): turns a source URL into clean text. Blog URLs are fetched and cleaned (readability-style). YouTube transcripts use an environment-selected provider: a free direct-scrape library (youtube-transcript-plus) for LOCAL seeding on a residential IP, and the Supadata managed API for LIVE Vercel ingestion. This split conserves Supadata's free credits.
- `RecipeExtractor` / `TechniqueExtractor` (LLM): clean text plus user instruction → one or more structured Recipe / Technique objects, including category, controlled tags, summary, normalized ingredients; technique includes its own steps and added ingredients.
- `SideDishMatcher`: deterministically filters candidates (category = side, excluding overlapping protein) then has the LLM rank three with pairing reasons.
- `PlanBuilder` (orchestration): given a menu and the human's technique choices and serving/unit options, produces a `MenuPlan`. It calls `UnitConverter` and `IngredientConsolidator` for all math, and uses the LLM only for technique incorporation prose and aisle grouping of the shopping list.
- `RecipeAgent`: ToolLoopAgent plus tool wiring and mode bias. Read tools over Convex (getMenu, findRecipes, getTechniquesForRecipe) and action tools (extract/save recipe and technique, generateSideDishes, buildMenuPlan).
- Convex data layer: schema, queries/mutations, a vector index, and file storage for images.
- Artifact UI: a two-column layout. Left is chat; right is the artifact panel where a recipe/technique/plan streams in via partial-object streaming (`useObject`) against a Zod schema, then a Convex reactive query becomes the source of truth (render saved ?? draft, no flicker).

### Data model (Convex)
- Menu: id, name, createdAt, ordered recipeRefs, optional targetServings.
- Recipe: id, title, sourceUrl, sourceType (blog|youtube), category, summary, normalized ingredients [{name, quantity, unit, prep}], yield {amount, unit}, steps [], tags [] (controlled vocab), techniqueRefs [], imageId, embedding (of title+summary+tags), createdAt.
- Technique: id, title, sourceUrl, sourceType, description, applicability (text, embedded), steps [], addedIngredients [{name, quantity, unit}], embedding, createdAt.
- Association: link between a recipe and a technique carrying a match score (for explainability).
- MenuPlan: snapshot with version history. {menuId, createdAt, servings, unitSystem, appliedTechniques [], consolidatedIngredients [], perRecipeSteps [], shoppingList (grouped by store area)}.

### Context and state flow
- The client sends a small pointer (current menuId, mode) as body fields via the AI SDK transport's request-preparation hook; the agent retrieves live state through Convex read tools rather than stuffing state into the prompt.
- Chat is multi-turn within a task and held in memory by `useChat`; it is not persisted long-term. Clearing the chat is a local reset and loses nothing because durable state lives in Convex.

### Key behavioral decisions
- Technique incorporation is NEVER automatic. The human chooses which associated techniques to apply; the agent surfaces options and flags conflicts.
- Unit conversion is deterministic and same-dimension only; no volume↔weight (avoids density guessing).
- Aisle grouping is generated by the LLM at plan time, not stored at ingest.
- Side dishes are searched from seeded library sides, not generated.
- Images use Seedream 4.5 via the Gateway, stored in Convex file storage, generated async after save with a placeholder until ready.
- Failures surface conversationally; image generation never blocks a save.

### Seeding
- The ~30-recipe library is created by running the REAL ingestion pipeline locally (residential IP, free YouTube scraping path) once, and committing the results to Convex. This exercises the real pipeline and produces search-ready data (tags, embeddings, images) plus a few pre-associated techniques so the library looks alive.

### Deployment
- Deployed live on Vercel. Pin a current patched Next.js version (Vercel's deploy pipeline hard-blocks versions with known CVEs).

## Testing Decisions

A good test here asserts external behavior through a module's public interface, not its internals. Tests feed inputs and check outputs; they do not assert on private helpers, call order, or implementation shape, so they survive refactors.

Modules to unit-test (the pure-logic deep modules, where a silent error would corrupt the demo):
- `UnitConverter`: same-dimension conversions are mathematically correct; serving scaling is correct; non-same-dimension inputs return the original unit unchanged rather than a fabricated value; round-trip conversions are stable.
- `IngredientConsolidator`: identical ingredients across recipes merge into one line with summed, scaled quantities; non-identical ingredients stay separate; scaling factors apply correctly.
- `AssociationEngine`: with injected/stubbed embeddings and a fixed tag set, the right recipes match a technique (and vice versa), scores rank sensibly, and clearly-inapplicable items are excluded. Tests inject the vector source so they are deterministic.
- `TagVocabulary`: assignment maps inputs to the controlled set; extension happens only when nothing fits.

The LLM-backed modules (`RecipeExtractor`, `TechniqueExtractor`, `PlanBuilder` prose, `SideDishMatcher` ranking) are verified by running them during development rather than unit-tested, since their outputs are non-deterministic.

Prior art: none yet (greenfield). Establish the pattern with the pure-logic modules using the repo's chosen test runner; keep each module's tests in isolation with injected dependencies for anything I/O- or model-bound.

## Out of Scope

- Authentication and multi-user support. Single-user demo.
- Web discovery of new recipes/sides beyond the user's library (Exa-style search). Deferred to a later version; mentioned only as the productionization story.
- Volume↔weight unit conversion (needs per-ingredient density). Explicitly excluded.
- A residential-proxy transcript path in production (Supadata is used live); proxy is only a documented fallback.
- Durable/long-lived chat history persistence.
- Nutrition info, pantry/inventory tracking, meal-plan calendars, cost estimation.
- Mobile-native apps.

## Further Notes

- Build order (no cut line, build it right): 1) skeleton (Next + Convex + Gateway + two-column shell); 2) Act 1 ingest agent (blog + YouTube, streaming artifact, deterministic conversion, tags + embeddings + image at ingest, save); 3) seed via real local ingestion of ~30 recipes committed to Convex; 4) Act 2 technique ingest + bidirectional association + search/library; 5) Act 3 menu + side-dish search + human-picks-techniques + plan generation + shopping list; 6) polish (error/empty states, UX).
- The empirical Vercel test is settled: all four free YouTube-transcript methods work from a residential IP and are IP-blocked from Vercel's datacenter ("Sign in to confirm you're not a bot" / LOGIN_REQUIRED). Hence the env-conditional `SourceFetcher`. Note: `@playzone/youtube-transcript` must be imported via its `dist/api` subpath to avoid an auto-running CLI side effect.
- Strategic framing for the interview: this consumer app is intentionally isomorphic to enterprise agentic use cases (ingest unstructured sources, extract structured entities, route to deterministic tools where accuracy is non-negotiable, build a knowledge layer that compounds, keep a human in control). The deterministic unit converter and the human-gated technique incorporation are the on-stage proofs of "guardrails" and "augment not automate."
