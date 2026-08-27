import React, { type FormEvent } from "react";

type AuthPasswordSetupFormProps = {
  newPassword: string;
  confirmPassword: string;
  passwordError: string | null;
  isSavingPassword: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
};

export function AuthPasswordSetupForm({
  newPassword,
  confirmPassword,
  passwordError,
  isSavingPassword,
  onSubmit,
  onNewPasswordChange,
  onConfirmPasswordChange,
}: AuthPasswordSetupFormProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Defina sua senha</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use ao menos 10 caracteres com letras maiúsculas, minúsculas e números.</p>
        </div>
        <input aria-label="Nova senha" className="h-11 rounded-md border bg-background px-3 text-sm" type="password" minLength={10} autoComplete="new-password" value={newPassword} onChange={event => onNewPasswordChange(event.target.value)} required />
        <input aria-label="Confirmar nova senha" className="h-11 rounded-md border bg-background px-3 text-sm" type="password" minLength={10} autoComplete="new-password" value={confirmPassword} onChange={event => onConfirmPasswordChange(event.target.value)} required />
        {passwordError ? <p className="text-sm text-destructive">{passwordError}</p> : null}
        <button type="submit" disabled={isSavingPassword} className="h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">{isSavingPassword ? "Salvando…" : "Salvar senha e continuar"}</button>
      </form>
    </main>
  );
}
