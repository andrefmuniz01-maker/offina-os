import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { platformRouter, tenantRouter } from "./routers/platform";
import { catalogRouter, customerRouter, vehicleRouter } from "./routers/catalog";
import { inventoryRouter } from "./routers/inventory";
import { quoteRequestRouter, quoteRouter } from "./routers/quotes";
import { appointmentRouter, workOrderRouter } from "./routers/operations";
import { dashboardRouter, financialRouter, notificationRouter } from "./routers/management";
import { supabaseWorkspaceRouter } from "./routers/supabaseWorkspace";
import { supabaseCustomerRouter, supabaseVehicleRouter } from "./routers/supabaseCustomers";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.supabaseUser ?? opts.ctx.user),
    logout: publicProcedure.mutation(() => {
      return {
        success: true,
      } as const;
    }),
  }),
  platform: platformRouter,
  tenant: tenantRouter,
  workspace: supabaseWorkspaceRouter,
  workspaceCustomers: supabaseCustomerRouter,
  workspaceVehicles: supabaseVehicleRouter,
  customers: customerRouter,
  vehicles: vehicleRouter,
  catalog: catalogRouter,
  inventory: inventoryRouter,
  quoteRequests: quoteRequestRouter,
  quotes: quoteRouter,
  appointments: appointmentRouter,
  workOrders: workOrderRouter,
  financial: financialRouter,
  dashboard: dashboardRouter,
  notifications: notificationRouter,
});

export type AppRouter = typeof appRouter;
