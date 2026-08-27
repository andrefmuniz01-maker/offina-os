import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthRequestTimeoutError, getAuthConnectionTimeoutMessage, withAuthTimeout } from "./authTimeout";

describe("limite de tempo da autenticação", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("preserva o resultado quando a operação responde dentro do prazo", async () => {
    await expect(withAuthTimeout(() => Promise.resolve("sessão"), 50)).resolves.toBe("sessão");
  });

  it("rejeita uma operação pendente para que a interface possa sair do carregamento", async () => {
    vi.useFakeTimers();
    const pending = withAuthTimeout(() => new Promise<never>(() => undefined), 50);
    const expectation = expect(pending).rejects.toBeInstanceOf(AuthRequestTimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await expectation;
  });

  it("mantém a orientação de timeout neutra e acionável", () => {
    expect(getAuthConnectionTimeoutMessage()).toBe("A conexão demorou mais que o esperado. Confira sua internet e tente novamente.");
  });
});
