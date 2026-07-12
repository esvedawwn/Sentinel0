import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListScans,
  useCancelScan,
  getListScansQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import { formatBytes, formatNumber } from "@/lib/utils";

interface ScanProgressBannerProps {
  /** Whether a scan is currently running (from DashboardSummary.systemStatus). */
  isScanning: boolean;
}

/**
 * Shows a progress bar + cancel button while a scan is in progress.
 * Polls /scans to get live stats and the scan ID needed for cancellation.
 * Renders nothing when no scan is active.
 */
export function ScanProgressBanner({ isScanning }: ScanProgressBannerProps) {
  const queryClient = useQueryClient();

  const { data: scans } = useListScans(
    { limit: 1 },
    {
      query: {
        queryKey: getListScansQueryKey({ limit: 1 }),
        enabled: isScanning,
        refetchInterval: isScanning ? 1500 : false,
      },
    }
  );

  const activeScan = isScanning ? scans?.[0] : undefined;

  const cancelScan = useCancelScan({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetDashboardSummaryQueryKey(),
        });
      },
    },
  });

  if (!isScanning || !activeScan) return null;

  const progress = activeScan.progressPercent ?? 0;
  const rawPath = activeScan.path ?? "";
  const displayPath =
    rawPath.length > 52 ? "…" + rawPath.slice(-(52)) : rawPath;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      className="mx-6 mb-4 rounded-lg px-5 py-3"
      style={{
        background: "#1A1A1A",
        border: "1px solid rgba(52,211,153,0.25)",
      }}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left: progress info */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "#34D399", boxShadow: "0 0 6px #34D399" }}
            />
            <span
              className="text-xs font-mono font-medium"
              style={{ color: "#34D399", fontFamily: "var(--app-font-mono)" }}
            >
              SCANNING
            </span>
            <span
              className="text-xs font-mono truncate"
              style={{ color: "rgba(255,255,255,0.35)", fontFamily: "var(--app-font-mono)" }}
              title={rawPath}
            >
              {displayPath}
            </span>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3 mb-1.5">
            <div
              className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: "rgba(255,255,255,0.08)" }}
            >
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{ width: `${progress}%`, background: "#34D399" }}
              />
            </div>
            <span
              className="text-xs font-mono tabular-nums shrink-0"
              style={{
                color: "rgba(255,255,255,0.5)",
                fontFamily: "var(--app-font-mono)",
                minWidth: "3rem",
                textAlign: "right",
              }}
            >
              {progress}%
            </span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4">
            <span
              className="text-xs font-mono"
              style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
            >
              {formatNumber(activeScan.filesScanned)} files
            </span>
            <span
              className="text-xs font-mono"
              style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
            >
              {formatBytes(activeScan.bytesScanned)}
            </span>
            {(activeScan.findingsCount ?? 0) > 0 && (
              <span
                className="text-xs font-mono"
                style={{ color: "rgba(245,158,11,0.7)", fontFamily: "var(--app-font-mono)" }}
              >
                {formatNumber(activeScan.findingsCount ?? 0)} findings
              </span>
            )}
            {(activeScan.duplicatesFound ?? 0) > 0 && (
              <span
                className="text-xs font-mono"
                style={{ color: "rgba(99,102,241,0.7)", fontFamily: "var(--app-font-mono)" }}
              >
                {formatNumber(activeScan.duplicatesFound ?? 0)} duplicates
              </span>
            )}
          </div>
        </div>

        {/* Right: cancel */}
        <button
          onClick={() => cancelScan.mutate({ id: activeScan.id })}
          disabled={cancelScan.isPending}
          className="shrink-0 text-xs font-mono px-3 py-1.5 rounded transition-colors duration-150"
          style={{
            background: "rgba(248,113,113,0.08)",
            color: "#F87171",
            border: "1px solid rgba(248,113,113,0.2)",
            fontFamily: "var(--app-font-mono)",
            cursor: cancelScan.isPending ? "not-allowed" : "pointer",
            opacity: cancelScan.isPending ? 0.6 : 1,
          }}
        >
          {cancelScan.isPending ? "Stopping…" : "Cancel Scan"}
        </button>
      </div>
    </motion.div>
  );
}
