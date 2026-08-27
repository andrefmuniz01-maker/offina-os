import { describe, expect, it } from "vitest";
import { summarizeLegacyUserPresence } from "../scripts/check-legacy-user-presence.mjs";

describe("verificação de ponte MySQL legada", () => {
  it("não expõe identificadores e informa somente a presença do usuário", () => {
    expect(summarizeLegacyUserPresence([])).toEqual({ legacyUserPresent: false });
    expect(summarizeLegacyUserPresence([{ legacy_user_present: 1 }])).toEqual({ legacyUserPresent: true });
  });
});
