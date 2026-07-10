import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Analyse from "@/pages/Analyse";
import Organise from "@/pages/Organise";
import Reports from "@/pages/Reports";
import Findings from "@/pages/Findings";
import ScanHistory from "@/pages/ScanHistory";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/not-found";

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

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/analyse" component={Analyse} />
        <Route path="/organise" component={Organise} />
        <Route path="/findings" component={Findings} />
        <Route path="/scan-history" component={ScanHistory} />
        <Route path="/reports" component={Reports} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
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
