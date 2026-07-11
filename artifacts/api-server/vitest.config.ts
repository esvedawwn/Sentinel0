import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "api-server",
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "src/**/*.test.ts"],
    /**
     * Fork-based pool is required because several test suites:
     *   - set process.env.SENTINEL_DB_PATH before module import
     *   - call vi.resetModules() to re-import fresh module graphs
     * Threads share the same process and would see stale module caches.
     */
    pool: "forks",
    poolOptions: {
      forks: {
        isolate: true,
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/__tests__/**",
        "src/**/*.test.ts",
        "src/index.ts",
        "src/app.ts",
      ],
      reporter: ["text", "lcov", "html"],
    },
  },
});
