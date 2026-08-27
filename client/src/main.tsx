import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { createApiErrorReporter } from "@/lib/apiErrorReporter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { installAnalytics } from "./lib/analytics";
import "./index.css";

installAnalytics({
  endpoint: import.meta.env.VITE_ANALYTICS_ENDPOINT,
  websiteId: import.meta.env.VITE_ANALYTICS_WEBSITE_ID,
}, document);

const queryClient = new QueryClient();

const reportApiError = createApiErrorReporter();

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    reportApiError("query", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    reportApiError("mutation", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token
          ? { Authorization: `Bearer ${data.session.access_token}` }
          : {};
      },
    }),
  ],
});

supabase.auth.onAuthStateChange(() => {
  void queryClient.invalidateQueries();
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
