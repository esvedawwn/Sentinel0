import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  useListScans,
  getListScansQueryKey,
  type Scan,
} from "@workspace/api-client-react";
import { formatBytes } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  pending: "rgba(255,255,255,0.4)",
  running: "#60A5FA",
  completed: "#34D399",
  cancelled: "rgba(255,255,255,0.3)",
  failed: "#F87171",
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#888";
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-mono capitalize"
      style={{
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
        fontFamily: "var(--app-font-mono)",
      }}
    >
      {status}
    </span>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(started: string, completed: string | null | undefined) {
  if (!completed) return "—";
  const ms = new Date(completed).getTime() - new Date(started).getTime();
  if (ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem}s`;
}

const PAGE_SIZE = 25;

export default function ScanHistory() {
  const [offset, setOffset] = useState(0);

  const params = { limit: PAGE_SIZE, offset };
  const { data, isLoading } = useListScans(params, {
    query: {
      queryKey: getListScansQueryKey(params),
      refetchInterval: 8000,
    },
  });

  const scans: Scan[] = data ?? [];
  const total = offset + scans.length + (scans.length === PAGE_SIZE ? 1 : 0);
  const hasMore = scans.length === PAGE_SIZE;

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white">Scan History</h1>
        <p
          className="text-xs font-mono mt-1"
          style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
        >
          {scans.length.toLocaleString()} SCAN{scans.length === 1 ? "" : "S"} SHOWN
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-16" style={{ color: "rgba(255,255,255,0.3)" }}>
          Loading scan history…
        </div>
      ) : scans.length === 0 ? (
        <div
          className="rounded-lg p-12 text-center"
          style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="text-4xl mb-4">🗂️</div>
          <div className="text-white font-medium mb-2">No scans yet</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.875rem" }}>
            Run a scan from the Dashboard to start building scan history.
          </div>
        </div>
      ) : (
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="grid text-xs font-mono px-4 py-2.5"
            style={{
              background: "#1A1A1A",
              color: "rgba(255,255,255,0.3)",
              fontFamily: "var(--app-font-mono)",
              gridTemplateColumns: "1fr 100px 90px 90px 100px 110px 130px 90px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span>PATH</span>
            <span>STATUS</span>
            <span className="text-right">FILES</span>
            <span className="text-right">SIZE</span>
            <span className="text-right">FINDINGS</span>
            <span className="text-right">STARTED</span>
            <span className="text-right">DURATION</span>
            <span className="text-right">REOPEN</span>
          </div>

          <div style={{ background: "#111111" }}>
            {scans.map((scan, idx) => (
              <motion.div
                key={scan.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                className="grid items-center px-4 py-3"
                style={{
                  gridTemplateColumns: "1fr 100px 90px 90px 100px 110px 130px 90px",
                  background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div className="min-w-0 pr-4">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: "#ffffff" }}
                  >
                    {scan.path.replace(/^\/home\/runner\/workspace\/sample-data\//, "sample-data/")}
                  </div>
                  <div
                    className="text-xs truncate mt-0.5"
                    style={{
                      color: "rgba(255,255,255,0.25)",
                      fontFamily: "var(--app-font-mono)",
                      fontSize: "0.7rem",
                    }}
                  >
                    Scan #{scan.id} · {scan.mode}
                  </div>
                </div>
                <StatusBadge status={scan.status} />
                <div className="text-right text-xs font-mono" style={{ color: "rgba(255,255,255,0.6)", fontFamily: "var(--app-font-mono)" }}>
                  {scan.filesScanned.toLocaleString()}
                </div>
                <div className="text-right text-xs font-mono" style={{ color: "rgba(255,255,255,0.6)", fontFamily: "var(--app-font-mono)" }}>
                  {formatBytes(scan.bytesScanned)}
                </div>
                <div className="text-right text-xs font-mono" style={{ color: "rgba(255,255,255,0.6)", fontFamily: "var(--app-font-mono)" }}>
                  {scan.findingsCount.toLocaleString()}
                </div>
                <div className="text-right text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}>
                  {formatDate(scan.startedAt)}
                </div>
                <div className="text-right text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}>
                  {formatDuration(scan.startedAt, scan.completedAt)}
                </div>
                <div className="text-right">
                  <Link href={`/findings?scanId=${scan.id}`}>
                    <span
                      className="text-xs px-2 py-1 rounded cursor-pointer"
                      style={{
                        background: "rgba(52,211,153,0.1)",
                        color: "#34D399",
                        fontFamily: "var(--app-font-mono)",
                      }}
                    >
                      Reopen
                    </span>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>

          <div
            className="flex items-center justify-between px-4 py-2 text-xs font-mono"
            style={{
              background: "#1A1A1A",
              color: "rgba(255,255,255,0.25)",
              fontFamily: "var(--app-font-mono)",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span>
              Showing {offset + 1}–{offset + scans.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0}
                style={{
                  color: offset === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)",
                  cursor: offset === 0 ? "not-allowed" : "pointer",
                }}
              >
                ← Prev
              </button>
              <button
                onClick={() => setOffset(offset + PAGE_SIZE)}
                disabled={!hasMore}
                style={{
                  color: !hasMore ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)",
                  cursor: !hasMore ? "not-allowed" : "pointer",
                }}
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
