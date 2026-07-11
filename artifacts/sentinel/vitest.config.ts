import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    name: "sentinel",
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}", "src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test-setup.ts",
        "src/main.tsx",
        "src/**/__tests__/**",
        "src/**/*.test.{ts,tsx}",
      ],
      reporter: ["text", "lcov", "html"],
    },
  },
});
