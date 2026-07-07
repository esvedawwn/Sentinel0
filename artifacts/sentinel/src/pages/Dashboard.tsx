import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  useGetDashboardSummary,
  useGetDashboardRecentActivity,
  useGetDashboardNeedsAttention,
  useCreateScan,
  getGetDashboardSummaryQueryKey,
  getGetDashboardRecentActivityQueryKey,
  getGetDashboardNeedsAttentionQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatBytes, formatNumber, formatTimestamp, activityIcon, statusColor } from "@/lib/utils";

function MetricCard({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="sentinel-card p-5 flex flex-col gap-2">
      <span
        className="text-xs tracking-widest uppercase"
        style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
      >
        {label}
      </span>
      <span
        className="text-3xl font-bold font-mono tracking-tight"
        style={{ color: color ?? "#ffffff", fontFamily: "var(--app-font-mono)" }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [scanPath, setScanPath] = useState("");
  const [showScanInput, setShowScanInput] = useState(false);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data: summary, isLoading } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey(),
      refetchInterval: (q) =>
        q.state.data?.systemStatus === "scanning" ? 2000 : 10000,
    },
  });

  const { data: activity } = useGetDashboardRecentActivity(
    { limit: 15 },
    { query: { queryKey: getGetDashboardRecentActivityQueryKey({ limit: 15 }), refetchInterval: 5000 } }
  );

  const { data: attention } = useGetDashboardNeedsAttention({
    query: { queryKey: getGetDashboardNeedsAttentionQueryKey(), refetchInterval: 10000 },
  });

  const createScan = useCreateScan({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        setScanPath("");
        setShowScanInput(false);
      },
    },
  });

  const handleScan = () => {
    if (!scanPath.trim()) return;
    createScan.mutate({ data: { path: scanPath.trim(), mode: "simulate" } });
  };

  const handleSampleScan = () => {
    createScan.mutate(
      { data: { path: "sample-data", mode: "sample" } },
      { onSuccess: () => navigate("/findings") }
    );
  };

  const organisedColor =
    (summary?.organisedPercent ?? 0) >= 95 ? "#34D399" : "#FBBF24";

  const lastScanLabel = summary?.lastScanAt
    ? `Last scan ${formatTimestamp(summary.lastScanAt)}`
    : "No scans yet";

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          <p
            className="text-xs font-mono mt-1"
            style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
          >
            {summary?.lastScanAt
              ? `LAST SCAN · ${new Date(summary.lastScanAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}`
              : "NO SCANS YET"}
          </p>
        </div>
        <div className="flex gap-3">
          {!showScanInput ? (
            <div className="flex gap-2">
              <button
                onClick={handleSampleScan}
                disabled={createScan.isPending}
                className="px-4 py-2 text-sm font-medium rounded transition-colors duration-150"
                style={{
                  background: "rgba(52,211,153,0.12)",
                  color: "#34D399",
                  border: "1px solid rgba(52,211,153,0.3)",
                }}
              >
                {createScan.isPending ? "Scanning…" : "Scan Sample Data"}
              </button>
              <button
                onClick={() => setShowScanInput(true)}
                className="px-4 py-2 text-sm font-medium rounded transition-colors duration-150"
                style={{ background: "#34D399", color: "#111111" }}
              >
                Simulate Scan
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={scanPath}
                onChange={(e) => setScanPath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleScan();
                  if (e.key === "Escape") setShowScanInput(false);
                }}
                placeholder="/Users/Documents"
                className="px-3 py-2 text-sm rounded text-white outline-none w-56"
                style={{
                  background: "#222222",
                  border: "1px solid rgba(255,255,255,0.15)",
                  fontFamily: "var(--app-font-mono)",
                  fontSize: "0.8rem",
                }}
              />
              <button
                onClick={handleScan}
                disabled={createScan.isPending}
                className="px-4 py-2 text-sm font-medium rounded transition-colors duration-150"
                style={{ background: "#34D399", color: "#111111" }}
              >
                {createScan.isPending ? "Starting..." : "Start"}
              </button>
              <button
                onClick={() => setShowScanInput(false)}
                className="px-3 py-2 text-sm rounded"
                style={{ background: "#222222", color: "rgba(255,255,255,0.5)" }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Total Files"
          value={isLoading ? "—" : formatNumber(summary?.totalFiles ?? 0)}
        />
        <MetricCard
          label="Organised"
          value={isLoading ? "—" : `${summary?.organisedPercent ?? 0}%`}
          color={organisedColor}
        />
        <MetricCard
          label="Duplicates"
          value={isLoading ? "—" : formatNumber(summary?.duplicatesCount ?? 0)}
          color={summary?.duplicatesCount ? "#FBBF24" : "#34D399"}
          sub="awaiting review"
        />
        <MetricCard
          label="Recoverable"
          value={isLoading ? "—" : formatBytes(summary?.bytesRecoverable ?? 0)}
          color="#34D399"
          sub="from findings"
        />
      </div>

      {/* Scan Progress */}
      <AnimatePresence>
        {summary?.systemStatus === "scanning" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="sentinel-card p-5 mb-6"
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <span
                  className="text-xs tracking-widest uppercase font-mono"
                  style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
                >
                  Current Scan · {summary?.currentScanPath ?? ""}
                </span>
              </div>
              <span
                className="text-xs font-mono px-2 py-0.5 rounded"
                style={{
                  background: "rgba(96, 165, 250, 0.12)",
                  color: "#60A5FA",
                  fontFamily: "var(--app-font-mono)",
                }}
              >
                IN PROGRESS · {summary?.currentScanProgress ?? 0}%
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: "#60A5FA" }}
                initial={{ width: 0 }}
                animate={{ width: `${summary?.currentScanProgress ?? 0}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Two-column: Activity + Needs Attention */}
      <div className="grid grid-cols-3 gap-4">
        {/* Recent Activity */}
        <div className="col-span-2 sentinel-card p-5">
          <h2
            className="text-xs tracking-widest uppercase mb-4"
            style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
          >
            Recent Activity
          </h2>
          <div className="space-y-0">
            <AnimatePresence initial={false}>
              {(activity ?? []).map((entry, i) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                  className="flex items-start gap-3 py-2.5"
                  style={{ borderBottom: i < (activity?.length ?? 0) - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
                >
                  <span
                    className="font-mono text-xs w-16 shrink-0 pt-0.5"
                    style={{
                      color: "rgba(255,255,255,0.3)",
                      fontFamily: "var(--app-font-mono)",
                    }}
                  >
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <span
                    className="text-sm font-mono shrink-0"
                    style={{ color: statusColor(entry.status) }}
                  >
                    {activityIcon(entry.status)}
                  </span>
                  <span className="text-sm" style={{ color: "rgba(255,255,255,0.8)" }}>
                    {entry.message}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
            {(!activity || activity.length === 0) && (
              <p className="text-sm py-4" style={{ color: "rgba(255,255,255,0.3)" }}>
                No activity yet. Start a scan to index your files.
              </p>
            )}
          </div>
        </div>

        {/* Needs Attention */}
        <div className="flex flex-col gap-4">
          {(attention?.corruptedFiles ?? 0) > 0 && (
            <div
              className="sentinel-card p-5 cursor-pointer transition-colors duration-150"
              onClick={() => navigate("/organise")}
              style={{ borderColor: "rgba(248, 113, 113, 0.3)" }}
            >
              <div className="mb-2">
                <span
                  className="text-xs tracking-widest uppercase font-mono"
                  style={{ color: "#F87171", fontFamily: "var(--app-font-mono)" }}
                >
                  Action Required
                </span>
              </div>
              <div
                className="text-2xl font-bold font-mono mb-1"
                style={{ color: "#F87171", fontFamily: "var(--app-font-mono)" }}
              >
                {formatNumber(attention?.corruptedFiles ?? 0)}
              </div>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                Corrupted files need manual attention
              </p>
            </div>
          )}

          {(attention?.duplicates ?? 0) > 0 && (
            <div
              className="sentinel-card p-5 cursor-pointer transition-colors duration-150"
              onClick={() => navigate("/organise")}
              style={{ borderColor: "rgba(251, 191, 36, 0.25)" }}
            >
              <div className="mb-2">
                <span
                  className="text-xs tracking-widest uppercase font-mono"
                  style={{ color: "#FBBF24", fontFamily: "var(--app-font-mono)" }}
                >
                  Review
                </span>
              </div>
              <div
                className="text-2xl font-bold font-mono mb-1"
                style={{ color: "#FBBF24", fontFamily: "var(--app-font-mono)" }}
              >
                {formatNumber(attention?.duplicates ?? 0)}
              </div>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                Duplicates — review and merge
              </p>
            </div>
          )}

          {(attention?.corruptedFiles ?? 0) === 0 && (attention?.duplicates ?? 0) === 0 && (
            <div className="sentinel-card p-5">
              <span
                className="text-xs tracking-widest uppercase font-mono"
                style={{ color: "#34D399", fontFamily: "var(--app-font-mono)" }}
              >
                All Clear
              </span>
              <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
                Nothing needs attention right now.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
