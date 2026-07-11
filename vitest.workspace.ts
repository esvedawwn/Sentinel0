import { defineWorkspace } from "vitest/config";

/**
 * Unified Vitest workspace — runs all package test suites from the repo root.
 *
 *   pnpm test            → vitest run (all projects)
 *   pnpm test:watch      → vitest watch (all projects)
 *   pnpm test:coverage   → vitest run --coverage (all projects)
 *
 * Each entry points at a per-package vitest.config.ts that configures the
 * correct environment (node vs. jsdom), pool, and include patterns.
 *
 * Note: components that use the @/ path alias must use relative imports in
 * their source files so the workspace runner resolves them correctly
 * (vitest 4 does not propagate per-project resolve.alias through the
 * workspace module runner in jsdom environment).
 */
export default defineWorkspace([
  "artifacts/api-server/vitest.config.ts",
  "artifacts/sentinel/vitest.config.ts",
]);
