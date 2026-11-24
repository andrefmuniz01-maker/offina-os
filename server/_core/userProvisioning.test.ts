import { describe, expect, it, vi } from "vitest";
import { ensureUserWithTemporaryPassword, generateTemporaryPassword } from "./userProvisioning";

describe("generateTemporaryPassword", () => {
  it("atende a regra de senha do sistema e evita caracteres ambíguos", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(16);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/);
      expect(password).not.toMatch(/[0OlI1]/);
    }
  });

  it("gera senhas diferentes a cada chamada", () => {
    expect(new Set(Array.from({ length: 50 }, () => generateTemporaryPassword())).size).toBe(50);
  });
});

describe("ensureUserWithTemporaryPassword", () => {
  function fakeService(existingId: string | null) {
    const createUser = vi.fn(async () => ({ data: { user: { id: "novo-id" } }, error: null }));
    const service = {
      from: () => ({ select: () => ({ ilike: () => ({ maybeSingle: async () => ({ data: existingId ? { id: existingId } : null, error: null }) }) }) }),
      auth: { admin: { createUser } },
    };
    return { service: service as never, createUser };
  }

  it("não cria conta nem senha quando o e-mail já existe", async () => {
    const { service, createUser } = fakeService("id-existente");
    const result = await ensureUserWithTemporaryPassword(service, "Pessoa@Exemplo.com");
    expect(result).toEqual({ userId: "id-existente", created: false, temporaryPassword: null });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("cria conta confirmada com senha temporária quando o e-mail é novo", async () => {
    const { service, createUser } = fakeService(null);
    const result = await ensureUserWithTemporaryPassword(service, "  Nova@Exemplo.com ", "Nova Pessoa");
    expect(result.created).toBe(true);
    expect(result.userId).toBe("novo-id");
    expect(result.temporaryPassword).toHaveLength(16);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "nova@exemplo.com", email_confirm: true, user_metadata: { full_name: "Nova Pessoa" } }));
  });
});
