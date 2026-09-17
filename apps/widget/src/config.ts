/**
 * Widget configuration. Everything here is public by design — the widget runs
 * on the customer's website, so no secret may ever be placed in this bundle.
 *
 * `companyId` / `websiteId` / `widgetId` are reserved for the multi-tenant work
 * that comes later; they are read but not yet enforced by the backend.
 */
export type WidgetMode = "widget" | "page";

export interface WidgetConfig {
  apiUrl: string;
  companyId?: string;
  websiteId?: string;
  widgetId?: string;
  /** A branch's chat link or embed: the visitor isn't asked to pick a branch. */
  branchId?: string;
  /** An agent's personal link or embed: chats always go to this agent. */
  agentId?: string;
  /**
   * `widget`: the floating launcher on someone's website. `page`: the hosted
   * full-page chat behind a shareable link, always open.
   */
  mode: WidgetMode;
}

const DEFAULT_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const ID = /^[A-Za-z0-9_-]{1,64}$/;

const firstId = (...values: Array<string | null | undefined>) =>
  values.find((value): value is string => typeof value === "string" && ID.test(value));

/**
 * Reads the embedding script tag. A target (agent or branch) can come from, in
 * order: `data-agent-id` / `data-branch-id`, the script URL
 * (`widget.js?agent=…`), or, for the hosted chat page, the page address
 * (`/chat?agent=…`).
 *
 * `script` is `document.currentScript`, captured while the bundle first runs:
 * by the time the page has loaded it is null. The query selectors are the
 * fallback, and what makes this work inside an ES module in development.
 */
export function readConfig(script: HTMLScriptElement | null): WidgetConfig {
  const element =
    script ??
    document.querySelector<HTMLScriptElement>("script[data-acme-chat]") ??
    document.querySelector<HTMLScriptElement>('script[src*="widget.js"]');

  const dataset = element?.dataset ?? {};
  const srcParams = element?.src
    ? new URL(element.src, window.location.href).searchParams
    : new URLSearchParams();
  const mode: WidgetMode = dataset.mode === "page" ? "page" : "widget";
  const pageParams =
    mode === "page" ? new URLSearchParams(window.location.search) : new URLSearchParams();

  const agentId = firstId(dataset.agentId, srcParams.get("agent"), pageParams.get("agent"));
  const branchId = firstId(dataset.branchId, srcParams.get("branch"), pageParams.get("branch"));

  return {
    apiUrl: dataset.apiUrl ?? DEFAULT_API_URL,
    companyId: dataset.companyId,
    websiteId: dataset.websiteId,
    widgetId: dataset.widgetId,
    mode,
    // An agent link wins: the agent's own branch is implied.
    ...(agentId ? { agentId } : branchId ? { branchId } : {}),
  };
}
