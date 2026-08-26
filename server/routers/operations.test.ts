import { describe, expect, it } from "vitest";
import { isWorkOrderTransitionAllowed } from "./operations";

describe("transições de ordem de serviço", () => {
  it("permite a progressão operacional até a entrega", () => {
    expect(isWorkOrderTransitionAllowed("scheduled", "received")).toBe(true);
    expect(isWorkOrderTransitionAllowed("received", "diagnosis")).toBe(true);
    expect(isWorkOrderTransitionAllowed("diagnosis", "in_service")).toBe(true);
    expect(isWorkOrderTransitionAllowed("in_service", "completed")).toBe(true);
    expect(isWorkOrderTransitionAllowed("completed", "delivered")).toBe(true);
  });

  it("bloqueia a entrega ou a finalização fora da sequência", () => {
    expect(isWorkOrderTransitionAllowed("scheduled", "delivered")).toBe(false);
    expect(isWorkOrderTransitionAllowed("received", "completed")).toBe(false);
    expect(isWorkOrderTransitionAllowed("delivered", "in_service")).toBe(false);
  });
});
