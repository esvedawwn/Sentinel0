---
name: Vitest workspace jsdom & jest-dom setup
description: How to make React component tests with @testing-library work in vitest workspace mode with jsdom environment
---

## Problem
In vitest 4 workspace mode, per-project `environment: "jsdom"` is NOT automatically applied to test files and `setupFiles` that import `@testing-library/jest-dom` do not run reliably.

## Rules

### 1. Force jsdom per-file with the annotation
Add this docblock at the VERY TOP of every `.test.tsx` file that needs the DOM:
```tsx
/**
 * @vitest-environment jsdom
 */
```
Without this, the project-level `environment: "jsdom"` may be silently ignored for that file.

### 2. Extend jest-dom matchers explicitly
`import "@testing-library/jest-dom"` fails at module load time with "expect is not defined" because vitest's global `expect` isn't injected yet. Instead:
```tsx
import { expect } from "vitest";
import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
expect.extend(jestDomMatchers);
```
The `expect.extend(...)` call (a statement, not an import) runs after all imports are resolved and after vitest has injected globals, so it works.

### 3. Use explicit React import for JSX
In workspace mode, the per-project `esbuild.jsx = "automatic"` or `plugins: [react()]` may not apply correctly. Safest: add `import React from "react"` to every `.tsx` test file and the component under test so classic JSX mode works.

### 4. Install jsdom and testing-library at the workspace root
Even if they're already devDeps of the individual artifact package, the workspace-root vitest runner resolves modules from the root. Add to root `package.json devDependencies`:
- `jsdom`
- `@testing-library/jest-dom`
- `@testing-library/react`

### 5. resolve.alias (@/) does not propagate in workspace mode
Components tested from the workspace runner cannot use `@/` path alias (it only works inside the artifact's own vite/vitest context). Change imports in the component to relative paths.

**Why:** Vitest workspace mode runs each project's test files through the workspace-root runner, which does not inherit per-project `resolve.alias` for `@/`-prefixed imports in jsdom environments.

**How to apply:** Any time a new React component test file is added to `artifacts/sentinel/src/**/__tests__/`, apply rules 1–3. If it imports `@/...` paths, change those to relative imports in the component itself.
