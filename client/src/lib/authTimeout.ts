export const AUTH_REQUEST_TIMEOUT_MS = 12_000;

export class AuthRequestTimeoutError extends Error {
  constructor() {
    super("A solicitação de autenticação excedeu o tempo limite.");
    this.name = "AuthRequestTimeoutError";
  }
}

export function withAuthTimeout<T>(operation: () => PromiseLike<T> | T, timeoutMs = AUTH_REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => reject(new AuthRequestTimeoutError()), timeoutMs);

    try {
      Promise.resolve(operation()).then(
        result => {
          globalThis.clearTimeout(timeout);
          resolve(result);
        },
        error => {
          globalThis.clearTimeout(timeout);
          reject(error);
        },
      );
    } catch (error) {
      globalThis.clearTimeout(timeout);
      reject(error);
    }
  });
}

export function getAuthConnectionTimeoutMessage() {
  return "A conexão demorou mais que o esperado. Confira sua internet e tente novamente.";
}
