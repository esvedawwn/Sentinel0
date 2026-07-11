import { useEffect, useState } from "react";
import { motion } from "framer-motion";
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
import type { SearchFilters, SavedSearch, SearchHistoryEntry, SemanticSearchResult } from "@workspace/api-client-react";
import { formatBytes } from "@/lib/utils";

const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

const EXAMPLE_QUERIES = [
  "documents related to a court matter",
  "renovation plumbing invoices",
  "brand files for a client",
  "correspondence about a particular company",
];

export default function Search() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [committedQuery, setCommittedQuery] = useState(searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<SearchFilters>({});
  const [saveName, setSaveName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [mode, setMode] = useState<"lexical" | "semantic">("lexical");
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
  }

  function applyFilters(next: SearchFilters) {
    setFilters(next);
  }

  const results = data?.findings ?? [];
  const semanticResults: SemanticSearchResult[] = semanticData?.results ?? [];
  const isSearching = mode === "lexical" ? isFetching : semanticFetching;

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

      {/* Example queries for semantic mode */}
      {mode === "semantic" && !committedQuery && (
        <div className="flex flex-wrap gap-2 mb-4">
          {EXAMPLE_QUERIES.map((q) => (
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

      <div className="flex gap-3 mb-4">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder={
            mode === "semantic"
              ? '"documents related to a court matter"'
              : '"large PDFs from last month" or "duplicate photos over 5MB"'
          }
          className="flex-1 px-4 py-3 rounded text-sm text-white outline-none"
          style={{
            background: "#1A1A1A",
            border: "1px solid rgba(255,255,255,0.12)",
          }}
        />
        <button
          onClick={runSearch}
          className="px-5 py-3 text-sm font-medium rounded"
          style={{ background: "rgba(52,211,153,0.12)", color: "#34D399", border: "1px solid rgba(52,211,153,0.3)" }}
        >
          Search
        </button>
      </div>

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
            Clear filters
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          {data?.explanation && (
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
                  : `${data?.total ?? 0} results`}
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
              {results.map((finding, idx) => (
                <motion.div
                  key={finding.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                  className="flex items-center justify-between px-4 py-3"
                  style={{
                    background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div className="min-w-0 pr-4">
                    <div className="text-sm font-medium truncate text-white">{finding.name}</div>
                    <div
                      className="text-xs truncate mt-0.5"
                      style={{ color: "rgba(255,255,255,0.25)", fontFamily: "var(--app-font-mono)", fontSize: "0.7rem" }}
                    >
                      {finding.path}
                    </div>
                  </div>
                  <div
                    className="text-xs font-mono shrink-0"
                    style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
                  >
                    {finding.sizeBytes > 0 ? formatBytes(finding.sizeBytes) : "—"}
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {mode === "lexical" && hasQuery && !isFetching && results.length === 0 && (
            <div className="text-center py-16 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
              No findings matched your search.
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
            <div className="text-center py-16 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
              {semanticData?.semanticAvailable === false
                ? "No embedding vectors found. Enable embeddings in Settings and rebuild the index."
                : "No semantic matches found."}
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
                  className="w-full text-left px-3 py-2 rounded text-xs truncate block"
                  style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
                >
                  {h.query || "(filters only)"}
                  <span className="ml-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {h.resultCount}
                  </span>
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
