import { useGetReportsOverview, useGetReportsScanHistory } from "@workspace/api-client-react";
import { formatBytes, formatNumber } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  type TooltipProps,
} from "recharts";

const CHART_COLORS = [
  "#34D399", "#FBBF24", "#60A5FA", "#C4B5FD", "#F87171",
  "#34D3aa", "#FBD124", "#60C5FA", "#A4B5FD", "#F8A171",
];

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="sentinel-card p-5">
      <span
        className="text-xs tracking-widest uppercase"
        style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
      >
        {label}
      </span>
      <div
        className="text-2xl font-bold font-mono mt-2"
        style={{ color: "#ffffff", fontFamily: "var(--app-font-mono)" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: TooltipProps<number, string>) => {
  if (active && payload && payload.length) {
    return (
      <div
        className="rounded px-3 py-2 text-xs font-mono"
        style={{
          background: "#1A1A1A",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#ffffff",
          fontFamily: "var(--app-font-mono)",
        }}
      >
        <div>{label}</div>
        <div style={{ color: "#34D399" }}>{payload[0].value} files</div>
      </div>
    );
  }
  return null;
};

export default function Reports() {
  const { data: overview, isLoading } = useGetReportsOverview();
  const { data: _scanHistory } = useGetReportsScanHistory({ days: 30 });

  const categoryData = (overview?.categoryBreakdown ?? []).map((c, i) => ({
    name: c.label,
    value: c.count,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white">Reports</h1>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Total Indexed"
          value={isLoading ? "—" : formatNumber(overview?.totalFilesIndexed ?? 0)}
        />
        <MetricCard
          label="Scans Run"
          value={isLoading ? "—" : formatNumber(overview?.totalScans ?? 0)}
        />
        <MetricCard
          label="Duplicates Resolved"
          value={isLoading ? "—" : formatNumber(overview?.duplicatesResolved ?? 0)}
        />
        <MetricCard
          label="Space Saved"
          value={isLoading ? "—" : formatBytes(overview?.spaceSavedBytes ?? 0)}
        />
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Category breakdown chart */}
        <div className="sentinel-card p-5">
          <h2
            className="text-xs tracking-widest uppercase mb-4"
            style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
          >
            By Category
          </h2>
          {categoryData.length === 0 ? (
            <div className="h-40 flex items-center justify-center">
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
                No data yet
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 0, right: 8 }}>
                <XAxis
                  type="number"
                  tick={{
                    fill: "rgba(255,255,255,0.3)",
                    fontSize: 10,
                    fontFamily: "var(--app-font-mono)",
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={80}
                  tick={{
                    fill: "rgba(255,255,255,0.5)",
                    fontSize: 10,
                  }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                <Bar dataKey="value" radius={2}>
                  {categoryData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* File type breakdown */}
        <div className="sentinel-card p-5">
          <h2
            className="text-xs tracking-widest uppercase mb-4"
            style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
          >
            By File Type
          </h2>
          <div className="space-y-0 overflow-y-auto" style={{ maxHeight: 220 }}>
            {(overview?.fileTypeBreakdown ?? []).slice(0, 15).map((ft) => (
              <div
                key={ft.extension}
                className="flex items-center gap-3 py-2"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
              >
                <span
                  className="text-xs font-mono w-12 shrink-0"
                  style={{ color: "rgba(255,255,255,0.5)", fontFamily: "var(--app-font-mono)" }}
                >
                  {ft.extension || "—"}
                </span>
                <span
                  className="text-xs font-mono flex-1"
                  style={{ color: "#ffffff", fontFamily: "var(--app-font-mono)" }}
                >
                  {formatNumber(ft.count)}
                </span>
                <span
                  className="text-xs font-mono"
                  style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
                >
                  {formatBytes(ft.sizeBytes)}
                </span>
              </div>
            ))}
            {(overview?.fileTypeBreakdown ?? []).length === 0 && (
              <p className="text-sm py-4" style={{ color: "rgba(255,255,255,0.3)" }}>
                No file type data yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Scan history */}
      <div className="sentinel-card p-5">
        <h2
          className="text-xs tracking-widest uppercase mb-4"
          style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
        >
          Scan History
        </h2>
        {(overview?.scanHistory ?? []).length === 0 ? (
          <p className="text-sm py-4" style={{ color: "rgba(255,255,255,0.3)" }}>
            No scans have been run yet.
          </p>
        ) : (
          <div className="space-y-0">
            {(overview?.scanHistory ?? []).map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-4 py-3"
                style={{ borderBottom: i < (overview?.scanHistory ?? []).length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}
              >
                <span
                  className="text-xs font-mono w-24 shrink-0"
                  style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
                >
                  {s.date}
                </span>
                <span
                  className="text-sm flex-1"
                  style={{ color: "rgba(255,255,255,0.7)" }}
                >
                  {formatNumber(s.filesScanned)} files
                </span>
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{
                    color: s.duplicatesFound > 0 ? "#FBBF24" : "#34D399",
                    background: s.duplicatesFound > 0 ? "rgba(251,191,36,0.1)" : "rgba(52,211,153,0.1)",
                    fontFamily: "var(--app-font-mono)",
                  }}
                >
                  {s.duplicatesFound} dupes
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
