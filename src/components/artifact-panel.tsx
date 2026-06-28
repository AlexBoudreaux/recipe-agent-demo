"use client";

import * as React from "react";
import { useQuery } from "convex/react";
import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { LibraryBigIcon } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  RecipeCard,
  type RecipeView,
  type RecipeCardStatus,
} from "@/components/recipe-card";
import { TechniqueCard, type TechniqueView } from "@/components/technique-card";
import { LibraryGrid } from "@/components/library-grid";
import { SearchGrid } from "@/components/search-grid";
import { RecipeDetail } from "@/components/recipe-detail";
import { MenuWorkspace } from "@/components/menu-workspace";
import { SideDishPicker } from "@/components/side-dish-picker";
import { MenuPlanView } from "@/components/menu-plan-view";
import { latestMenuId } from "@/lib/menu-derive";
import type { PlanControls } from "@/lib/act3";
import type {
  CandidateRecipe,
  CandidateTechnique,
  ExtractEvent,
  PartialCandidate,
  PartialTechniqueCandidate,
  PlanEvent,
  SaveRecipeResult,
  SaveTechniqueResult,
  SearchEvent,
  SearchResultItem,
  SideDishEvent,
  TechniqueExtractEvent,
} from "@/lib/artifact-types";

const norm = (s?: string) => (s ?? "").trim().toLowerCase();

// The soft, dotted workspace everything builds onto. Kept verbatim from the
// user's manual tuning of the canvas dot pattern.
const CANVAS_BG =
  "relative h-full min-h-0 bg-[radial-gradient(oklch(0.5_0.02_55/0.16)_1.2px,transparent_1.2px)] [background-size:18px_18px]";

type ToolPart = {
  type: string;
  state?: string;
  preliminary?: boolean;
  input?: { queryText?: string; menuId?: string };
  output?: unknown;
};

type Phase = "fetching" | "extracting" | "ready";

/**
 * The discriminated artifact derived from the agent's tool parts. The LAST
 * extract-or-search the agent ran wins, so the panel always reflects the chef's
 * most recent action. Recipe and technique streams share a shape; search carries
 * the ranked hits the grid renders.
 */
type DerivedArtifact =
  | { kind: "none" }
  | {
      kind: "recipe";
      phase: Phase;
      candidates: Array<CandidateRecipe | PartialCandidate>;
      savedByTitle: Map<string, string>;
    }
  | {
      kind: "technique";
      phase: Phase;
      candidates: Array<CandidateTechnique | PartialTechniqueCandidate>;
      savedByTitle: Map<string, string>;
    }
  | { kind: "search"; query: string; results: SearchResultItem[]; pending: boolean }
  // ACT 3 — the most recent menu/side/plan action the agent took.
  | { kind: "menu"; menuId: string }
  | { kind: "sides"; menuId: string | null; event: SideDishEvent }
  | { kind: "plan"; menuId: string; event: PlanEvent };

/**
 * One pass over the messages builds the recipe, technique, and search states in
 * parallel and remembers which kind the agent touched most recently. Errors and
 * empties are ignored here (the chat surfaces those) so a bad link never wipes a
 * good card.
 */
function deriveArtifact(messages: UIMessage[]): DerivedArtifact {
  let recipePhase: Phase | null = null;
  let recipeCandidates: Array<CandidateRecipe | PartialCandidate> = [];
  const recipeSaved = new Map<string, string>();

  let techPhase: Phase | null = null;
  let techCandidates: Array<CandidateTechnique | PartialTechniqueCandidate> = [];
  const techSaved = new Map<string, string>();

  let search: { query: string; results: SearchResultItem[]; pending: boolean } | null =
    null;

  // ACT 3 — menus, sides, plans.
  let activeMenuId: string | null = null;
  let sidesEvent: SideDishEvent | null = null;
  let planEvent: PlanEvent | null = null;

  let last:
    | "recipe"
    | "technique"
    | "search"
    | "menu"
    | "sides"
    | "plan"
    | null = null;

  for (const m of messages) {
    for (const raw of m.parts) {
      const part = raw as unknown as ToolPart;

      // --- recipe extraction ---
      if (part.type === "tool-fetch_and_extract") {
        last = "recipe";
        if (part.state === "input-streaming" || part.state === "input-available") {
          if (recipePhase === null) recipePhase = "fetching";
          continue;
        }
        if (part.state === "output-available" && part.output) {
          const ev = part.output as ExtractEvent;
          if (ev.status === "fetching") {
            recipePhase = "fetching";
            recipeCandidates = [];
          } else if (ev.status === "extracting") {
            recipePhase = "extracting";
            recipeCandidates = ev.candidates;
          } else if (ev.status === "ready") {
            recipePhase = "ready";
            recipeCandidates = ev.candidates;
          }
        }
        continue;
      }

      // --- technique extraction ---
      if (part.type === "tool-fetch_and_extract_technique") {
        last = "technique";
        if (part.state === "input-streaming" || part.state === "input-available") {
          if (techPhase === null) techPhase = "fetching";
          continue;
        }
        if (part.state === "output-available" && part.output) {
          const ev = part.output as TechniqueExtractEvent;
          if (ev.status === "fetching") {
            techPhase = "fetching";
            techCandidates = [];
          } else if (ev.status === "extracting") {
            techPhase = "extracting";
            techCandidates = ev.candidates;
          } else if (ev.status === "ready") {
            techPhase = "ready";
            techCandidates = ev.candidates;
          }
        }
        continue;
      }

      // --- search ---
      if (part.type === "tool-search_recipes") {
        last = "search";
        if (part.state === "input-streaming" || part.state === "input-available") {
          search = {
            query: part.input?.queryText ?? "",
            results: [],
            pending: true,
          };
          continue;
        }
        if (part.state === "output-available" && part.output) {
          const ev = part.output as SearchEvent;
          search = { query: ev.query, results: ev.results, pending: false };
        }
        continue;
      }

      // --- saves: record id by title so a draft can swap to its Convex row ---
      if (
        part.type === "tool-save_recipe" &&
        part.state === "output-available" &&
        !part.preliminary &&
        part.output
      ) {
        const out = part.output as SaveRecipeResult;
        if (out.savedRecipeId) recipeSaved.set(norm(out.title), out.savedRecipeId);
      }
      if (
        part.type === "tool-save_technique" &&
        part.state === "output-available" &&
        !part.preliminary &&
        part.output
      ) {
        const out = part.output as SaveTechniqueResult;
        if (out.savedTechniqueId) techSaved.set(norm(out.title), out.savedTechniqueId);
      }

      // --- ACT 3 menu lifecycle: create / add / set / get all point at a menu ---
      const done = part.state === "output-available" && part.output;
      if (
        part.type === "tool-create_menu" ||
        part.type === "tool-add_recipe_to_menu" ||
        part.type === "tool-set_menu_servings"
      ) {
        if (done) {
          const out = part.output as { menuId?: string };
          if (out.menuId) activeMenuId = out.menuId;
          last = "menu";
        }
        continue;
      }
      if (part.type === "tool-get_menu") {
        if (part.input?.menuId) activeMenuId = part.input.menuId;
        if (done) {
          const out = part.output as { id?: string };
          if (out.id) activeMenuId = out.id;
        }
        last = "menu";
        continue;
      }

      // --- side-dish suggestions ---
      if (part.type === "tool-generate_side_dishes") {
        last = "sides";
        if (done) sidesEvent = part.output as SideDishEvent;
        continue;
      }

      // --- built plan ---
      if (part.type === "tool-build_menu_plan") {
        last = "plan";
        if (done) {
          planEvent = part.output as PlanEvent;
          if (planEvent.menuId) activeMenuId = planEvent.menuId;
        }
        continue;
      }
    }
  }

  if (last === "recipe" && recipePhase !== null) {
    return {
      kind: "recipe",
      phase: recipePhase,
      candidates: recipeCandidates,
      savedByTitle: recipeSaved,
    };
  }
  if (last === "technique" && techPhase !== null) {
    return {
      kind: "technique",
      phase: techPhase,
      candidates: techCandidates,
      savedByTitle: techSaved,
    };
  }
  if (last === "search" && search) {
    return { kind: "search", ...search };
  }
  if (last === "plan" && planEvent) {
    return { kind: "plan", menuId: planEvent.menuId, event: planEvent };
  }
  if (last === "sides" && sidesEvent) {
    return { kind: "sides", menuId: activeMenuId, event: sidesEvent };
  }
  // A menu-related action (or a plan/side build still in flight) keeps the menu
  // workspace on the canvas rather than flashing back to the library grid.
  if (
    activeMenuId &&
    (last === "menu" || last === "plan" || last === "sides")
  ) {
    return { kind: "menu", menuId: activeMenuId };
  }
  return { kind: "none" };
}

function recipeToView(c: CandidateRecipe | PartialCandidate): RecipeView {
  return {
    title: c.title,
    category: c.category,
    summary: c.summary,
    yield: c.yield,
    ingredients: c.ingredients,
    steps: c.steps,
    tags: c.tags?.filter((t): t is string => typeof t === "string"),
  };
}

function techniqueToView(
  c: CandidateTechnique | PartialTechniqueCandidate,
): TechniqueView {
  return {
    title: c.title,
    description: c.description,
    applicability: c.applicability,
    steps: c.steps,
    addedIngredients: c.addedIngredients,
    tags: c.tags?.filter((t): t is string => typeof t === "string"),
  };
}

// The explicit user navigation overlaid on top of the message-derived view. It
// expires the moment a new chat message arrives (tracked by message count) so a
// fresh extraction/search always takes the canvas back.
type PanelView =
  | { kind: "follow" }
  | { kind: "grid" }
  | { kind: "detail"; recipeId: string; back: PanelView }
  | { kind: "menu"; menuId: string; back: PanelView }
  | { kind: "plan"; menuId: string; planId?: string; back: PanelView };

export function ArtifactPanel({
  messages,
  status,
  reservedRight = 0,
  controls,
}: {
  messages: UIMessage[];
  status: UseChatHelpers<UIMessage>["status"];
  /** px to keep clear on the right so the floating chat never covers content */
  reservedRight?: number;
  /** ACT 3 planning controls + agent actions, lifted to the shell. */
  controls: PlanControls;
}) {
  const artifact = React.useMemo(() => deriveArtifact(messages), [messages]);
  const activeMenuId = React.useMemo(() => latestMenuId(messages), [messages]);

  // --- explicit navigation (clicking a card / Back / Library), no effects ---
  const [view, setView] = React.useState<PanelView>({ kind: "follow" });
  const [viewLen, setViewLen] = React.useState(0);
  const navigate = React.useCallback(
    (v: PanelView) => {
      setView(v);
      setViewLen(messages.length);
    },
    [messages.length],
  );
  // A non-follow view only holds until the next message; then we follow again.
  const activeView: PanelView =
    view.kind === "follow" || viewLen === messages.length ? view : { kind: "follow" };

  // --- focus among multiple candidates; reset on a new candidate set WITHOUT an
  // effect (the React-sanctioned "adjust state during render" pattern) ---
  const candidates =
    artifact.kind === "recipe" || artifact.kind === "technique"
      ? artifact.candidates
      : [];
  const identity = candidates.map((c) => norm(c.title)).join("|");
  const [focused, setFocused] = React.useState(0);
  const [focusIdentity, setFocusIdentity] = React.useState(identity);
  if (identity !== focusIdentity) {
    setFocusIdentity(identity);
    setFocused(0);
  }
  const focusedIndex = Math.min(focused, Math.max(0, candidates.length - 1));
  const focusedTitle = candidates[focusedIndex]?.title;

  // --- subscribe to the saved Convex rows (skip until an id exists) ---
  const recipeSavedId =
    artifact.kind === "recipe" && focusedTitle
      ? artifact.savedByTitle.get(norm(focusedTitle))
      : undefined;
  const techSavedId =
    artifact.kind === "technique" && focusedTitle
      ? artifact.savedByTitle.get(norm(focusedTitle))
      : undefined;

  const savedRecipe = useQuery(
    api.recipes.getRecipe,
    recipeSavedId ? { recipeId: recipeSavedId as Id<"recipes"> } : "skip",
  );
  const savedTechnique = useQuery(
    api.techniques.getTechnique,
    techSavedId ? { techniqueId: techSavedId as Id<"techniques"> } : "skip",
  );

  // The active menu's recipe ids, so the side picker can show an added side as
  // "on the menu" reactively (subscribed; skipped until a menu exists).
  const activeMenu = useQuery(
    api.menus.getMenu,
    activeMenuId ? { menuId: activeMenuId as Id<"menus"> } : "skip",
  );
  const onMenuIds = React.useMemo(
    () => new Set((activeMenu?.recipes ?? []).map((r) => r._id as string)),
    [activeMenu],
  );

  const openDetail = React.useCallback(
    (recipeId: string, back: PanelView) =>
      navigate({ kind: "detail", recipeId, back }),
    [navigate],
  );

  const padRight = reservedRight ? reservedRight + 24 : undefined;
  const scrolled = (node: React.ReactNode) => (
    <div className={CANVAS_BG}>
      <ScrollArea className="h-full">
        <div style={{ paddingRight: padRight }}>{node}</div>
      </ScrollArea>
    </div>
  );

  // 1) Explicit detail override.
  if (activeView.kind === "detail") {
    return scrolled(
      <RecipeDetail
        recipeId={activeView.recipeId}
        onBack={() => navigate(activeView.back)}
      />,
    );
  }

  // 2) Explicit "browse library" override.
  if (activeView.kind === "grid") {
    return scrolled(
      <LibraryGrid onOpen={(id) => openDetail(id, { kind: "grid" })} />,
    );
  }

  // 2b) Explicit menu / plan navigation (e.g. "Back to menu", "View plan v2").
  if (activeView.kind === "menu") {
    return scrolled(
      <MenuWorkspace
        menuId={activeView.menuId}
        controls={controls}
        onOpenRecipe={(id) => openDetail(id, activeView)}
        onViewPlan={() =>
          navigate({ kind: "plan", menuId: activeView.menuId, back: activeView })
        }
      />,
    );
  }
  if (activeView.kind === "plan") {
    return scrolled(
      <MenuPlanView
        menuId={activeView.menuId}
        planId={activeView.planId}
        conflicts={artifact.kind === "plan" ? artifact.event.conflicts : []}
        controls={controls}
        onBack={() => navigate(activeView.back)}
        onViewVersion={(planId) =>
          navigate({ ...activeView, planId })
        }
      />,
    );
  }

  // 3) Follow the conversation — search results grid.
  if (artifact.kind === "search") {
    return scrolled(
      artifact.pending ? (
        <SearchPending query={artifact.query} />
      ) : (
        <SearchGrid
          query={artifact.query}
          results={artifact.results}
          onOpen={(id) => openDetail(id, { kind: "follow" })}
        />
      ),
    );
  }

  // 3a-ii) Follow the conversation — ACT 3 plan, side picker, and menu.
  if (artifact.kind === "plan") {
    return scrolled(
      <MenuPlanView
        menuId={artifact.menuId}
        conflicts={artifact.event.conflicts}
        controls={controls}
        onBack={() =>
          navigate({ kind: "menu", menuId: artifact.menuId, back: { kind: "follow" } })
        }
        onViewVersion={(planId) =>
          navigate({
            kind: "plan",
            menuId: artifact.menuId,
            planId,
            back: { kind: "follow" },
          })
        }
      />,
    );
  }
  if (artifact.kind === "sides") {
    return scrolled(
      <SideDishPicker
        event={artifact.event}
        controls={controls}
        alreadyOnMenu={onMenuIds}
        onOpen={(id) => openDetail(id, { kind: "follow" })}
        onBackToMenu={
          artifact.menuId
            ? () =>
                navigate({
                  kind: "menu",
                  menuId: artifact.menuId as string,
                  back: { kind: "follow" },
                })
            : null
        }
      />,
    );
  }
  if (artifact.kind === "menu") {
    return scrolled(
      <MenuWorkspace
        menuId={artifact.menuId}
        controls={controls}
        onOpenRecipe={(id) => openDetail(id, { kind: "follow" })}
        onViewPlan={() =>
          navigate({ kind: "plan", menuId: artifact.menuId, back: { kind: "follow" } })
        }
      />,
    );
  }

  // 3b) Follow the conversation — a streaming recipe or technique card.
  if (artifact.kind === "recipe" || artifact.kind === "technique") {
    const isRecipe = artifact.kind === "recipe";
    const savedRow = isRecipe ? savedRecipe : savedTechnique;
    const savedId = isRecipe ? recipeSavedId : techSavedId;
    const cardStatus: RecipeCardStatus = savedRow
      ? "saved"
      : savedId
        ? "saving"
        : artifact.phase === "ready"
          ? "draft"
          : "streaming";

    const statusBadge =
      candidates.length > 1
        ? `${candidates.length} ${isRecipe ? "recipes" : "techniques"}`
        : artifact.phase === "ready" || savedId
          ? isRecipe
            ? "1 recipe"
            : "1 technique"
          : "Building…";

    const focusedCandidate = candidates[focusedIndex];

    return (
      <div className={CANVAS_BG}>
        <div className="pointer-events-none absolute left-4 top-4 z-10">
          <Badge
            variant="secondary"
            className="bg-card/80 shadow-sm ring-1 ring-border/60 backdrop-blur"
          >
            {statusBadge}
          </Badge>
        </div>
        <button
          type="button"
          onClick={() => navigate({ kind: "grid" })}
          className="absolute top-4 z-10 inline-flex items-center gap-1.5 rounded-full border bg-card/85 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm ring-1 ring-border/60 backdrop-blur transition-colors hover:bg-accent hover:text-foreground"
          style={{ right: padRight ? padRight - 12 : 16 }}
        >
          <LibraryBigIcon className="size-3.5" />
          Library
        </button>

        <ScrollArea className="h-full">
          <div
            className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-8"
            style={{ paddingRight: padRight }}
          >
            {/* Multi-candidate chooser, mirrors the agent's chat question. */}
            {candidates.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {candidates.map((c, i) => {
                  const isSaved = artifact.savedByTitle.has(norm(c.title));
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setFocused(i)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        i === focusedIndex
                          ? "border-brand bg-brand/10 text-brand"
                          : "bg-card text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {c.title ?? `${isRecipe ? "Recipe" : "Technique"} ${i + 1}`}
                      {isSaved ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>
            )}

            {isRecipe ? (
              <RecipeCard
                recipe={
                  savedRecipe
                    ? {
                        title: savedRecipe.title,
                        category: savedRecipe.category,
                        summary: savedRecipe.summary,
                        yield: savedRecipe.yield,
                        ingredients: savedRecipe.ingredients,
                        steps: savedRecipe.steps,
                        tags: savedRecipe.tags,
                        imageUrl: savedRecipe.imageUrl,
                      }
                    : focusedCandidate
                      ? recipeToView(focusedCandidate as CandidateRecipe)
                      : {}
                }
                status={cardStatus}
              />
            ) : (
              <TechniqueCard
                technique={
                  savedTechnique
                    ? {
                        title: savedTechnique.title,
                        description: savedTechnique.description,
                        applicability: savedTechnique.applicability,
                        steps: savedTechnique.steps,
                        addedIngredients: savedTechnique.addedIngredients,
                        tags: savedTechnique.tags,
                      }
                    : focusedCandidate
                      ? techniqueToView(focusedCandidate as CandidateTechnique)
                      : {}
                }
                status={cardStatus}
              />
            )}

            {status === "streaming" && artifact.phase === "ready" && (
              <p className="px-1 text-center text-xs text-muted-foreground">
                {isRecipe ? "Recipe" : "Technique"} extracted. The agent is
                deciding what to do next…
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  // 4) Default: the live library grid (PRD story 46).
  return scrolled(
    <LibraryGrid onOpen={(id) => openDetail(id, { kind: "follow" })} />,
  );
}

function SearchPending({ query }: { query: string }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 px-6 py-24 text-center text-muted-foreground">
      <div className="size-8 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
      <p className="text-sm">
        Searching your library{query ? ` for “${query}”` : ""}…
      </p>
    </div>
  );
}
