import { describe, expect, it } from "vitest";
import { toPublicQuoteRequestReceipt } from "./quotes";

describe("toPublicQuoteRequestReceipt", () => {
  it("expõe somente o protocolo da solicitação pública", () => {
    expect(toPublicQuoteRequestReceipt({ requestId: 481, number: 27 })).toEqual({ number: 27 });
  });
});
