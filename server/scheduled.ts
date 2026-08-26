import type { Request, Response } from "express";

/**
 * O handler legado dependia de uma sessão OAuth Manus para autenticar Heartbeat.
 * Ele permanece explicitamente pausado até receber uma autenticação de serviço
 * compatível com a arquitetura Supabase, sem reutilizar tokens de usuários.
 */
export async function runOperationalScan(_req: Request, res: Response) {
  return res.status(503).json({
    error: "scheduled-auth-migration-pending",
    message: "O processamento agendado está pausado durante a migração para Supabase Auth.",
  });
}
