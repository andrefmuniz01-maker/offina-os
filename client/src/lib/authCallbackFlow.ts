export function requiresPasswordSetup(callbackType: string | null) {
  return callbackType === "recovery" || callbackType === "invite";
}
