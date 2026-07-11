---
name: Orval duplicate-export fix
description: Why api-zod/src/index.ts must only re-export from generated/api, not generated/types
---

## Rule

`lib/api-zod/src/index.ts` must contain only:

```ts
export * from "./generated/api";
```

Do NOT add `export * from "./generated/types"` or `export type * from "./generated/types"`.

## Why

When Orval generates in `split` mode with `schemas: { path: "generated/types" }`, it writes:
- `generated/api.ts` — Zod schema consts (e.g. `export const AddFileToProjectBody = zod.object(...)`)
- `generated/types/<schema>.ts` — TypeScript type aliases (e.g. `export type AddFileToProjectBody = { ... }`)

Both end up exporting the **same name**. Wildcard re-exporting both from the barrel causes TS2308 ("has already exported a member named"). Even `export type *` does not resolve it.

Routes only need Zod schemas from `api.ts`. TypeScript types are inferred from those via `z.infer<>`.

## How to apply

After every `pnpm --filter @workspace/api-spec run codegen` run, check that `lib/api-zod/src/index.ts` still only has the single line above. Orval does NOT overwrite `index.ts` (it only writes into `generated/`), but a stale cached version might. Always verify before running `typecheck:libs`.
