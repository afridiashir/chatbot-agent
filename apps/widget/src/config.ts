/**
 * Widget configuration. Everything here is public by design — the widget runs
 * on the customer's website, so no secret may ever be placed in this bundle.
 *
 * `companyId` / `websiteId` / `widgetId` are reserved for the multi-tenant work
 * that comes later; they are read but not yet enforced by the backend.
 */
export interface WidgetConfig {
  apiUrl: string;
  companyId?: string;
  websiteId?: string;
  widgetId?: string;
}

const DEFAULT_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/**
 * Reads `data-*` attributes off the embedding script tag.
 *
 * `document.currentScript` is the fast path for the shipped classic bundle. It
 * is always null inside an ES module, so the query selector fallback is what
 * makes this work regardless of how the host page includes us.
 */
export function readConfig(): WidgetConfig {
  const script =
    document.currentScript instanceof HTMLScriptElement
      ? document.currentScript
      : document.querySelector<HTMLScriptElement>("script[data-acme-chat]");

  const dataset = script?.dataset ?? {};

  return {
    apiUrl: dataset.apiUrl ?? DEFAULT_API_URL,
    companyId: dataset.companyId,
    websiteId: dataset.websiteId,
    widgetId: dataset.widgetId,
  };
}
