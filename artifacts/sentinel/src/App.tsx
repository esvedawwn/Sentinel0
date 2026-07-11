import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import Layout from "@/components/Layout";

const Dashboard   = lazy(() => import("@/pages/Dashboard"));
const Analyse     = lazy(() => import("@/pages/Analyse"));
const Organise    = lazy(() => import("@/pages/Organise"));
const Reports     = lazy(() => import("@/pages/Reports"));
const Findings    = lazy(() => import("@/pages/Findings"));
const Search      = lazy(() => import("@/pages/Search"));
const ActionQueue = lazy(() => import("@/pages/ActionQueue"));
const ScanHistory = lazy(() => import("@/pages/ScanHistory"));
const Settings    = lazy(() => import("@/pages/Settings"));
const Projects    = lazy(() => import("@/pages/Projects"));
const NotFound    = lazy(() => import("@/pages/not-found"));

// When running inside Tauri the global __TAURI__ object is injected by the
// shell. In that case there is no shared proxy — we talk directly to the
// sidecar Express server on its fixed port.
const isDesktop =
  typeof window !== "undefined" && "__TAURI__" in window;

if (isDesktop) {
  setBaseUrl("http://localhost:38080");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
});

function PageFallback() {
  return (
    <div
      className="flex items-center justify-center w-full h-full min-h-[40vh]"
      aria-label="Loading page"
    >
      <div
        className="w-5 h-5 rounded-full border-2 animate-spin"
        style={{
          borderColor: "rgba(255,255,255,0.1)",
          borderTopColor: "#34D399",
        }}
      />
    </div>
  );
}

function Router() {
  return (
    <Layout>
      <Suspense fallback={<PageFallback />}>
        <Switch>
          <Route path="/">
            <Redirect to="/dashboard" />
          </Route>
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/analyse" component={Analyse} />
          <Route path="/organise" component={Organise} />
          <Route path="/findings" component={Findings} />
          <Route path="/search" component={Search} />
          <Route path="/action-queue" component={ActionQueue} />
          <Route path="/scan-history" component={ScanHistory} />
          <Route path="/reports" component={Reports} />
          <Route path="/settings" component={Settings} />
          <Route path="/projects" component={Projects} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </Layout>
  );
}

function App() {
  // In desktop mode the Tauri webview serves files from tauri://localhost with
  // no path prefix, so we strip BASE_URL down to "" to avoid double-prefixing.
  const base = isDesktop ? "" : import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={base}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
