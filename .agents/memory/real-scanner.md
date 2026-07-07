---
name: Real scanner architecture
description: Where the real filesystem scanner lives and how it's wired to the API
---

Scanner lives in `artifacts/api-server/src/scanner/`:
- `types.ts` — shared interfaces and constants (SKIP_DIRS, thresholds)
- `fileWalker.ts` — async generator, walks FS non-blocking
- `findingsEngine.ts` — pure classification functions (no DB/IO — easily testable)
- `realScanner.ts` — orchestrator: DB writes, progress updates

**Scan modes** (POST /api/scans `{ path, mode }`):
- `"sample"` → always scans `/home/runner/workspace/sample-data/`, uses 1MB large-file threshold
- `"real"` → scans given path at 50MB threshold
- `"simulate"` → existing fake DB simulation, no real FS access

**Why separate modes:** In Replit/cloud, you can't access user's Mac folders. Sample mode gives a real working demo within the workspace.

**How to apply:** When adding scan features, check `isSample` flag passed to `runRealScan(scanId, path, isSample)`.
