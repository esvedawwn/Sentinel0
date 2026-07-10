import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";

const NAV_ITEMS = [
  { key: "1", label: "Home", path: "/dashboard", shortcut: "⌘1" },
  { key: "2", label: "Analyse", path: "/analyse", shortcut: "⌘2" },
  { key: "3", label: "Organise", path: "/organise", shortcut: "⌘3" },
  { key: "4", label: "Findings", path: "/findings", shortcut: "⌘4" },
  { key: "5", label: "Reports", path: "/reports", shortcut: "⌘5" },
  { key: "6", label: "Scan History", path: "/scan-history", shortcut: "⌘6" },
];

const NAV_BOTTOM = [
  { key: "7", label: "Settings", path: "/settings", shortcut: "⌘7" },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { data: summary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 5000 },
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "1") { e.preventDefault(); navigate("/dashboard"); }
        if (e.key === "2") { e.preventDefault(); navigate("/analyse"); }
        if (e.key === "3") { e.preventDefault(); navigate("/organise"); }
        if (e.key === "4") { e.preventDefault(); navigate("/findings"); }
        if (e.key === "5") { e.preventDefault(); navigate("/reports"); }
        if (e.key === "6") { e.preventDefault(); navigate("/scan-history"); }
        if (e.key === "7") { e.preventDefault(); navigate("/settings"); }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate]);

  const systemStatus = summary?.systemStatus ?? "idle";

  function NavItem({ item }: { item: typeof NAV_ITEMS[number] }) {
    const isActive = location.startsWith(item.path);
    return (
      <Link href={item.path}>
        <div
          className="flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors duration-150 mx-2 rounded"
          style={{
            background: isActive ? "rgba(52, 211, 153, 0.1)" : "transparent",
            color: isActive ? "#34D399" : "rgba(255,255,255,0.7)",
          }}
          onMouseEnter={(e) => {
            if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
          }}
          onMouseLeave={(e) => {
            if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
        >
          <span className="text-sm font-medium">{item.label}</span>
          <span
            className="text-xs font-mono"
            style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
          >
            {item.shortcut}
          </span>
        </div>
      </Link>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#111111" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col w-[220px] shrink-0 h-full"
        style={{ background: "#1A1A1A", borderRight: "1px solid rgba(255,255,255,0.08)" }}
      >
        {/* Wordmark */}
        <div className="px-5 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <span
            className="text-lg font-bold tracking-tight"
            style={{ color: "#34D399", fontFamily: "var(--app-font-sans)" }}
          >
            Sentinel
          </span>
          <span
            className="ml-2 text-xs font-mono px-1.5 py-0.5 rounded"
            style={{
              color: "rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.06)",
              fontFamily: "var(--app-font-mono)",
              fontSize: "0.6rem",
            }}
          >
            v0.1-α
          </span>
        </div>

        {/* Primary navigation */}
        <nav className="flex-1 py-3">
          {NAV_ITEMS.map((item) => (
            <NavItem key={item.key} item={item} />
          ))}
        </nav>

        {/* Bottom: settings + status */}
        <div className="pb-2">
          <div
            className="mx-2 mb-1"
            style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "0.5rem" }}
          >
            {NAV_BOTTOM.map((item) => (
              <NavItem key={item.key} item={item} />
            ))}
          </div>
        </div>

        {/* System status */}
        <div
          className="px-5 py-4 border-t"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background:
                  systemStatus === "scanning"
                    ? "#60A5FA"
                    : systemStatus === "ready"
                    ? "#34D399"
                    : "rgba(255,255,255,0.3)",
                boxShadow:
                  systemStatus === "scanning"
                    ? "0 0 6px #60A5FA"
                    : systemStatus === "ready"
                    ? "0 0 6px #34D399"
                    : "none",
              }}
            />
            <span
              className="text-xs font-mono tracking-widest"
              style={{
                fontFamily: "var(--app-font-mono)",
                color:
                  systemStatus === "scanning"
                    ? "#60A5FA"
                    : systemStatus === "ready"
                    ? "#34D399"
                    : "rgba(255,255,255,0.3)",
              }}
            >
              {systemStatus === "scanning"
                ? "SCANNING"
                : systemStatus === "ready"
                ? "SYSTEM READY"
                : "IDLE"}
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto" style={{ background: "#111111" }}>
        {children}
      </main>
    </div>
  );
}
