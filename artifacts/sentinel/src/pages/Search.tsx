import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useSearchParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSearch,
  useListSearchHistory,
  useClearSearchHistory,
  useListSavedSearches,
  useCreateSavedSearch,
  useDeleteSavedSearch,
  useSemanticSearch,
  getSearchQueryKey,
  getListSearchHistoryQueryKey,
  getListSavedSearchesQueryKey,
  getSemanticSearchQueryKey,
} from "@workspace/api-client-react";
import type {
  SearchFilters,
  SavedSearch,
  SearchHistoryEntry,
  SemanticSearchResult,
  AppliedFilter,
  ScoredFinding,
} from "@workspace/api-client-react";
import { formatBytes } from "@/lib/utils";

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

const LEXICAL_EXAMPLES = [
  "large duplicate videos",
  "legal PDFs from last month",
  "renovation invoices from 2024",
  "documents mentioning Kennards",
  "banking statements over 2 MB",
];

const SEMANTIC_EXAMPLES = [
  "documents related to a court matter",
  "renovation plumbing invoices",
  "brand files for a client",
  "correspondence about a particular company",
];

function RelevancePip({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 50 ? "#34D399" : pct >= 25 ? "#FBBF24" : "rgba(255,255,255,0.25)";
  return (
    <span
      title={`Relevance score: ${pct}%`}
      className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
      style={{
        color,
        background: "rgba(255,255,255,0.04)",
        border: `1px solid ${color}33`,
        fontFamily: "var(--app-font-mono)",
        minWidth: 38,
        textAlign: "center" as const,
      }}
    >
      {pct}%
    </span>
  );
}

function FilterChip({
  filter,
  onRemove,
}: {
  filter: AppliedFilter;
  onRemove?: () => void;
}) {
  const SOURCE_COLORS: Record<string, string> = {
    category: "#60A5FA",
    date: "#A78BFA",
    size: "#FBBF24",
    extension: "#34D399",
    status: "#F472B6",
    entity: "#FB923C",
  };
  const color = SOURCE_COLORS[filter.source] ?? "rgba(255,255,255,0.5)";
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded"
      style={{
        background: `${color}18`,
        border: `1px solid ${color}44`,
        color,
      }}
    >
      <span className="opacity-60 uppercase text-[0.6rem] tracking-wider font-mono">{filter.source}</span>
      <span>{filter.label}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 opacity-50 hover:opacity-100 leading-none"
          style={{ color }}
        >
          ×
        </button>
      )}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence <= 0) return null;
  const pct = Math.round(confidence * 100);
  const color = pct >= 70 ? "#34D399" : pct >= 40 ? "#FBBF24" : "#F87171";
  return (
    <span
      className="text-xs px-2 py-0.5 rounded"
      style={{ background: `${color}18`, color, border: `1px solid ${color}44` }}
      title={`NL interpretation confidence: ${pct}%`}
    >
      {pct}% confidence
    </span>
  );
}

export default function Search() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [committedQuery, setCommittedQuery] = useState(searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<SearchFilters>({});
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [mode, setMode] = useState<"lexical" | "semantic">("lexical");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setQuery(q);
      setCommittedQuery(q);
    }
  }, [searchParams]);

  const searchQueryParams = {
    q: committedQuery || undefined,
    path: filters.path ?? undefined,
    extension: filters.extension ?? undefined,
    category: filters.category ?? undefined,
    aiCategory: filters.aiCategory ?? undefined,
    riskLevel: filters.riskLevel ?? undefined,
    minSizeBytes: filters.minSizeBytes ?? undefined,
    maxSizeBytes: filters.maxSizeBytes ?? undefined,
    scanId: filters.scanId ?? undefined,
    duplicatesOnly: filters.duplicatesOnly ?? undefined,
    mentionedEntity: (filters as { mentionedEntity?: string }).mentionedEntity ?? undefined,
    limit: 100,
    recordHistory: true,
  };

  const hasQuery = !!committedQuery || Object.values(filters).some((v) => v != null && v !== "" && v !== false);

  const { data, isFetching } = useSearch(searchQueryParams, {
    query: {
      queryKey: getSearchQueryKey(searchQueryParams),
      enabled: hasQuery && mode === "lexical",
    },
  });

  const semanticParams = { q: committedQuery, limit: 20, hybrid: true };
  const { data: semanticData, isFetching: semanticFetching } = useSemanticSearch(semanticParams, {
    query: {
      queryKey: getSemanticSearchQueryKey(semanticParams),
      enabled: !!committedQuery && mode === "semantic",
    },
  });

  const { data: history } = useListSearchHistory(
    { limit: 10 },
    { query: { queryKey: getListSearchHistoryQueryKey({ limit: 10 }) } }
  );

  const clearHistory = useClearSearchHistory({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSearchHistoryQueryKey() }),
    },
  });

  const { data: saved } = useListSavedSearches({
    query: { queryKey: getListSavedSearchesQueryKey() },
  });

  const createSavedSearch = useCreateSavedSearch({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSavedSearchesQueryKey() });
        setShowSaveInput(false);
        setSaveName("");
      },
    },
  });

  const deleteSavedSearch = useDeleteSavedSearch({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSavedSearchesQueryKey() }),
    },
  });

  function runSearch() {
    setCommittedQuery(query);
    setExpandedRow(null);
  }

  function applyFilters(next: SearchFilters) {
    setFilters(next);
  }

  const results: ScoredFinding[] = (data?.findings as ScoredFinding[] | undefined) ?? [];
  const semanticResults: SemanticSearchResult[] = semanticData?.results ?? [];
  const isSearching = mode === "lexical" ? isFetching : semanticFetching;
  const appliedFilters: AppliedFilter[] = (data as { appliedFilters?: AppliedFilter[] } | undefined)?.appliedFilters ?? [];
  const confidence: number = (data as { confidence?: number } | undefined)?.confidence ?? 0;
  const unrecognizedTerms: string[] = (data as { unrecognizedTerms?: string[] } | undefined)?.unrecognizedTerms ?? [];
  const examples = mode === "semantic" ? SEMANTIC_EXAMPLES : LEXICAL_EXAMPLES;

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white">Search</h1>
        <p
          className="text-xs font-mono mt-1"
          style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
        >
          NATURAL LANGUAGE + FILTERS · ⌘K FOR COMMAND PALETTE
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1" style={{ background: "#1A1A1A", borderRadius: 8, padding: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
          {(["lexical", "semantic"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-3 py-1 text-xs font-medium rounded capitalize"
              style={{
                background: mode === m ? "#222222" : "transparent",
                color: mode === m ? "white" : "rgba(255,255,255,0.4)",
                border: mode === m ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
              }}
            >
              {m === "lexical" ? "Lexical + NL" : "Semantic (AI)"}
            </button>
          ))}
        </div>
        {mode === "semantic" && (
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            {semanticData?.semanticAvailable
              ? "Embedding index active"
              : "⚠ No embeddings yet — embed files via Settings"}
          </span>
        )}
      </div>

      {/* Example queries */}
      {!committedQuery && (
        <div className="flex flex-wrap gap-2 mb-4">
          {examples.map((q) => (
            <button
              key={q}
              onClick={() => { setQuery(q); setCommittedQuery(q); }}
              className="text-xs px-2.5 py-1.5 rounded"
              style={{ background: "#1A1A1A", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Search bar */}
      <div className="flex gap-3 mb-3">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder={
            mode === "semantic"
              ? '"documents related to a court matter"'
              : '"large PDFs from last month" or "duplicate photos over 5 MB"'
          }
          className="flex-1 px-4 py-3 rounded text-sm text-white outline-none"
          style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.12)" }}
        />
        <button
          onClick={runSearch}
          className="px-5 py-3 text-sm font-medium rounded"
          style={{ background: "rgba(52,211,153,0.12)", color: "#34D399", border: "1px solid rgba(52,211,153,0.3)" }}
        >
          Search
        </button>
      </div>

      {/* Applied filter chips + confidence */}
      <AnimatePresence>
        {appliedFilters.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap items-center gap-2 mb-3"
          >
            <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}>
              Interpreted:
            </span>
            {appliedFilters.map((f, i) => (
              <FilterChip key={i} filter={f} />
            ))}
            <ConfidenceBadge confidence={confidence} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unrecognised terms warning */}
      <AnimatePresence>
        {unrecognizedTerms.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-xs mb-3 px-3 py-2 rounded"
            style={{ background: "rgba(251,191,36,0.08)", color: "#FBBF24", border: "1px solid rgba(251,191,36,0.2)" }}
          >
            ⚠ Unrecognised terms ignored: {unrecognizedTerms.join(", ")}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Explicit filters */}
      <div className="sentinel-card p-4 mb-6">
        <div
          className="text-xs tracking-widest uppercase mb-3"
          style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
        >
          Filters
        </div>
        <div className="grid grid-cols-4 gap-3">
          <input
            placeholder="Path contains…"
            value={filters.path ?? ""}
            onChange={(e) => applyFilters({ ...filters, path: e.target.value || null })}
            className="px-2.5 py-1.5 text-xs rounded text-white outline-none"
            style={{ background: "#222222", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <input
            placeholder="Extension (.pdf)"
            value={filters.extension ?? ""}
            onChange={(e) => applyFilters({ ...filters, extension: e.target.value || null })}
            className="px-2.5 py-1.5 text-xs rounded text-white outline-none"
            style={{ background: "#222222", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <input
            placeholder="AI category"
            value={filters.aiCategory ?? ""}
            onChange={(e) => applyFilters({ ...filters, aiCategory: e.target.value || null })}
            className="px-2.5 py-1.5 text-xs rounded text-white outline-none"
            style={{ background: "#222222", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <select
            value={filters.riskLevel ?? ""}
            onChange={(e) => applyFilters({ ...filters, riskLevel: (e.target.value || undefined) as SearchFilters["riskLevel"] })}
            className="px-2.5 py-1.5 text-xs rounded text-white outline-none"
            style={{ background: "#222222", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <option value="">Any risk level</option>
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Min size (bytes)"
            value={filters.minSizeBytes ?? ""}
            onChange={(e) => applyFilters({ ...filters, minSizeBytes: e.target.value ? Number(e.target.value) : null })}
            className="px-2.5 py-1.5 text-xs rounded text-white outline-none"
            style={{ background: "#222222", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <input
            type="number"
            placeholder="Max size (bytes)"
            value={filters.maxSizeBytes ?? ""}
            onChange={(e) => applyFilters({ ...filters, maxSizeBytes: e.target.value ? Number(e.target.value) : null })}
            className="px-2.5 py-1.5 text-xs rounded text-white outline-none"
            style={{ background: "#222222", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <input
            placeholder="Entity / person / org…"
            value={(filters as { mentionedEntity?: string }).mentionedEntity ?? ""}
            onChange={(e) =>
              applyFilters({ ...filters, mentionedEntity: e.target.value || undefined } as SearchFilters)
            }
            className="px-2.5 py-1.5 text-xs rounded text-white outline-none"
            style={{ background: "#222222", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
              <input
                type="checkbox"
                checked={!!filters.duplicatesOnly}
                onChange={(e) => applyFilters({ ...filters, duplicatesOnly: e.target.checked })}
              />
              Duplicates only
            </label>
            <button
              onClick={() => setFilters({})}
              className="text-xs"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          {/* NL explanation banner */}
          {data?.explanation && mode === "lexical" && (
            <div
              className="text-xs mb-3 px-3 py-2 rounded"
              style={{ background: "rgba(96,165,250,0.08)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.2)" }}
            >
              {data.explanation}
            </div>
          )}

          {(hasQuery || (mode === "semantic" && !!committedQuery)) && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                {isSearching
                  ? "Searching…"
                  : mode === "semantic"
                  ? `${semanticResults.length} semantic results`
                  : `${data?.total ?? 0} result${data?.total !== 1 ? "s" : ""}`}
              </span>
              {!showSaveInput ? (
                <button
                  onClick={() => setShowSaveInput(true)}
                  className="text-xs"
                  style={{ color: "#34D399" }}
                >
                  Save this search
                </button>
              ) : (
                <div className="flex gap-2 items-center">
                  <input
                    autoFocus
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && saveName) {
                        createSavedSearch.mutate({ data: { name: saveName, query: committedQuery, filters } });
                      }
                    }}
                    placeholder="Name…"
                    className="px-2 py-1 text-xs rounded text-white outline-none"
                    style={{ background: "#222222", border: "1px solid rgba(255,255,255,0.1)" }}
                  />
                  <button
                    disabled={!saveName || createSavedSearch.isPending}
                    onClick={() =>
                      createSavedSearch.mutate({ data: { name: saveName, query: committedQuery, filters } })
                    }
                    className="text-xs"
                    style={{ color: "#34D399" }}
                  >
                    Save
                  </button>
                  <button onClick={() => setShowSaveInput(false)} className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                    ×
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Lexical results */}
          {mode === "lexical" && hasQuery && results.length > 0 && (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              {results.map((finding, idx) => {
                const scored = finding as ScoredFinding;
                const isExpanded = expandedRow === finding.id;
                return (
                  <motion.div
                    key={finding.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                    style={{
                      background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <button
                      onClick={() => setExpandedRow(isExpanded ? null : finding.id)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                    >
                      <div className="min-w-0 pr-4 flex-1">
                        <div className="text-sm font-medium truncate text-white">{finding.name}</div>
                        <div
                          className="text-xs truncate mt-0.5"
                          style={{ color: "rgba(255,255,255,0.25)", fontFamily: "var(--app-font-mono)", fontSize: "0.7rem" }}
                        >
                          {finding.path}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {finding.aiCategory && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded hidden sm:inline"
                            style={{ color: "#60A5FA", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)" }}
                          >
                            {finding.aiCategory}
                          </span>
                        )}
                        <span
                          className="text-xs font-mono shrink-0"
                          style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)", minWidth: 56, textAlign: "right" }}
                        >
                          {finding.sizeBytes > 0 ? formatBytes(finding.sizeBytes) : "—"}
                        </span>
                        {scored.relevanceScore !== undefined && (
                          <RelevancePip score={scored.relevanceScore} />
                        )}
                      </div>
                    </button>

                    {/* Expanded detail row */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="px-4 pb-3"
                          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
                        >
                          {scored.matchExplanation && (
                            <div
                              className="text-xs mt-2 px-2.5 py-2 rounded"
                              style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                            >
                              {scored.matchExplanation}
                            </div>
                          )}
                          {scored.matchedFactors?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {scored.matchedFactors.map((f, fi) => (
                                <span
                                  key={fi}
                                  className="text-xs px-1.5 py-0.5 rounded"
                                  style={{ color: "#34D399", background: "rgba(52,211,153,0.07)", border: "1px solid rgba(52,211,153,0.2)" }}
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-4 mt-2 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                            {finding.riskLevel && <span>Risk: <span style={{ color: finding.riskLevel === "high" || finding.riskLevel === "critical" ? "#F87171" : "rgba(255,255,255,0.5)" }}>{finding.riskLevel}</span></span>}
                            {finding.type && <span>Type: {finding.type}</span>}
                            {finding.extension && <span>.{finding.extension}</span>}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}

          {mode === "lexical" && hasQuery && !isFetching && results.length === 0 && (
            <div className="text-center py-16" style={{ color: "rgba(255,255,255,0.3)" }}>
              <div className="text-sm mb-2">No findings matched your search.</div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
                Try a broader query or different keywords.
              </div>
            </div>
          )}

          {/* Semantic results */}
          {mode === "semantic" && !!committedQuery && semanticResults.length > 0 && (
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              {semanticResults.map((hit, idx) => (
                <motion.div
                  key={hit.findingId}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                  className="px-4 py-3"
                  style={{
                    background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">Finding #{hit.findingId}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-xs font-mono px-1.5 py-0.5 rounded"
                        style={{
                          color: hit.combinedScore >= 0.5 ? "#34D399" : "rgba(255,255,255,0.4)",
                          background: hit.combinedScore >= 0.5 ? "rgba(52,211,153,0.1)" : "rgba(255,255,255,0.04)",
                          border: `1px solid ${hit.combinedScore >= 0.5 ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.1)"}`,
                          fontFamily: "var(--app-font-mono)",
                        }}
                      >
                        {Math.round(hit.combinedScore * 100)}%
                      </span>
                      {hit.model && (
                        <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)", fontFamily: "var(--app-font-mono)" }}>
                          {hit.model}
                        </span>
                      )}
                    </div>
                  </div>
                  {hit.matchedPassage && (
                    <div
                      className="text-xs mt-1.5 px-2 py-1.5 rounded italic"
                      style={{ color: "rgba(255,255,255,0.45)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      "{hit.matchedPassage.length > 120 ? hit.matchedPassage.slice(0, 120) + "…" : hit.matchedPassage}"
                    </div>
                  )}
                  <div className="flex gap-3 mt-1 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                    <span>semantic {Math.round(hit.semanticScore * 100)}%</span>
                    <span>lexical {Math.round(hit.lexicalScore * 100)}%</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {mode === "semantic" && !!committedQuery && !semanticFetching && semanticResults.length === 0 && (
            <div className="text-center py-16" style={{ color: "rgba(255,255,255,0.3)" }}>
              <div className="text-sm mb-2">
                {semanticData?.semanticAvailable === false
                  ? "No embedding vectors found."
                  : "No semantic matches found."}
              </div>
              {semanticData?.semanticAvailable === false && (
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>
                  Enable embeddings in Settings and rebuild the index.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-72 shrink-0 space-y-6">
          {/* Saved searches */}
          <div>
            <div
              className="text-xs tracking-widest uppercase mb-2"
              style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
            >
              Saved Searches
            </div>
            {(saved?.savedSearches ?? []).length === 0 && (
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>None yet.</div>
            )}
            <div className="space-y-1.5">
              {(saved?.savedSearches ?? []).map((s: SavedSearch) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between px-3 py-2 rounded text-xs"
                  style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <button
                    onClick={() => {
                      setQuery(s.query);
                      setCommittedQuery(s.query);
                      setFilters(s.filters);
                    }}
                    className="truncate text-left flex-1"
                    style={{ color: "#ffffff" }}
                  >
                    {s.name}
                  </button>
                  <button
                    onClick={() => deleteSavedSearch.mutate({ id: s.id })}
                    style={{ color: "rgba(255,255,255,0.3)" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* History */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div
                className="text-xs tracking-widest uppercase"
                style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
              >
                Recent
              </div>
              {(history?.history ?? []).length > 0 && (
                <button
                  onClick={() => clearHistory.mutate()}
                  className="text-xs"
                  style={{ color: "rgba(255,255,255,0.3)" }}
                >
                  Clear
                </button>
              )}
            </div>
            {(history?.history ?? []).length === 0 && (
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>No searches yet.</div>
            )}
            <div className="space-y-1.5">
              {(history?.history ?? []).map((h: SearchHistoryEntry) => (
                <button
                  key={h.id}
                  onClick={() => {
                    setQuery(h.query);
                    setCommittedQuery(h.query);
                    setFilters(h.filters);
                  }}
                  className="w-full text-left px-3 py-2 rounded text-xs block"
                  style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
                >
                  <div className="truncate">{h.query || "(filters only)"}</div>
                  <div className="mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {h.resultCount} result{h.resultCount !== 1 ? "s" : ""}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <Link href="/findings">
            <span className="text-xs cursor-pointer" style={{ color: "rgba(255,255,255,0.4)" }}>
              ← Back to Findings
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
