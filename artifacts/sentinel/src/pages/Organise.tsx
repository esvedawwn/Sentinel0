import {
  useListDuplicates,
  useListFiles,
  useResolveDuplicate,
  getListDuplicatesQueryKey,
  getGetDashboardNeedsAttentionQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatBytes, statusColor, statusLabel } from "@/lib/utils";
import { motion } from "framer-motion";

export default function Organise() {
  const queryClient = useQueryClient();

  const { data: dupData, isLoading: dupsLoading } = useListDuplicates(
    { status: "pending", limit: 50 },
    { query: { queryKey: getListDuplicatesQueryKey({ status: "pending", limit: 50 }), refetchInterval: 10000 } }
  );

  const { data: corruptedData } = useListFiles(
    { status: "action_required", limit: 50 },
    {}
  );

  const { data: corruptedFiles } = useListFiles(
    { status: "corrupted", limit: 50 },
    {}
  );

  const resolve = useResolveDuplicate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDuplicatesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardNeedsAttentionQueryKey() });
      },
    },
  });

  const groups = dupData?.groups ?? [];
  const totalSaveable = dupData?.totalSaveable ?? 0;
  const allCorrupted = [...(corruptedData?.files ?? []), ...(corruptedFiles?.files ?? [])];

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Organise</h1>
          {totalSaveable > 0 && (
            <p
              className="text-xs font-mono mt-1"
              style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
            >
              {formatBytes(totalSaveable)} RECOVERABLE IF ALL DUPLICATES RESOLVED
            </p>
          )}
        </div>
      </div>

      {/* Duplicates section */}
      <div className="mb-8">
        <h2
          className="text-xs tracking-widest uppercase mb-4"
          style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
        >
          Duplicates · {groups.length} groups
        </h2>

        {dupsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 rounded animate-pulse" style={{ background: "#222222" }} />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div
            className="sentinel-card p-6 text-center"
          >
            <p
              className="text-xs font-mono"
              style={{ color: "#34D399", fontFamily: "var(--app-font-mono)" }}
            >
              ✓ NO DUPLICATES
            </p>
            <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
              All duplicate groups have been resolved.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group, i) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.2 }}
                className="sentinel-card p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <span
                    className="text-xs font-mono"
                    style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
                  >
                    GROUP #{group.id} · {formatBytes(group.totalSizeBytes)} TOTAL
                  </span>
                  <span
                    className="text-xs font-mono px-2 py-0.5 rounded"
                    style={{
                      background: "rgba(251, 191, 36, 0.12)",
                      color: "#FBBF24",
                      fontFamily: "var(--app-font-mono)",
                    }}
                  >
                    REVIEW
                  </span>
                </div>

                {/* Files side by side */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {group.files.slice(0, 2).map((file, fi) => (
                    <div
                      key={file.id}
                      className="p-3 rounded"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <div className="text-sm text-white truncate mb-1">{file.name}</div>
                      <div
                        className="text-xs font-mono truncate mb-1"
                        style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
                      >
                        {file.path}
                      </div>
                      <div
                        className="text-xs font-mono"
                        style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
                      >
                        {formatBytes(file.sizeBytes)}
                      </div>
                      <button
                        onClick={() =>
                          resolve.mutate({
                            id: group.id,
                            data: { action: "keep_one", keepFileId: file.id },
                          })
                        }
                        disabled={resolve.isPending}
                        className="mt-3 text-xs px-3 py-1.5 rounded w-full transition-colors duration-150"
                        style={{ background: "#34D399", color: "#111111", fontWeight: 600 }}
                      >
                        Keep {fi === 0 ? "Left" : "Right"}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Ignore */}
                <button
                  onClick={() =>
                    resolve.mutate({ id: group.id, data: { action: "ignore", keepFileId: null } })
                  }
                  disabled={resolve.isPending}
                  className="text-xs px-3 py-1.5 rounded transition-colors duration-150"
                  style={{
                    background: "transparent",
                    color: "rgba(255,255,255,0.3)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  Ignore
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Corrupted files */}
      {allCorrupted.length > 0 && (
        <div>
          <h2
            className="text-xs tracking-widest uppercase mb-4"
            style={{ color: "#F87171", fontFamily: "var(--app-font-mono)" }}
          >
            Action Required · {allCorrupted.length} files
          </h2>
          <div className="space-y-2">
            {allCorrupted.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-4 px-4 py-3 rounded"
                style={{
                  background: "#222222",
                  border: "1px solid rgba(248, 113, 113, 0.2)",
                }}
              >
                <span
                  className="text-xs font-mono shrink-0 px-2 py-0.5 rounded"
                  style={{
                    background: "rgba(248, 113, 113, 0.12)",
                    color: "#F87171",
                    fontFamily: "var(--app-font-mono)",
                  }}
                >
                  {statusLabel(file.status)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{file.name}</div>
                  <div
                    className="text-xs font-mono truncate"
                    style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
                  >
                    {file.path}
                  </div>
                </div>
                <span
                  className="text-xs font-mono shrink-0"
                  style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
                >
                  {formatBytes(file.sizeBytes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
