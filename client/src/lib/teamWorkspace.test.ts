import { describe, expect, it } from "vitest";
import { getTeamWorkspaceSummary } from "./teamWorkspace";

describe("teamWorkspace", () => {
  it("separa membros ativos, inativos e responsáveis administrativos", () => {
    expect(getTeamWorkspaceSummary([{ active: true, role: "owner" }, { active: true, role: "technician" }, { active: false, role: "admin" }])).toEqual({ active: 2, inactive: 1, admins: 1 });
  });
});
