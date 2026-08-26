import { describe, expect, it } from "vitest";
import { getSidebarResizeWidth } from "./sidebarAccessibility";

describe("sidebarAccessibility", () => {
  it("redimensiona a barra lateral por teclado respeitando limites", () => {
    expect(getSidebarResizeWidth(280, "ArrowLeft")).toBe(256);
    expect(getSidebarResizeWidth(472, "ArrowRight")).toBe(480);
    expect(getSidebarResizeWidth(280, "Home")).toBe(200);
  });
});
