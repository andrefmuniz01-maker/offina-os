import { UNAUTHED_ERR_MSG } from "@shared/const";

type RpcErrorShape = {
  message?: unknown;
  data?: {
    path?: unknown;
  };
};

export type ApiErrorDisposition = "auth-state" | "module-error";

/**
 * Apenas `auth.me` pode informar que o estado autenticado precisa ser reavaliado.
 * Uma falha em um módulo protegido não é evidência de logout e nunca deve remover
 * o usuário da área em que ele já está trabalhando.
 */
export function getApiErrorDisposition(error: unknown): ApiErrorDisposition {
  const candidate = error as RpcErrorShape | null;

  if (
    candidate?.message === UNAUTHED_ERR_MSG &&
    candidate.data?.path === "auth.me"
  ) {
    return "auth-state";
  }

  return "module-error";
}
