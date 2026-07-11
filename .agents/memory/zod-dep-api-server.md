---
name: Zod direct dep in api-server
description: Why api-server needs zod as a direct dependency when routes use z inline
---

## Rule

If any route file in `artifacts/api-server/src/routes/` does `import { z } from "zod"` (inline schema, not using the generated schemas from `@workspace/api-zod`), then `zod` must be listed as a **direct dependency** in `artifacts/api-server/package.json`:

```json
"zod": "catalog:"
```

## Why

TypeScript resolves module imports from the declaring package's `node_modules`, not transitively. `@workspace/api-zod` depends on `zod`, but that does not make `zod` visible to `@workspace/api-server` for `import { z } from "zod"`. The error is `TS2307: Cannot find module 'zod'`.

## How to apply

When adding new route files that need inline Zod validation, either:
1. Add `zod` as a direct dep via `pnpm --filter @workspace/api-server add zod@catalog:`
2. OR import the already-generated Zod schemas from `@workspace/api-zod` instead of writing inline schemas

Option 2 is preferred for consistency with existing routes, but option 1 is fine for one-off validators.
