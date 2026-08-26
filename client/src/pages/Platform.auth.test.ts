import { describe, expect, it } from "vitest";
import { getPlatformAccessState } from "./Platform";

describe("getPlatformAccessState", () => {
  it("mantém o painel em carregamento enquanto a identidade é resolvida", () => {
    expect(getPlatformAccessState(null, true)).toBe("loading");
  });

  it("não apresenta o painel global para identidade ausente ou sem papel global", () => {
    expect(getPlatformAccessState(null, false)).toBe("unauthenticated");
    expect(getPlatformAccessState({ platformRole: "platform_user" }, false)).toBe("forbidden");
  });

  it("permite somente o papel super_admin na interface global", () => {
    expect(getPlatformAccessState({ platformRole: "super_admin" }, false)).toBe("granted");
  });
});
