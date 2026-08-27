import { getApiErrorDisposition } from "./authErrorDisposition";

type ApiErrorScope = "query" | "mutation";
type ErrorLogger = Pick<Console, "warn">;

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createApiErrorReporter(logger: ErrorLogger = console) {
  const reported = new Set<string>();

  return (scope: ApiErrorScope, error: unknown) => {
    if (getApiErrorDisposition(error) === "auth-state") {
      logger.warn("[Auth State Error] A sessão será reavaliada pela consulta de identidade.");
      return;
    }

    const key = `${scope}:${messageFor(error)}`;
    if (reported.has(key)) return;
    reported.add(key);
    logger.warn(`[API ${scope === "query" ? "Query" : "Mutation"} Error]`, error);
  };
}
