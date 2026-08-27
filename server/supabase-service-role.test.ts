import { describe, expect, it } from "vitest";

const projectUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const canValidateServiceRole = Boolean(projectUrl && serviceRoleKey);

describe("credencial administrativa Supabase", () => {
  const runWithConfiguredSecret = canValidateServiceRole ? it : it.skip;

  runWithConfiguredSecret(
    "autoriza apenas a leitura paginada mínima de usuários para operações administrativas",
    async () => {
      const response = await fetch(`${projectUrl}/auth/v1/admin/users?page=1&per_page=1`, {
        headers: {
          apikey: serviceRoleKey!,
          Authorization: `Bearer ${serviceRoleKey!}`,
        },
      });

      expect(response.status).toBe(200);
    },
    15_000,
  );
});
