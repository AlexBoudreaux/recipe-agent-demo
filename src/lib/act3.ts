/**
 * Shared seam for the ACT 3 menu/side/plan UI (chunk 8B).
 *
 * The new left-panel views (menu workspace, side-dish picker, plan view) don't
 * call Convex mutations directly for the planning ACTIONS — they ask the AGENT
 * to, by sending a precise chat message plus a small structured body. This keeps
 * the single-agent, human-in-the-loop architecture intact: the chef's UI clicks
 * become conversational turns the agent executes with its tools, and the chat
 * transcript stays the source of truth for what happened.
 *
 * `AgentAction` is that one seam. `DashboardShell` wires it to `sendMessage`
 * (which already injects the live mode + active menuId); the views call it with
 * a human-readable instruction and, for plan builds, the authoritative selection
 * values the agent must pass to build_menu_plan verbatim.
 */
export type AgentAction = (
  text: string,
  body?: Record<string, unknown>,
) => void;

export type UnitSystem = "imperial" | "metric";

/**
 * The chef's live plan selections, lifted to the shell so they survive the
 * generate -> plan -> back-to-menu round trip (a conflict can only be resolved
 * if the toggles the chef set are still there when they return to the menu).
 */
export interface PlanControls {
  /** Servings override the chef typed, or null to fall back to the menu target. */
  servings: number | null;
  setServings: (n: number | null) => void;
  unitSystem: UnitSystem;
  setUnitSystem: (u: UnitSystem) => void;
  /** Technique ids the chef chose to apply. ALWAYS starts empty (never auto-on). */
  selectedTechniqueIds: string[];
  toggleTechnique: (id: string) => void;
  /** True while the agent is mid-turn, so action buttons can disable. */
  busy: boolean;
  /** Ask the agent to build/regenerate the plan for the given serving count. */
  generatePlan: (servings: number) => void;
  /** Add a library recipe (a chosen side) to the active menu. */
  addRecipe: (recipeId: string, title: string) => void;
}
