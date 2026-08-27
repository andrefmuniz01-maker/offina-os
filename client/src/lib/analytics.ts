export type AnalyticsConfig = {
  endpoint?: string;
  websiteId?: string;
};

export function getAnalyticsScriptUrl(endpoint?: string) {
  const trimmedEndpoint = endpoint?.trim();
  if (!trimmedEndpoint) return null;

  try {
    const baseUrl = new URL(trimmedEndpoint);
    if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") return null;
    return new URL("umami", `${baseUrl.toString().replace(/\/$/, "")}/`).toString();
  } catch {
    return null;
  }
}

export function installAnalytics(config: AnalyticsConfig, documentRef: Document) {
  const websiteId = config.websiteId?.trim();
  const source = getAnalyticsScriptUrl(config.endpoint);
  if (!websiteId || !source || documentRef.querySelector("script[data-oficina-analytics]")) return false;

  const script = documentRef.createElement("script");
  script.defer = true;
  script.src = source;
  script.dataset.websiteId = websiteId;
  script.dataset.oficinaAnalytics = "true";
  documentRef.head.appendChild(script);
  return true;
}
