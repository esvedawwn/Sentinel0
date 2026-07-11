// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  // ── globally ignored paths ─────────────────────────────────────────────────
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/target/**",
      "**/.local/**",
      "**/.cache/**",
      "**/src/generated/**",
      "sample-data/**",
      "coverage/**",
      "**/*.d.ts",
      // build scripts (esbuild MJS, orval config) are JS not TS — skip
      "**/*.mjs",
      "orval.config.ts",
      // design canvas / mockup sandbox is not production code
      "artifacts/mockup-sandbox/**",
    ],
  },

  // ── base JS rules ──────────────────────────────────────────────────────────
  eslint.configs.recommended,

  // ── TypeScript rules for all .ts / .tsx files ─────────────────────────────
  ...tseslint.configs.recommended,

  // ── React + hooks rules (sentinel + mockup-sandbox only) ──────────────────
  {
    files: [
      "artifacts/sentinel/**/*.{ts,tsx}",
      "artifacts/mockup-sandbox/**/*.{ts,tsx}",
    ],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // ── project-wide rule tuning ───────────────────────────────────────────────
  {
    rules: {
      // warn rather than error so existing patterns don't block CI on first pass
      "@typescript-eslint/no-explicit-any": "warn",
      // unused vars with _ prefix are intentional (express next, etc.)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // server code uses pino — console is a warning, not an error
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // allow empty catch blocks that are clearly intentional
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // ── relax console rule in test files ─────────────────────────────────────
  {
    files: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
    rules: {
      "no-console": "off",
    },
  },

  // ── relax console rule in dev scripts (seed, hello, etc.) ────────────────
  {
    files: ["scripts/src/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  }
);
