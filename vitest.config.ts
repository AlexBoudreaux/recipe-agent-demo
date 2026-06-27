import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Test runner config for the pure-logic deep modules in src/lib.
 * Node environment is enough; these modules do no DOM work.
 * The "@/..." alias mirrors tsconfig so imports match app code.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
