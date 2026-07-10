import { useState } from "react";
import { motion } from "framer-motion";
import { useSearchParams, Link } from "wouter";
import {
  useListFindings,
  useGetFindingsSummary,
  useClearFindings,
  useGetScan,
  useReviewFinding,
  useBulkReviewFindings,
  useGetFindingAudit,
  getListFindingsQueryKey,
  getGetFindingsSummaryQueryKey,
  getGetFindingAuditQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatBytes } from "@/lib/utils";

type FindingTypeFilter =
  | "empty_folder"
  | "zero_byte"
  | "idlk_file"
  | "locked_file"
  | "installer"
  | "archive"
  | "large_file"
  | "duplicate";
type FindingStatusFilter = "safe_delete" | "review";
type TabKey = "all" | FindingTypeFilter | FindingStatusFilter;

const TYPE_LABELS: Record<string, string> = {
  empty_folder: "Empty Folder",
  zero_byte: "Zero-Byte",
  idlk_file: "Lock (.idlk)",
  locked_file: "Lock (.locked)",
  installer: "Installer",
  archive: "Archive",
  large_file: "Large File",
  duplicate: "Duplicate",
};

const TYPE_COLORS: Record<string, string> = {
  empty_folder: "#60A5FA",
  zero_byte: "#F87171",
  idlk_file: "#FBBF24",
  locked_file: "#FBBF24",
  installer: "#A78BFA",
  archive: "#C084FC",
  large_file: "#F97316",
  duplicate: "#EC4899",
};

const STATUS_COLORS: Record<string, string> = {
  safe_delete: "#F87171",
  review: "#FBBF24",
  duplicate: "#EC4899",
  ignored: "rgba(255,255,255,0.3)",
};

const REVIEW_STATUS_COLORS: Record<string, string> = {
  new: "rgba(255,255,255,0.35)",
  reviewed: "#60A5FA",
  accepted: "#34D399",
  rejected: "#F87171",
  ignored: "rgba(255,255,255,0.3)",
  quarantined: "#FBBF24",
};

const REVIEW_ACTIONS: { action: "mark_reviewed" | "accept_recommendation" | "reject_recommendation" | "ignore_once" | "ignore_permanently" | "create_rule"; label: string; color: string }[] = [
  { action: "mark_reviewed", label: "Mark Reviewed", color: "#60A5FA" },
  { action: "accept_recommendation", label: "Accept Recommendation", color: "#34D399" },
  { action: "reject_recommendation", label: "Reject Recommendation", color: "#F87171" },
  { action: "ignore_once", label: "Ignore Once", color: "rgba(255,255,255,0.5)" },
  { action: "ignore_permanently", label: "Ignore Permanently", color: "rgba(255,255,255,0.5)" },
  { action: "create_rule", label: "Create Rule", color: "#A78BFA" },
];

function ReviewStatusBadge({ status }: { status: string }) {
  const color = REVIEW_STATUS_COLORS[status] ?? "#888";
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-mono"
      style={{ background: `${color}22`, color, fontFamily: "var(--app-font-mono)" }}
    >
      {status}
    </span>
  );
}

const AI_CATEGORY_COLORS: Record<string, string> = {
  "Legal": "#60A5FA",
  "Banking": "#34D399",
  "Tax": "#10B981",
  "Receipts": "#4ADE80",
  "Invoices": "#2DD4BF",
  "Design": "#A78BFA",
  "Branding": "#C084FC",
  "Web Development": "#818CF8",
  "Photography": "#F472B6",
  "Video": "#FB7185",
  "Audio": "#FBBF24",
  "Renovation": "#F97316",
  "Property": "#FB923C",
  "Medical": "#F87171",
  "Personal Documents": "#FACC15",
  "Identity Documents": "#EAB308",
  "Business": "#38BDF8",
  "Software": "#6366F1",
  "Installers": "#8B5CF6",
  "Archives": "#9CA3AF",
  "Screenshots": "#22D3EE",
  "Temporary Files": "#6B7280",
  "Lock Files": "#EF4444",
  "Duplicate Candidates": "#EC4899",
  "Unknown": "#374151",
};

const AI_RECOMMENDATION_COLORS: Record<string, string> = {
  delete: "#F87171",
  review: "#FBBF24",
  archive: "#C084FC",
  keep: "#34D399",
  ignore: "rgba(255,255,255,0.3)",
};

function TypeBadge({ type }: { type: string }) {
  const label = TYPE_LABELS[type] ?? type;
  const color = TYPE_COLORS[type] ?? "#888";
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-mono"
      style={{
        background: `${color}22`,
        color,
        border: `1px solid ${color}44`,
        fontFamily: "var(--app-font-mono)",
      }}
    >
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#888";
  const label =
    status === "safe_delete" ? "Safe Delete"
    : status === "review" ? "Review"
    : status === "duplicate" ? "Duplicate"
    : status;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-mono"
      style={{
        background: `${color}22`,
        color,
        fontFamily: "var(--app-font-mono)",
      }}
    >
      {label}
    </span>
  );
}

function AICategoryDot({ category }: { category: string | null | undefined }) {
  if (!category) return <span style={{ color: "rgba(255,255,255,0.15)", fontSize: "0.7rem", fontFamily: "var(--app-font-mono)" }}>—</span>;
  const color = AI_CATEGORY_COLORS[category] ?? "#888";
  const short = category === "Temporary Files" ? "Temp"
    : category === "Personal Documents" ? "Personal"
    : category === "Identity Documents" ? "ID Docs"
    : category === "Duplicate Candidates" ? "Duplicates"
    : category === "Web Development" ? "Web Dev"
    : category;
  return (
    <span className="flex items-center gap-1.5" style={{ minWidth: 0 }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          boxShadow: `0 0 4px ${color}88`,
        }}
      />
      <span
        className="truncate text-xs"
        style={{ color: `${color}cc`, fontFamily: "var(--app-font-mono)", fontSize: "0.7rem" }}
      >
        {short}
      </span>
    </span>
  );
}

function ConfidenceBar({ confidence }: { confidence: number | null | undefined }) {
  if (confidence == null) return null;
  const color = confidence >= 85 ? "#34D399" : confidence >= 65 ? "#FBBF24" : "#F87171";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: "rgba(255,255,255,0.08)",
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${confidence}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ height: "100%", background: color, borderRadius: 2 }}
        />
      </div>
      <span
        style={{
          fontSize: "0.7rem",
          color,
          fontFamily: "var(--app-font-mono)",
          minWidth: 32,
          textAlign: "right",
        }}
      >
        {confidence}%
      </span>
    </div>
  );
}

const STATUS_FILTER_KEYS = new Set<string>(["safe_delete", "review"]);

const FILTER_TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "safe_delete", label: "Safe Delete" },
  { key: "review", label: "Review" },
  { key: "duplicate", label: "Duplicates" },
  { key: "large_file", label: "Large Files" },
  { key: "installer", label: "Installers" },
  { key: "archive", label: "Archives" },
  { key: "idlk_file", label: "Lock Files" },
  { key: "empty_folder", label: "Empty Folders" },
  { key: "zero_byte", label: "Zero-Byte" },
];

export default function Findings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const scanIdParam = searchParams.get("scanId");
  const scanId = scanIdParam ? Number(scanIdParam) : undefined;

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [showAudit, setShowAudit] = useState(false);
  const queryClient = useQueryClient();

  const { data: scopedScan } = useGetScan(scanId ?? 0, {
    query: { queryKey: ["scan", scanId], enabled: !!scanId },
  });

  function clearScanFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete("scanId");
    setSearchParams(next);
  }

  const isStatusFilter = STATUS_FILTER_KEYS.has(activeTab);
  const isDuplicateTab = activeTab === "duplicate";
  const typeParam: FindingTypeFilter | undefined =
    !isStatusFilter && !isDuplicateTab && activeTab !== "all"
      ? (activeTab as FindingTypeFilter)
      : undefined;
  const statusParam: "safe_delete" | "review" | "duplicate" | undefined =
    isStatusFilter
      ? (activeTab as "safe_delete" | "review")
      : isDuplicateTab
      ? "duplicate"
      : undefined;

  const findingsParams = {
    ...(scanId ? { scanId } : {}),
    ...(typeParam ? { type: typeParam } : {}),
    ...(statusParam ? { findingStatus: statusParam } : {}),
    ...(committedSearch ? { search: committedSearch } : {}),
    limit: 200,
  };

  const { data: findingsData, isLoading } = useListFindings(findingsParams, {
    query: {
      queryKey: getListFindingsQueryKey(findingsParams),
      refetchInterval: 8000,
    },
  });

  const { data: summary } = useGetFindingsSummary(
    {},
    { query: { queryKey: getGetFindingsSummaryQueryKey({}), refetchInterval: 10000 } }
  );

  const clearFindings = useClearFindings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFindingsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFindingsSummaryQueryKey() });
        setSelectedId(null);
      },
    },
  });

  function invalidateReview() {
    queryClient.invalidateQueries({ queryKey: getListFindingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetFindingsSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetFindingAuditQueryKey(selectedId ?? 0) });
  }

  const reviewFinding = useReviewFinding({
    mutation: { onSuccess: invalidateReview },
  });

  const bulkReviewFindings = useBulkReviewFindings({
    mutation: {
      onSuccess: () => {
        invalidateReview();
        setCheckedIds(new Set());
      },
    },
  });

  const { data: auditData } = useGetFindingAudit(selectedId ?? 0, {
    query: { queryKey: getGetFindingAuditQueryKey(selectedId ?? 0), enabled: !!selectedId && showAudit },
  });

  const findings = findingsData?.findings ?? [];
  const total = findingsData?.total ?? 0;
  const selectedFinding = findings.find((f) => f.id === selectedId) ?? null;

  function toggleChecked(id: number) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllChecked() {
    setCheckedIds((prev) =>
      prev.size === findings.length ? new Set() : new Set(findings.map((f) => f.id))
    );
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") setCommittedSearch(search);
    if (e.key === "Escape") { setSearch(""); setCommittedSearch(""); }
  }

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Findings</h1>
          <p
            className="text-xs font-mono mt-1"
            style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
          >
            REAL SCAN RESULTS · {(summary?.total ?? 0).toLocaleString()} TOTAL FINDINGS
          </p>
          {scanId && (
            <div className="flex items-center gap-2 mt-2">
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background: "rgba(52,211,153,0.1)",
                  color: "#34D399",
                  fontFamily: "var(--app-font-mono)",
                }}
              >
                Scan #{scanId}{scopedScan ? ` · ${scopedScan.path}` : ""}
              </span>
              <button
                onClick={clearScanFilter}
                className="text-xs"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                Clear scan filter ×
              </button>
              <Link href="/scan-history">
                <span className="text-xs cursor-pointer" style={{ color: "rgba(255,255,255,0.4)" }}>
                  ← Scan History
                </span>
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search files… (Enter)"
              className="px-3 py-1.5 text-xs rounded text-white outline-none w-52"
              style={{
                background: "#222222",
                border: "1px solid rgba(255,255,255,0.12)",
                fontFamily: "var(--app-font-mono)",
                color: "rgba(255,255,255,0.8)",
              }}
            />
            {committedSearch && (
              <button
                onClick={() => { setSearch(""); setCommittedSearch(""); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                ×
              </button>
            )}
          </div>
          <button
            onClick={() => clearFindings.mutate({})}
            disabled={clearFindings.isPending || (summary?.total ?? 0) === 0}
            className="px-4 py-2 text-sm font-medium rounded transition-colors duration-150"
            style={{
              background: "rgba(248,113,113,0.12)",
              color: (summary?.total ?? 0) === 0 ? "rgba(255,255,255,0.2)" : "#F87171",
              border: "1px solid rgba(248,113,113,0.25)",
              cursor: (summary?.total ?? 0) === 0 ? "not-allowed" : "pointer",
            }}
          >
            {clearFindings.isPending ? "Clearing…" : "Clear All"}
          </button>
        </div>
      </div>

      {/* Summary ribbon */}
      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total", value: summary.total, color: "#ffffff" },
            { label: "Safe Delete", value: summary.safeDelete, color: "#F87171" },
            { label: "Review", value: summary.review, color: "#FBBF24" },
            { label: "Duplicates", value: summary.duplicate, color: "#EC4899" },
          ].map(({ label, value, color }) => (
            <div key={label} className="sentinel-card p-4">
              <div
                className="text-xs tracking-widest uppercase mb-2"
                style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
              >
                {label}
              </div>
              <div
                className="text-2xl font-bold font-mono"
                style={{ color, fontFamily: "var(--app-font-mono)" }}
              >
                {value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && (summary?.total ?? 0) === 0 && !committedSearch && (
        <div
          className="rounded-lg p-12 text-center"
          style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="text-4xl mb-4">🔍</div>
          <div className="text-white font-medium mb-2">No findings yet</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.875rem" }}>
            Run a scan from the Dashboard to detect issues in your file system.
            <br />
            Click{" "}
            <strong style={{ color: "#34D399" }}>Scan Sample Data</strong> to try it
            with the included test fixtures.
          </div>
        </div>
      )}

      {((summary?.total ?? 0) > 0 || committedSearch) && (
        <div className="flex gap-6">
          {/* Left panel */}
          <div className="flex-1 min-w-0">
            {/* Filter tabs */}
            <div
              className="flex gap-1 mb-4 overflow-x-auto pb-1"
              style={{ scrollbarWidth: "none" }}
            >
              {FILTER_TABS.map((tab) => {
                const isActive = activeTab === tab.key;
                const tabCount =
                  tab.key === "all" ? summary?.total
                  : tab.key === "safe_delete" ? summary?.safeDelete
                  : tab.key === "review" ? summary?.review
                  : tab.key === "duplicate" ? summary?.duplicate
                  : summary?.byType?.[tab.key];

                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setSelectedId(null);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-xs whitespace-nowrap transition-colors duration-150 shrink-0"
                    style={{
                      background: isActive
                        ? "rgba(52,211,153,0.12)"
                        : "rgba(255,255,255,0.04)",
                      color: isActive ? "#34D399" : "rgba(255,255,255,0.5)",
                      border: `1px solid ${
                        isActive ? "rgba(52,211,153,0.3)" : "transparent"
                      }`,
                      fontFamily: "var(--app-font-mono)",
                    }}
                  >
                    {tab.label}
                    {tabCount != null && tabCount > 0 && (
                      <span
                        className="px-1.5 py-0.5 rounded-full text-xs"
                        style={{
                          background: isActive
                            ? "rgba(52,211,153,0.2)"
                            : "rgba(255,255,255,0.08)",
                          color: isActive
                            ? "#34D399"
                            : "rgba(255,255,255,0.4)",
                          fontFamily: "var(--app-font-mono)",
                          fontSize: "0.65rem",
                        }}
                      >
                        {tabCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Bulk action bar */}
            {checkedIds.size > 0 && (
              <div
                className="flex items-center gap-3 mb-3 px-4 py-2 rounded"
                style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}
              >
                <span className="text-xs font-mono" style={{ color: "#34D399", fontFamily: "var(--app-font-mono)" }}>
                  {checkedIds.size} selected
                </span>
                <div className="flex gap-1.5 ml-auto flex-wrap">
                  {REVIEW_ACTIONS.map((ra) => (
                    <button
                      key={ra.action}
                      disabled={bulkReviewFindings.isPending}
                      onClick={() =>
                        bulkReviewFindings.mutate({ data: { ids: Array.from(checkedIds), action: ra.action } })
                      }
                      className="px-2.5 py-1 text-xs rounded"
                      style={{
                        background: `${ra.color}18`,
                        color: ra.color,
                        border: `1px solid ${ra.color}44`,
                        fontFamily: "var(--app-font-mono)",
                      }}
                    >
                      {ra.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setCheckedIds(new Set())}
                  className="text-xs"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  Clear
                </button>
              </div>
            )}

            {/* Table */}
            {isLoading ? (
              <div
                className="text-center py-16"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                Loading findings…
              </div>
            ) : findings.length === 0 ? (
              <div
                className="text-center py-16"
                style={{ color: "rgba(255,255,255,0.3)", fontSize: "0.875rem" }}
              >
                {committedSearch ? `No findings matching "${committedSearch}"` : "No findings for this filter"}
              </div>
            ) : (
              <div
                className="rounded-lg overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div
                  className="grid text-xs font-mono px-4 py-2.5 items-center"
                  style={{
                    background: "#1A1A1A",
                    color: "rgba(255,255,255,0.3)",
                    fontFamily: "var(--app-font-mono)",
                    gridTemplateColumns: "24px 2fr 1fr 1fr 1fr 1fr 80px",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checkedIds.size > 0 && checkedIds.size === findings.length}
                    onChange={toggleAllChecked}
                  />
                  <span>NAME</span>
                  <span>TYPE</span>
                  <span>STATUS</span>
                  <span>REVIEW</span>
                  <span>AI CATEGORY</span>
                  <span className="text-right">SIZE</span>
                </div>

                <div style={{ background: "#111111" }}>
                  {findings.map((finding, idx) => {
                    const isSelected = selectedId === finding.id;
                    return (
                      <motion.div
                        key={finding.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                        className="grid items-center px-4 py-3 cursor-pointer transition-colors duration-100"
                        style={{
                          gridTemplateColumns: "24px 2fr 1fr 1fr 1fr 1fr 80px",
                          background: isSelected
                            ? "rgba(52,211,153,0.06)"
                            : idx % 2 === 0
                            ? "transparent"
                            : "rgba(255,255,255,0.015)",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          borderLeft: isSelected
                            ? "2px solid #34D399"
                            : "2px solid transparent",
                        }}
                        onClick={() =>
                          setSelectedId(isSelected ? null : finding.id)
                        }
                      >
                        <input
                          type="checkbox"
                          checked={checkedIds.has(finding.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleChecked(finding.id)}
                        />
                        <div className="min-w-0 pr-4">
                          <div
                            className="text-sm font-medium truncate"
                            style={{
                              color: isSelected ? "#34D399" : "#ffffff",
                            }}
                          >
                            {finding.name}
                          </div>
                          <div
                            className="text-xs truncate mt-0.5"
                            style={{
                              color: "rgba(255,255,255,0.25)",
                              fontFamily: "var(--app-font-mono)",
                              fontSize: "0.7rem",
                            }}
                          >
                            {finding.path.replace(
                              /^\/home\/runner\/workspace\/sample-data\//,
                              "sample-data/"
                            )}
                          </div>
                        </div>
                        <TypeBadge type={finding.type} />
                        <StatusBadge status={finding.findingStatus} />
                        <ReviewStatusBadge status={finding.reviewStatus ?? "new"} />
                        <AICategoryDot category={finding.aiCategory} />
                        <div
                          className="text-right text-xs font-mono"
                          style={{
                            color: "rgba(255,255,255,0.4)",
                            fontFamily: "var(--app-font-mono)",
                          }}
                        >
                          {finding.sizeBytes > 0
                            ? formatBytes(finding.sizeBytes)
                            : "—"}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                <div
                  className="px-4 py-2 text-xs font-mono"
                  style={{
                    background: "#1A1A1A",
                    color: "rgba(255,255,255,0.25)",
                    fontFamily: "var(--app-font-mono)",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  Showing {findings.length} of {total} findings
                  {committedSearch && (
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>
                      {" "}— filtered by "{committedSearch}"
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedFinding && (
            <motion.div
              key={selectedFinding.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
              className="w-80 shrink-0"
              style={{
                background: "#1A1A1A",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "0.5rem",
                padding: "1.25rem",
                height: "fit-content",
                position: "sticky",
                top: 0,
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-sm font-semibold text-white truncate pr-2">
                  {selectedFinding.name}
                </span>
                <button
                  onClick={() => setSelectedId(null)}
                  style={{
                    color: "rgba(255,255,255,0.3)",
                    fontSize: "1.1rem",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>

              <div className="space-y-3">
                {/* Finding basics */}
                <div>
                  <div className="detail-label">Finding Type</div>
                  <TypeBadge type={selectedFinding.type} />
                </div>

                <div>
                  <div className="detail-label">Status</div>
                  <StatusBadge status={selectedFinding.findingStatus} />
                </div>

                <div>
                  <div className="detail-label">Reason</div>
                  <p className="detail-value" style={{ lineHeight: 1.5 }}>
                    {selectedFinding.reason}
                  </p>
                </div>

                {/* AI Intelligence section */}
                {selectedFinding.aiCategory && (
                  <div
                    className="rounded-md p-3 space-y-3"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      marginTop: "0.75rem",
                    }}
                  >
                    {/* Section header */}
                    <div className="flex items-center gap-2">
                      <span style={{ color: "#34D399", fontSize: "0.7rem" }}>✦</span>
                      <span
                        className="text-xs font-mono tracking-widest uppercase"
                        style={{ color: "#34D399", fontFamily: "var(--app-font-mono)" }}
                      >
                        AI Intelligence
                      </span>
                      {selectedFinding.aiProvider && (
                        <span
                          className="ml-auto text-xs"
                          style={{
                            color: "rgba(255,255,255,0.2)",
                            fontFamily: "var(--app-font-mono)",
                            fontSize: "0.6rem",
                          }}
                        >
                          {selectedFinding.aiProvider}
                        </span>
                      )}
                    </div>

                    {/* Category */}
                    <div>
                      <div className="detail-label" style={{ marginBottom: 6 }}>Category</div>
                      {(() => {
                        const cat = selectedFinding.aiCategory!;
                        const color = AI_CATEGORY_COLORS[cat] ?? "#888";
                        return (
                          <span
                            className="inline-flex items-center gap-2 px-2.5 py-1 rounded text-xs font-mono"
                            style={{
                              background: `${color}18`,
                              color,
                              border: `1px solid ${color}44`,
                              fontFamily: "var(--app-font-mono)",
                            }}
                          >
                            <span
                              style={{
                                width: 6,
                                height: 6,
                                borderRadius: "50%",
                                background: color,
                                boxShadow: `0 0 4px ${color}88`,
                                flexShrink: 0,
                              }}
                            />
                            {cat}
                          </span>
                        );
                      })()}
                      {selectedFinding.aiSubcategory && (
                        <div
                          className="text-xs mt-1.5"
                          style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)", fontSize: "0.7rem" }}
                        >
                          {selectedFinding.aiSubcategory}
                        </div>
                      )}
                    </div>

                    {/* Confidence */}
                    {selectedFinding.aiConfidence != null && (
                      <div>
                        <div className="detail-label" style={{ marginBottom: 6 }}>Confidence</div>
                        <ConfidenceBar confidence={selectedFinding.aiConfidence} />
                      </div>
                    )}

                    {/* Explanation */}
                    {selectedFinding.aiExplanation && (
                      <div>
                        <div className="detail-label" style={{ marginBottom: 4 }}>Explanation</div>
                        <p
                          className="text-xs"
                          style={{
                            color: "rgba(255,255,255,0.55)",
                            lineHeight: 1.55,
                          }}
                        >
                          {selectedFinding.aiExplanation}
                        </p>
                      </div>
                    )}

                    {/* Tags */}
                    {selectedFinding.aiTags && selectedFinding.aiTags.length > 0 && (
                      <div>
                        <div className="detail-label" style={{ marginBottom: 6 }}>Tags</div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedFinding.aiTags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded text-xs"
                              style={{
                                background: "rgba(52,211,153,0.08)",
                                color: "rgba(52,211,153,0.7)",
                                border: "1px solid rgba(52,211,153,0.15)",
                                fontFamily: "var(--app-font-mono)",
                                fontSize: "0.65rem",
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggested destination / action */}
                    {(selectedFinding.aiSuggestedDestination || selectedFinding.aiSuggestedAction) && (
                      <div className="grid grid-cols-2 gap-3">
                        {selectedFinding.aiSuggestedDestination && (
                          <div>
                            <div className="detail-label" style={{ marginBottom: 4 }}>Suggested Destination</div>
                            <p
                              className="text-xs"
                              style={{ color: "rgba(255,255,255,0.55)", fontFamily: "var(--app-font-mono)", fontSize: "0.7rem" }}
                            >
                              {selectedFinding.aiSuggestedDestination}
                            </p>
                          </div>
                        )}
                        {selectedFinding.aiSuggestedAction && (
                          <div>
                            <div className="detail-label" style={{ marginBottom: 4 }}>Suggested Action</div>
                            <span
                              className="inline-block px-2 py-0.5 rounded text-xs font-mono"
                              style={{
                                background: `${AI_RECOMMENDATION_COLORS[selectedFinding.aiSuggestedAction] ?? "#888"}18`,
                                color: AI_RECOMMENDATION_COLORS[selectedFinding.aiSuggestedAction] ?? "#888",
                                border: `1px solid ${AI_RECOMMENDATION_COLORS[selectedFinding.aiSuggestedAction] ?? "#888"}44`,
                                fontFamily: "var(--app-font-mono)",
                              }}
                            >
                              {selectedFinding.aiSuggestedAction}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Notice: preview only, requires confirmation */}
                    <p
                      className="text-xs"
                      style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.65rem", lineHeight: 1.5 }}
                    >
                      AI suggestions are advisory only — no files are moved, deleted, or modified automatically. Any action requires your confirmation.
                    </p>
                  </div>
                )}

                {/* File metadata */}
                <div style={{ paddingTop: "0.25rem" }}>
                  <div className="detail-label">Full Path</div>
                  <p
                    className="text-xs break-all"
                    style={{
                      color: "rgba(255,255,255,0.5)",
                      fontFamily: "var(--app-font-mono)",
                      lineHeight: 1.5,
                    }}
                  >
                    {selectedFinding.path}
                  </p>
                </div>

                <div>
                  <div className="detail-label">Size</div>
                  <p
                    className="text-sm font-mono"
                    style={{ color: "#ffffff", fontFamily: "var(--app-font-mono)" }}
                  >
                    {selectedFinding.sizeBytes > 0
                      ? formatBytes(selectedFinding.sizeBytes)
                      : "0 B (empty)"}
                  </p>
                </div>

                {selectedFinding.hash && (
                  <div>
                    <div className="detail-label">MD5 Hash</div>
                    <p
                      className="text-xs break-all"
                      style={{
                        color: "rgba(255,255,255,0.4)",
                        fontFamily: "var(--app-font-mono)",
                      }}
                    >
                      {selectedFinding.hash}
                    </p>
                  </div>
                )}

                <div>
                  <div className="detail-label" style={{ marginBottom: 6 }}>Review Status</div>
                  <ReviewStatusBadge status={selectedFinding.reviewStatus ?? "new"} />
                </div>

                <div
                  className="pt-3 mt-3"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div
                    className="text-xs mb-2"
                    style={{
                      color: "rgba(255,255,255,0.25)",
                      fontFamily: "var(--app-font-mono)",
                    }}
                  >
                    REVIEW ACTIONS
                  </div>
                  <div className="space-y-2">
                    {REVIEW_ACTIONS.map((ra) => (
                      <button
                        key={ra.action}
                        disabled={reviewFinding.isPending}
                        onClick={() =>
                          reviewFinding.mutate({ id: selectedFinding.id, data: { action: ra.action } })
                        }
                        className="w-full px-3 py-1.5 text-xs rounded text-left"
                        style={{
                          background: `${ra.color}12`,
                          color: ra.color,
                          border: `1px solid ${ra.color}33`,
                          fontFamily: "var(--app-font-mono)",
                        }}
                      >
                        {ra.label}
                      </button>
                    ))}
                  </div>
                  <p
                    className="text-xs mt-2"
                    style={{ color: "rgba(255,255,255,0.25)", fontSize: "0.65rem", lineHeight: 1.5 }}
                  >
                    Accepting a recommendation only queues a proposed action for later confirmation — nothing is moved or deleted automatically.
                  </p>

                  <button
                    onClick={() => setShowAudit((v) => !v)}
                    className="text-xs mt-3"
                    style={{ color: "#60A5FA", fontFamily: "var(--app-font-mono)" }}
                  >
                    {showAudit ? "Hide audit log ▲" : "Show audit log ▼"}
                  </button>

                  {showAudit && (
                    <div className="mt-2 space-y-2 max-h-56 overflow-y-auto">
                      {(auditData?.entries ?? []).length === 0 && (
                        <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                          No audit entries yet.
                        </div>
                      )}
                      {(auditData?.entries ?? []).map((entry) => (
                        <div
                          key={entry.id}
                          className="text-xs rounded p-2"
                          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                        >
                          <div className="flex justify-between" style={{ fontFamily: "var(--app-font-mono)" }}>
                            <span style={{ color: "#60A5FA" }}>{entry.action}</span>
                            <span style={{ color: "rgba(255,255,255,0.3)" }}>
                              {new Date(entry.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ color: "rgba(255,255,255,0.5)" }}>
                            {entry.previousReviewStatus} → {entry.newReviewStatus}
                          </div>
                          {entry.note && (
                            <div style={{ color: "rgba(255,255,255,0.4)" }}>{entry.note}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  className="pt-3 mt-3"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div
                    className="text-xs mb-2"
                    style={{
                      color: "rgba(255,255,255,0.25)",
                      fontFamily: "var(--app-font-mono)",
                    }}
                  >
                    FILE ACTIONS (v0.3)
                  </div>
                  <div className="space-y-2">
                    <button
                      disabled
                      className="w-full px-3 py-1.5 text-xs rounded text-left"
                      style={{
                        background: "rgba(248,113,113,0.06)",
                        color: "rgba(248,113,113,0.3)",
                        border: "1px solid rgba(248,113,113,0.1)",
                        cursor: "not-allowed",
                        fontFamily: "var(--app-font-mono)",
                      }}
                    >
                      Move to Trash
                    </button>
                    <button
                      disabled
                      className="w-full px-3 py-1.5 text-xs rounded text-left"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        color: "rgba(255,255,255,0.2)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        cursor: "not-allowed",
                        fontFamily: "var(--app-font-mono)",
                      }}
                    >
                      Mark as Kept
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
