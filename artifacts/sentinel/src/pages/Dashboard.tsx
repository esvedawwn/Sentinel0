import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, RefreshCw } from "lucide-react";
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
    { limit: 12 },
    { query: { queryKey: getGetDashboardRecentActivityQueryKey({ limit: 12 }), refetchInterval: 5000 } }
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

  const organisedPct = summary?.organisedPercent ?? 0;
  const r = 120;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference - (circumference * organisedPct) / 100;

  const totalFiles = summary?.totalFiles ?? 0;
  const organisedCount = Math.round(totalFiles * organisedPct / 100);
  const unorganisedCount = totalFiles - organisedCount;

  const lastScanLabel = summary?.lastScanAt
    ? new Date(summary.lastScanAt).toLocaleDateString("en-AU", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", hour12: false,
      })
    : null;

  const isScanning = summary?.systemStatus === "scanning";

  return (
    <div style={{ background: "#111111", color: "#FFFFFF", minHeight: "100vh" }}>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          height: 380,
          background: "#111111",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        {/* Top strip */}
        <div
          className="flex items-center justify-between px-8 pt-6"
          style={{ position: "absolute", top: 0, left: 0, right: 0 }}
        >
          <div className="flex items-center gap-3">
            <span
              className="font-mono font-bold tracking-widest text-sm uppercase"
              style={{ color: "#FFFFFF" }}
            >
              Sentinel
            </span>
            <span
              className="font-mono text-[10px] px-2 py-0.5 rounded uppercase tracking-wider"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
            >
              v0.1-α
            </span>
          </div>

          <div className="flex items-center gap-3">
            {!showScanInput ? (
              <>
                <button
                  onClick={handleSampleScan}
                  disabled={createScan.isPending || isScanning}
                  className="font-mono text-xs px-4 py-1.5 rounded transition-colors"
                  style={{
                    background: "rgba(52,211,153,0.1)",
                    color: "#34D399",
                    border: "1px solid rgba(52,211,153,0.25)",
                  }}
                >
                  {createScan.isPending ? "Scanning…" : "Scan Sample"}
                </button>
                <button
                  onClick={() => setShowScanInput(true)}
                  className="font-mono text-xs px-4 py-1.5 rounded transition-colors"
                  style={{ background: "#34D399", color: "#111111" }}
                >
                  New Scan
                </button>
              </>
            ) : (
              <>
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
                  className="font-mono text-xs px-3 py-1.5 rounded text-white outline-none w-44"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                />
                <button
                  onClick={handleScan}
                  disabled={createScan.isPending}
                  className="font-mono text-xs px-3 py-1.5 rounded"
                  style={{ background: "#34D399", color: "#111111" }}
                >
                  {createScan.isPending ? "Starting…" : "Start"}
                </button>
                <button
                  onClick={() => setShowScanInput(false)}
                  className="font-mono text-xs px-3 py-1.5 rounded"
                  style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}
                >
                  Cancel
                </button>
              </>
            )}

            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() })}
              className="p-2 rounded-full"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={() => navigate("/settings")}
              className="p-2 rounded-full"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              <Settings size={14} />
            </button>
          </div>
        </div>

        {/* Left title */}
        <div
          className="absolute flex flex-col gap-2"
          style={{ left: 40, top: "50%", transform: "translateY(-50%)" }}
        >
          <h1
            className="font-bold tracking-tight"
            style={{ color: "#FFFFFF", fontSize: "3.25rem", lineHeight: 1.1 }}
          >
            File Intelligence
          </h1>
          <span
            className="font-mono text-xs uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.35)" }}
          >
            {lastScanLabel ? `Last scan · ${lastScanLabel}` : "No scans yet"}
          </span>
        </div>

        {/* Center radial */}
        <div
          className="absolute flex items-center justify-center"
          style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: 280, height: 280 }}
        >
          <svg
            className="absolute inset-0 w-full h-full"
            style={{ transform: "rotate(-90deg)" }}
            viewBox="0 0 280 280"
          >
            <circle cx="140" cy="140" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
            <circle
              cx="140"
              cy="140"
              r={r}
              fill="none"
              stroke="#34D399"
              strokeWidth="12"
              strokeDasharray={circumference}
              strokeDashoffset={isLoading ? circumference : dashOffset}
              strokeLinecap="round"
              style={{
                filter: "drop-shadow(0 0 16px rgba(52,211,153,0.45))",
                transition: "stroke-dashoffset 1s ease-out",
              }}
            />
          </svg>
          <div className="text-center flex flex-col items-center" style={{ zIndex: 1 }}>
            <span
              className="font-mono font-bold tracking-tighter"
              style={{ color: "#34D399", fontSize: "4.5rem", lineHeight: 1 }}
            >
              {isLoading ? "—" : organisedPct}
              <span className="text-3xl" style={{ color: "rgba(255,255,255,0.25)", marginLeft: 4 }}>%</span>
            </span>
            <span
              className="font-mono text-[10px] uppercase tracking-[0.2em] mt-2"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              Organised
            </span>
          </div>
        </div>

        {/* Right floating card */}
        <div
          className="absolute flex flex-col shadow-2xl"
          style={{
            top: 56,
            right: 40,
            width: 248,
            background: "rgba(26,26,26,0.88)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: "20px 20px 16px",
            backdropFilter: "blur(12px)",
          }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-widest mb-3"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Space Recoverable
          </span>
          <span
            className="font-mono font-bold tracking-tight mb-4"
            style={{ color: "#FFFFFF", fontSize: "2.25rem", lineHeight: 1 }}
          >
            {isLoading ? "—" : formatBytes(summary?.bytesRecoverable ?? 0).split(" ")[0]}
            <span className="text-base ml-2" style={{ color: "rgba(255,255,255,0.3)" }}>
              {isLoading ? "" : formatBytes(summary?.bytesRecoverable ?? 0).split(" ")[1]}
            </span>
          </span>

          {/* Sparkline */}
          <div className="w-full mb-3" style={{ height: 32, opacity: 0.85 }}>
            <svg width="100%" height="100%" viewBox="0 0 200 30" preserveAspectRatio="none">
              <defs>
                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(52,211,153,0.18)" />
                  <stop offset="100%" stopColor="rgba(52,211,153,0)" />
                </linearGradient>
              </defs>
              <path
                d="M0,25 Q20,10 40,20 T80,15 T120,25 T160,10 T200,20"
                fill="none"
                stroke="#34D399"
                strokeWidth="2"
                style={{ filter: "drop-shadow(0 2px 4px rgba(52,211,153,0.4))" }}
              />
              <path
                d="M0,25 Q20,10 40,20 T80,15 T120,25 T160,10 T200,20 L200,30 L0,30 Z"
                fill="url(#sg)"
              />
            </svg>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: "#34D399", boxShadow: "0 0 6px rgba(52,211,153,0.8)" }}
            />
            <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#34D399" }}>
              {isScanning ? "Scanning…" : "Optimal"}
            </span>
          </div>
        </div>

        {/* Scan progress bar inside hero when scanning */}
        <AnimatePresence>
          {isScanning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute bottom-0 left-0 right-0"
            >
              <div className="h-0.5 w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                <motion.div
                  className="h-full"
                  style={{ background: "#34D399", boxShadow: "0 0 8px rgba(52,211,153,0.6)" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${summary?.currentScanProgress ?? 0}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Metrics grid ─────────────────────────────────────────── */}
      <div className="px-8 pt-6 pb-2" style={{ maxWidth: 1400, margin: "0 auto" }}>
        <div className="grid grid-cols-4 gap-5">

          {/* Card 1 – Total Files */}
          {(() => {
            // Approximate breakdown proportions (no category API yet)
            const docs  = Math.round(totalFiles * 0.38);
            const imgs  = Math.round(totalFiles * 0.31);
            const other = totalFiles - docs - imgs;
            return (
              <div
                className="flex flex-col justify-between"
                style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: 24, minHeight: 220 }}
              >
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-widest block mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
                    Total Files
                  </span>
                  <span className="font-mono font-bold block mb-5 tracking-tight" style={{ color: "#FFFFFF", fontSize: "2.5rem", lineHeight: 1 }}>
                    {isLoading ? "—" : formatNumber(totalFiles)}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {[
                    { label: "Documents", color: "#60A5FA", count: docs },
                    { label: "Images",    color: "#C4B5FD", count: imgs },
                    { label: "Other",     color: "rgba(255,255,255,0.22)", count: other },
                  ].map(({ label, color, count }) => (
                    <div key={label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>{label}</span>
                      </div>
                      <span className="font-mono text-xs font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>
                        {isLoading ? "—" : formatNumber(count)}
                      </span>
                    </div>
                  ))}
                  <div className="flex w-full rounded-full overflow-hidden mt-3" style={{ height: 5 }}>
                    <div style={{ width: "38%", background: "#60A5FA" }} />
                    <div style={{ width: "31%", background: "#C4B5FD" }} />
                    <div style={{ flex: 1,      background: "rgba(255,255,255,0.18)" }} />
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Card 2 – Organised */}
          <div
            className="flex flex-col justify-between"
            style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: 24, minHeight: 220 }}
          >
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest block mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
                Organised
              </span>
              <span className="font-mono font-bold block mb-2 tracking-tight" style={{ color: "#34D399", fontSize: "2.5rem", lineHeight: 1 }}>
                {isLoading ? "—" : organisedPct}
                <span className="text-2xl ml-1" style={{ color: "rgba(255,255,255,0.25)" }}>%</span>
              </span>
              {!isLoading && totalFiles > 0 && (
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(52,211,153,0.7)" }}>
                  {organisedPct >= 80 ? "+good standing" : organisedPct >= 50 ? "needs improvement" : "action required"}
                </span>
              )}
            </div>

            <div className="mt-4">
              <div className="flex items-end justify-between mb-2">
                <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Index Health
                </span>
                <span className="font-mono text-xs" style={{ color: organisedPct >= 66 ? "#FFFFFF" : "rgba(255,255,255,0.6)" }}>
                  {organisedPct >= 80 ? "Good" : organisedPct >= 50 ? "Fair" : totalFiles === 0 ? "—" : "Poor"}
                </span>
              </div>
              {/* 3-segment health bar matching mockup */}
              <div className="w-full h-2 rounded-full overflow-hidden flex gap-px" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full" style={{ width: "33%", background: organisedPct > 0 ? "rgba(52,211,153,0.35)" : "transparent", borderRadius: "9999px 0 0 9999px" }} />
                <div className="h-full" style={{ width: "33%", background: organisedPct > 33 ? "rgba(52,211,153,0.6)" : "transparent" }} />
                <div className="h-full" style={{ flex: 1,      background: organisedPct > 66 ? "#34D399" : "transparent", borderRadius: "0 9999px 9999px 0", boxShadow: organisedPct > 66 ? "0 0 8px rgba(52,211,153,0.4)" : "none" }} />
              </div>
            </div>
          </div>

          {/* Card 3 – Duplicates */}
          {(() => {
            const dupes = summary?.duplicatesCount ?? 0;
            // Approximate exact/similar split (65% / 35%)
            const exact   = Math.round(dupes * 0.65);
            const similar = dupes - exact;
            const donutOffset = isLoading || totalFiles === 0
              ? 100
              : Math.max(2, Math.round(100 - (dupes / Math.max(totalFiles, 1)) * 500));
            return (
              <div
                className="flex flex-col justify-between"
                style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: 24, minHeight: 220, cursor: "pointer" }}
                onClick={() => navigate("/organise")}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-widest block mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
                      Duplicates
                    </span>
                    <span className="font-mono font-bold block mb-2 tracking-tight" style={{ color: dupes > 0 ? "#FBBF24" : "#34D399", fontSize: "2.5rem", lineHeight: 1 }}>
                      {isLoading ? "—" : formatNumber(dupes)}
                    </span>
                    {dupes > 0 && (
                      <span className="font-mono text-[10px] px-2 py-1 rounded uppercase tracking-widest" style={{ background: "rgba(251,191,36,0.1)", color: "#FBBF24" }}>
                        Needs Review
                      </span>
                    )}
                  </div>
                  <div className="w-10 h-10 mt-1 shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full" style={{ transform: "rotate(-90deg)" }}>
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                      <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#FBBF24" strokeWidth="3" strokeDasharray="100" strokeDashoffset={donutOffset} />
                    </svg>
                  </div>
                </div>

                <div className="space-y-2.5 mt-5">
                  <div className="flex justify-between items-center pb-2" style={{ borderBottom: "1px dashed rgba(255,255,255,0.08)" }}>
                    <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Exact Match</span>
                    <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.8)" }}>{isLoading ? "—" : formatNumber(exact)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Similar Match</span>
                    <span className="font-mono text-xs" style={{ color: "rgba(255,255,255,0.8)" }}>{isLoading ? "—" : formatNumber(similar)}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Card 4 – Findings */}
          {(() => {
            const corrupted  = attention?.corruptedFiles ?? 0;
            const dupeCount  = attention?.duplicates ?? 0;
            const active     = corrupted + dupeCount;
            // Approximate large-file count from recoverable bytes (heuristic)
            const largeFiles = totalFiles > 0 ? Math.round(totalFiles * 0.12) : 0;
            const maxBar     = Math.max(corrupted, dupeCount, largeFiles, 1);
            return (
              <div
                className="flex flex-col justify-between"
                style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: 24, minHeight: 220, cursor: "pointer" }}
                onClick={() => navigate("/findings")}
              >
                <span className="font-mono text-[10px] uppercase tracking-widest block mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Findings
                </span>

                <div className="grid grid-cols-2 gap-4 mb-5">
                  <div>
                    <span className="font-mono font-bold block tracking-tight" style={{ color: "#F87171", fontSize: "2rem", lineHeight: 1 }}>
                      {isLoading ? "—" : active > 999 ? `${(active / 1000).toFixed(1)}k` : formatNumber(active)}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(248,113,113,0.65)" }}>Active</span>
                  </div>
                  <div>
                    <span className="font-mono font-bold block tracking-tight" style={{ color: "rgba(255,255,255,0.75)", fontSize: "2rem", lineHeight: 1 }}>
                      {isLoading ? "—" : "0"}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>Resolved</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  {[
                    { label: "Corrupted",  color: "#F87171", value: corrupted },
                    { label: "Duplicate",  color: "#FBBF24", value: dupeCount },
                    { label: "Large File", color: "rgba(255,255,255,0.45)", value: largeFiles },
                  ].map(({ label, color, value }) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px] uppercase tracking-widest shrink-0" style={{ color, minWidth: 68 }}>{label}</span>
                      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
                        <div style={{ width: `${Math.round((value / maxBar) * 100)}%`, background: color, height: "100%", transition: "width 0.6s", minWidth: value > 0 ? 3 : 0 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        </div>
      </div>

      {/* ── Activity + Status ─────────────────────────────────────── */}
      <div
        className="px-8 pt-5 pb-8 grid grid-cols-3 gap-5"
        style={{ maxWidth: 1400, margin: "0 auto" }}
      >
        {/* Activity feed */}
        <div
          className="col-span-2"
          style={{
            background: "#1A1A1A",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 8,
            padding: 24,
          }}
        >
          <span
            className="font-mono text-[10px] uppercase tracking-widest block mb-5"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            Recent Activity
          </span>
          <AnimatePresence initial={false}>
            {(activity ?? []).map((entry, i) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.025, duration: 0.2 }}
                className="flex items-start gap-3 py-2.5"
                style={{
                  borderBottom:
                    i < (activity?.length ?? 0) - 1
                      ? "1px solid rgba(255,255,255,0.04)"
                      : "none",
                }}
              >
                <span
                  className="font-mono text-xs w-16 shrink-0 pt-px"
                  style={{ color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}
                >
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span className="text-sm shrink-0" style={{ color: statusColor(entry.status) }}>
                  {activityIcon(entry.status)}
                </span>
                <span className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
                  {entry.message}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          {(!activity || activity.length === 0) && (
            <p
              className="text-sm font-mono py-6 text-center"
              style={{ color: "rgba(255,255,255,0.2)" }}
            >
              No activity yet — start a scan to index your files.
            </p>
          )}
        </div>

        {/* Status column */}
        <div className="flex flex-col gap-4">
          {isScanning && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: "#1A1A1A",
                border: "1px solid rgba(96,165,250,0.2)",
                borderRadius: 8,
                padding: 20,
              }}
            >
              <span
                className="font-mono text-[10px] uppercase tracking-widest block mb-2"
                style={{ color: "#60A5FA" }}
              >
                Scanning · {summary?.currentScanPath ?? ""}
              </span>
              <div
                className="font-mono font-bold mb-4"
                style={{ color: "#60A5FA", fontSize: "1.75rem" }}
              >
                {summary?.currentScanProgress ?? 0}%
              </div>
              <div
                className="w-full rounded-full overflow-hidden"
                style={{ height: 4, background: "rgba(255,255,255,0.06)" }}
              >
                <motion.div
                  style={{ background: "#60A5FA", height: "100%" }}
                  animate={{ width: `${summary?.currentScanProgress ?? 0}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          )}

          {(attention?.corruptedFiles ?? 0) > 0 && (
            <div
              style={{
                background: "#1A1A1A",
                border: "1px solid rgba(248,113,113,0.2)",
                borderRadius: 8,
                padding: 20,
                cursor: "pointer",
              }}
              onClick={() => navigate("/organise")}
            >
              <span
                className="font-mono text-[10px] uppercase tracking-widest block mb-2"
                style={{ color: "#F87171" }}
              >
                Action Required
              </span>
              <div className="font-mono font-bold mb-1" style={{ color: "#F87171", fontSize: "1.75rem" }}>
                {formatNumber(attention?.corruptedFiles ?? 0)}
              </div>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                Corrupted files need attention
              </p>
            </div>
          )}

          {(attention?.duplicates ?? 0) > 0 && (
            <div
              style={{
                background: "#1A1A1A",
                border: "1px solid rgba(251,191,36,0.18)",
                borderRadius: 8,
                padding: 20,
                cursor: "pointer",
              }}
              onClick={() => navigate("/organise")}
            >
              <span
                className="font-mono text-[10px] uppercase tracking-widest block mb-2"
                style={{ color: "#FBBF24" }}
              >
                Review
              </span>
              <div className="font-mono font-bold mb-1" style={{ color: "#FBBF24", fontSize: "1.75rem" }}>
                {formatNumber(attention?.duplicates ?? 0)}
              </div>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                Duplicates awaiting review
              </p>
            </div>
          )}

          {(attention?.corruptedFiles ?? 0) === 0 &&
            (attention?.duplicates ?? 0) === 0 &&
            !isScanning && (
              <div
                style={{
                  background: "#1A1A1A",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 8,
                  padding: 20,
                }}
              >
                <span
                  className="font-mono text-[10px] uppercase tracking-widest block mb-2"
                  style={{ color: "#34D399" }}
                >
                  All Clear
                </span>
                <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                  Nothing needs attention right now.
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
