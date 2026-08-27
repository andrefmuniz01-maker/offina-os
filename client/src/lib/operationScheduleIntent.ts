export function getApprovedQuoteIdFromSearch(search: string) {
  const value = new URLSearchParams(search).get("orcamento");
  if (!value || !/^\d+$/.test(value)) return "";
  const quoteId = Number(value);
  return Number.isSafeInteger(quoteId) && quoteId > 0 ? String(quoteId) : "";
}
