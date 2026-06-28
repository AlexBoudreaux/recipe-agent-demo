/**
 * Derive the chef's ACTIVE menu id from the chat transcript (chunk 8B).
 *
 * The agent owns menu creation (the create_menu tool returns the id), so the
 * client learns the active menuId by scanning the agent's tool parts rather than
 * holding it in component state. The LAST menu the agent touched wins, so if the
 * chef starts a second menu the panel and the request body both follow it.
 *
 * Used in two places that must agree: DashboardShell (to thread menuId into the
 * request body so the agent reuses it) and ArtifactPanel (to render that menu).
 */
import type { UIMessage } from "ai";

type ToolPart = {
  type: string;
  state?: string;
  input?: { menuId?: string };
  output?: unknown;
};

/** The id-bearing outputs of the menu/plan tools. */
type MenuBearingOutput = { menuId?: string; id?: string; found?: boolean };

/**
 * Scan every tool part and return the most recently referenced menu id, or null
 * if the chef hasn't started a menu yet. Covers create/add/set/get_menu and
 * build_menu_plan — every tool that names a concrete menu.
 */
export function latestMenuId(messages: UIMessage[]): string | null {
  let menuId: string | null = null;

  for (const m of messages) {
    for (const raw of m.parts) {
      const part = raw as unknown as ToolPart;
      if (!part.type.startsWith("tool-")) continue;

      const done = part.state === "output-available" && part.output;

      switch (part.type) {
        case "tool-create_menu":
        case "tool-add_recipe_to_menu":
        case "tool-set_menu_servings":
        case "tool-build_menu_plan": {
          if (done) {
            const out = part.output as MenuBearingOutput;
            if (out.menuId) menuId = out.menuId;
          }
          break;
        }
        case "tool-get_menu": {
          // get_menu's id lives on the INPUT; its output may be {found:false}.
          if (part.input?.menuId) menuId = part.input.menuId;
          if (done) {
            const out = part.output as MenuBearingOutput;
            if (out.id) menuId = out.id;
          }
          break;
        }
      }
    }
  }

  return menuId;
}
