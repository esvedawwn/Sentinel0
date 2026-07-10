import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateScan,
  getListScansQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";

interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const createScan = useCreateScan({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListScansQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        navigate("/dashboard");
      },
    },
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setActiveIndex(0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const commands: Command[] = useMemo(
    () => [
      { id: "nav-dashboard", label: "Go to Home", group: "Navigate", run: () => navigate("/dashboard") },
      { id: "nav-analyse", label: "Go to Analyse", group: "Navigate", run: () => navigate("/analyse") },
      { id: "nav-organise", label: "Go to Organise", group: "Navigate", run: () => navigate("/organise") },
      { id: "nav-findings", label: "Go to Findings", group: "Navigate", run: () => navigate("/findings") },
      { id: "nav-search", label: "Open Search", group: "Navigate", run: () => navigate("/search") },
      { id: "nav-reports", label: "Go to Reports", group: "Navigate", run: () => navigate("/reports") },
      { id: "nav-scan-history", label: "Go to Scan History", group: "Navigate", run: () => navigate("/scan-history") },
      { id: "nav-action-queue", label: "Go to Action Queue", group: "Navigate", run: () => navigate("/action-queue") },
      { id: "nav-settings", label: "Go to Settings", group: "Navigate", run: () => navigate("/settings") },
      {
        id: "view-duplicates",
        label: "View Duplicate Files",
        hint: "Organise",
        group: "Actions",
        run: () => navigate("/organise"),
      },
      {
        id: "review-findings",
        label: "Review Pending Findings",
        hint: "Findings",
        group: "Actions",
        run: () => navigate("/findings"),
      },
      {
        id: "start-sample-scan",
        label: "Start Sample Scan",
        hint: "Uses included test fixtures — no confirmation required",
        group: "Actions",
        run: () => createScan.mutate({ data: { path: "sample-data", mode: "sample" } }),
      },
    ],
    [navigate, createScan]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function runActive() {
    const cmd = filtered[activeIndex];
    if (cmd) {
      cmd.run();
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-32"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-lg overflow-hidden"
        style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              runActive();
            }
          }}
          placeholder="Type a command or search…"
          className="w-full px-4 py-3 text-sm text-white outline-none"
          style={{ background: "transparent", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        />
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              No matching commands.
            </div>
          )}
          {filtered.map((cmd, idx) => (
            <div
              key={cmd.id}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => {
                cmd.run();
                setOpen(false);
              }}
              className="flex items-center justify-between px-4 py-2.5 cursor-pointer"
              style={{
                background: idx === activeIndex ? "rgba(52,211,153,0.1)" : "transparent",
                color: idx === activeIndex ? "#34D399" : "rgba(255,255,255,0.8)",
              }}
            >
              <span className="text-sm">{cmd.label}</span>
              <span
                className="text-xs font-mono"
                style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
              >
                {cmd.hint ?? cmd.group}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
