import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { platformRouter, tenantRouter } from "./routers/platform";
import { catalogRouter, customerRouter, vehicleRouter } from "./routers/catalog";
import { supabaseCatalogRouter } from "./routers/supabaseCatalog";
import { inventoryRouter } from "./routers/inventory";
import { supabaseInventoryRouter } from "./routers/supabaseInventory";
import { quoteRequestRouter, quoteRouter } from "./routers/quotes";
import { appointmentRouter, workOrderRouter } from "./routers/operations";
import { dashboardRouter, financialRouter, notificationRouter } from "./routers/management";
import { supabaseWorkspaceRouter } from "./routers/supabaseWorkspace";
import { supabaseCustomerRouter, supabaseVehicleRouter } from "./routers/supabaseCustomers";
import { supabaseDemoRouter } from "./routers/supabaseDemo";
import { supabasePublicIntakeRouter } from "./routers/supabasePublicIntake";
import { supabaseQuoteRequestRouter } from "./routers/supabaseQuoteRequests";
import { supabaseQuoteRouter } from "./routers/supabaseQuotes";
import { supabasePublicQuoteRouter } from "./routers/supabasePublicQuotes";
import { supabaseOperationsRouter } from "./routers/supabaseOperations";
import { supabaseFinanceRouter } from "./routers/supabaseFinance";
import { supabaseManagementRouter } from "./routers/supabaseManagement";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      if (opts.ctx.supabaseUser) {
        const { id, name, email, platformRole } = opts.ctx.supabaseUser;
        return { id, name, email, platformRole };
      }
      if (!opts.ctx.user) return null;
      const { id, name, email, platformRole } = opts.ctx.user;
      return { id, name, email, platformRole: platformRole ?? "platform_user" };
    }),
    logout: publicProcedure.mutation(() => ({ success: true } as const)),
  }),
  platform: platformRouter,
  tenant: tenantRouter,
  workspace: supabaseWorkspaceRouter,
  workspaceCustomers: supabaseCustomerRouter,
  workspaceVehicles: supabaseVehicleRouter,
  customers: customerRouter,
  vehicles: vehicleRouter,
  catalog: catalogRouter,
  workspaceCatalog: supabaseCatalogRouter,
  inventory: inventoryRouter,
  workspaceInventory: supabaseInventoryRouter,
  platformDemo: supabaseDemoRouter,
  publicIntake: supabasePublicIntakeRouter,
  publicQuotes: supabasePublicQuoteRouter,
  workspaceQuoteRequests: supabaseQuoteRequestRouter,
  workspaceQuotes: supabaseQuoteRouter,
  workspaceOperations: supabaseOperationsRouter,
  workspaceFinance: supabaseFinanceRouter,
  workspaceManagement: supabaseManagementRouter,
  quoteRequests: quoteRequestRouter,
  quotes: quoteRouter,
  appointments: appointmentRouter,
  workOrders: workOrderRouter,
  financial: financialRouter,
  dashboard: dashboardRouter,
  notifications: notificationRouter,
});

export type AppRouter = typeof appRouter;
