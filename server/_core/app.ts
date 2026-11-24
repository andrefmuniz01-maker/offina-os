import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { runOperationalScan } from "../scheduled";

/**
 * Aplicação Express somente com a API (tRPC, proxy de storage e rotina
 * agendada). Não sobe servidor, não serve front-end e não depende do Vite:
 * é compartilhada entre o servidor tradicional (server/_core/index.ts) e a
 * função serverless da Vercel (server/_core/vercel.ts), para que as duas
 * formas de execução tenham exatamente o mesmo comportamento.
 */
export function createApiApp() {
  const app = express();
  // Limite maior para uploads de arquivos.
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  app.post("/api/scheduled/operational-scan", runOperationalScan);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  return app;
}
