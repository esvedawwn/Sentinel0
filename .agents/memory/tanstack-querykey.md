---
name: TanStack Query v5 queryKey requirement in Orval-generated hooks
description: Orval generates UseQueryOptions (not Partial), so the query option requires queryKey
---

**Rule:** Every `{ query: { ... } }` option passed to an Orval-generated hook must include `queryKey` explicitly.

**Why:** Orval generates `options?: { query?: UseQueryOptions<...> }`. In TanStack Query v5, `UseQueryOptions.queryKey` is required (not optional). The generated hook provides a fallback at runtime but TypeScript still errors.

**How to apply:**
```tsx
// Import the query key getter alongside the hook
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";

// Pass queryKey in the query option
const { data } = useGetDashboardSummary({
  query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 5000 },
});
```

Also: `keepPreviousData` is removed in TanStack v5 — use `placeholderData: (prev) => prev` instead, typed as the return type.
