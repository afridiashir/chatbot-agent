"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Contact,
  Download,
  FilterX,
  Heart,
  MapPin,
  MessageCircle,
  Phone,
  Repeat,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import type { BranchWithAgents, LeadDetail, LeadTablePage, LeadTableRow } from "@repo/types";
import { MARITAL_STATUS_LABELS } from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatClock, formatDateSeparator, formatListTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function AdminLeadsPage() {
  return <AdminShell>{({ token }) => <Leads token={token} />}</AdminShell>;
}

/* --------------------------------- filters --------------------------------- */

type Sort =
  | "name"
  | "phone"
  | "city"
  | "branch"
  | "enquiries"
  | "missed"
  | "firstEnquiryAt"
  | "lastEnquiryAt";

type DatePreset = "" | "today" | "7" | "30" | "90" | "custom";

interface Filters {
  search: string;
  branchId: string;
  agentId: string;
  conversation: "" | "open" | "closed" | "none";
  outcome: "" | "missed" | "answered";
  visits: "" | "new" | "returning";
  date: DatePreset;
  /** YYYY-MM-DD, local, used when `date` is custom. */
  fromDay: string;
  toDay: string;
  sort: Sort;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

const DEFAULTS: Filters = {
  search: "",
  branchId: "",
  agentId: "",
  conversation: "",
  outcome: "",
  visits: "",
  date: "",
  fromDay: "",
  toDay: "",
  sort: "lastEnquiryAt",
  dir: "desc",
  page: 1,
  pageSize: 25,
};

/** Filters that narrow the result set, as opposed to sorting and paging. */
const NARROWING: Array<keyof Filters> = [
  "search",
  "branchId",
  "agentId",
  "conversation",
  "outcome",
  "visits",
  "date",
];

const PAGE_SIZES = [10, 25, 50, 100];

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

/** The [from, to) window for a date filter, in the admin's own days. */
function dateWindow(filters: Filters): { from?: string; to?: string } {
  const today = startOfLocalDay(new Date());
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (filters.date === "today") return { from: today.toISOString(), to: tomorrow.toISOString() };
  if (filters.date === "7" || filters.date === "30" || filters.date === "90") {
    const days = Number(filters.date);
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
    return { from: from.toISOString(), to: tomorrow.toISOString() };
  }
  if (filters.date === "custom") {
    const from = parseDay(filters.fromDay);
    const toDay = parseDay(filters.toDay);
    // The end date is inclusive for the reader, so the window ends the day after.
    const to = toDay
      ? new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1)
      : undefined;
    return { from: from?.toISOString(), to: to?.toISOString() };
  }
  return {};
}

function toParams(filters: Filters, overrides: Partial<{ page: number; pageSize: number }> = {}) {
  const params = new URLSearchParams();
  const set = (key: string, value: string) => value && params.set(key, value);
  set("search", filters.search.trim());
  set("branchId", filters.branchId);
  set("agentId", filters.agentId);
  set("conversation", filters.conversation);
  set("outcome", filters.outcome);
  set("visits", filters.visits);
  const { from, to } = dateWindow(filters);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  params.set("sort", filters.sort);
  params.set("dir", filters.dir);
  params.set("page", String(overrides.page ?? filters.page));
  params.set("pageSize", String(overrides.pageSize ?? filters.pageSize));
  return params;
}

/** The address bar mirrors the filters so a filtered view can be shared or reloaded. */
function filtersFromUrl(): Filters {
  const q = new URLSearchParams(window.location.search);
  const pick = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
    const value = q.get(key);
    return value !== null && (allowed as readonly string[]).includes(value)
      ? (value as T)
      : fallback;
  };
  return {
    ...DEFAULTS,
    search: q.get("search") ?? "",
    branchId: q.get("branchId") ?? "",
    agentId: q.get("agentId") ?? "",
    conversation: pick("conversation", ["", "open", "closed", "none"], ""),
    outcome: pick("outcome", ["", "missed", "answered"], ""),
    visits: pick("visits", ["", "new", "returning"], ""),
    date: pick("date", ["", "today", "7", "30", "90", "custom"], ""),
    fromDay: q.get("fromDay") ?? "",
    toDay: q.get("toDay") ?? "",
    sort: pick(
      "sort",
      ["name", "phone", "city", "branch", "enquiries", "missed", "firstEnquiryAt", "lastEnquiryAt"],
      DEFAULTS.sort,
    ),
    dir: pick("dir", ["asc", "desc"], DEFAULTS.dir),
    page: Math.max(1, Number(q.get("page")) || 1),
    pageSize: PAGE_SIZES.includes(Number(q.get("pageSize")))
      ? Number(q.get("pageSize"))
      : DEFAULTS.pageSize,
  };
}

function writeUrl(filters: Filters, openLeadId: string | null) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== DEFAULTS[key as keyof Filters] && value !== "") q.set(key, String(value));
  }
  if (openLeadId) q.set("lead", openLeadId);
  const query = q.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ""}`;
  if (next !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, "", next);
  }
}

const fullDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/* ---------------------------------- page ----------------------------------- */

function Leads({ token }: { token: string }) {
  const [filters, setFilters] = useState<Filters | null>(null);
  const [searchDraft, setSearchDraft] = useState("");
  const [data, setData] = useState<LeadTablePage | null>(null);
  const [branches, setBranches] = useState<BranchWithAgents[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [history, setHistory] = useState<LeadDetail | null>(null);

  // Read the URL once on mount (it may carry filters, or a lead from the top-bar search).
  useEffect(() => {
    const initial = filtersFromUrl();
    setFilters(initial);
    setSearchDraft(initial.search);
    const lead = new URLSearchParams(window.location.search).get("lead");
    if (lead) setOpenLeadId(lead);
  }, []);

  useEffect(() => {
    void api<BranchWithAgents[]>("/api/admin/branches", { token })
      .then(setBranches)
      .catch(() => undefined);
  }, [token]);

  const agents = useMemo(
    () =>
      branches
        .flatMap((branch) => branch.agents.map((agent) => ({ ...agent, branchName: branch.name })))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [branches],
  );

  const update = useCallback((patch: Partial<Filters>) => {
    setFilters((current) =>
      current
        ? {
            ...current,
            ...patch,
            // Any change other than paging starts again from the first page.
            page: "page" in patch ? (patch.page ?? 1) : 1,
          }
        : current,
    );
  }, []);

  // Typing is debounced into the real filter so each keystroke is not a request.
  useEffect(() => {
    if (!filters || searchDraft === filters.search) return;
    const timer = setTimeout(() => update({ search: searchDraft }), 300);
    return () => clearTimeout(timer);
  }, [searchDraft, filters, update]);

  // Custom dates are only sent once the range is complete and in order.
  const customInvalid =
    filters?.date === "custom" &&
    Boolean(filters.fromDay && filters.toDay && filters.fromDay > filters.toDay);

  // The address bar follows the filters and the open lead, without refetching.
  useEffect(() => {
    if (filters) writeUrl(filters, openLeadId);
  }, [filters, openLeadId]);

  useEffect(() => {
    if (!filters || customInvalid) return;
    let cancelled = false;
    setLoading(true);
    api<LeadTablePage>(`/api/admin/leads/table?${toParams(filters)}`, { token })
      .then((next) => {
        if (cancelled) return;
        setData(next);
        setError(null);
        // Deleted rows or a narrower filter can leave the page past the end.
        const lastPage = Math.max(1, Math.ceil(next.total / next.pageSize));
        if (next.rows.length === 0 && filters.page > lastPage) update({ page: lastPage });
      })
      .catch(() => !cancelled && setError("Could not load leads"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters, token, customInvalid, update]);

  // The history is loaded on demand, only for the lead that is open.
  useEffect(() => {
    setHistory(null);
    if (!openLeadId) return;
    let cancelled = false;
    api<LeadDetail>(`/api/admin/leads/${openLeadId}`, { token })
      .then((detail) => !cancelled && setHistory(detail))
      .catch(() => !cancelled && setError("Could not load that lead's history"));
    return () => {
      cancelled = true;
    };
  }, [openLeadId, token]);

  function toggleSort(column: Sort) {
    if (!filters) return;
    if (filters.sort === column) update({ dir: filters.dir === "asc" ? "desc" : "asc" });
    // Text reads naturally A→Z; numbers and dates are most useful largest first.
    else
      update({
        sort: column,
        dir:
          column === "name" || column === "city" || column === "branch" || column === "phone"
            ? "asc"
            : "desc",
      });
  }

  async function exportCsv() {
    if (!filters) return;
    setExporting(true);
    try {
      const all: LeadTableRow[] = [];
      for (let page = 1; ; page += 1) {
        const chunk = await api<LeadTablePage>(
          `/api/admin/leads/table?${toParams(filters, { page, pageSize: 500 })}`,
          { token },
        );
        all.push(...chunk.rows);
        if (all.length >= chunk.total || chunk.rows.length === 0) break;
      }
      const header = [
        "Name",
        "Email",
        "Phone",
        "City",
        "Marital status",
        "Branch",
        "Enquiries",
        "Missed",
        "Latest chat",
        "Agent",
        "First contact",
        "Last contact",
      ];
      const cell = (value: string | number | null | undefined) => {
        const text = String(value ?? "");
        // Quote everything, and neutralise leading formula characters for spreadsheets.
        const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
        return `"${safe.replaceAll('"', '""')}"`;
      };
      const lines = all.map((row) =>
        [
          row.name,
          row.phone,
          row.city ?? "",
          row.maritalStatus ? MARITAL_STATUS_LABELS[row.maritalStatus] : "",
          row.branchName ?? "",
          row.enquiryCount,
          row.missedCount,
          row.latestConversation
            ? row.latestConversation.status === "ACTIVE"
              ? "Open"
              : "Closed"
            : "None",
          row.latestConversation?.agentName ?? "",
          row.firstEnquiryAt ?? "",
          row.lastEnquiryAt ?? "",
        ]
          .map(cell)
          .join(","),
      );
      const blob = new Blob([[header.map(cell).join(","), ...lines].join("\r\n")], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Could not export leads");
    } finally {
      setExporting(false);
    }
  }

  // Company-wide counts for the summary cards, independent of the filters below.
  const [summary, setSummary] = useState<Record<SummaryKey, number> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const count = (qs: string) =>
      api<LeadTablePage>(`/api/admin/leads/table?pageSize=1&${qs}`, { token }).then((p) => p.total);
    Promise.all([
      count(""),
      count("conversation=open"),
      count("visits=returning"),
      count("outcome=missed"),
    ])
      .then(([all, open, returning, missed]) => {
        if (!cancelled) setSummary({ all, open, returning, missed });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!filters) return <p className="text-sm text-muted-foreground">Loading leads…</p>;

  const activeCount = NARROWING.filter((key) => filters[key] !== DEFAULTS[key]).length;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / filters.pageSize));
  const currentPage = Math.min(filters.page, pageCount);
  const firstShown = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const lastShown = Math.min(total, filters.page * filters.pageSize);

  const selectClass =
    "h-9 rounded-md border border-input bg-card px-2.5 text-sm focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none";

  const summaryCards: Array<{
    key: SummaryKey;
    label: string;
    hint: string;
    icon: typeof Users;
    active: boolean;
    apply: Partial<Filters>;
  }> = [
    {
      key: "all",
      label: "All leads",
      hint: "Everyone who got in touch",
      icon: Users,
      active: !filters.conversation && !filters.visits && !filters.outcome,
      apply: { conversation: "", visits: "", outcome: "" },
    },
    {
      key: "open",
      label: "Chatting now",
      hint: "Latest chat still open",
      icon: MessageCircle,
      active: filters.conversation === "open",
      apply: { conversation: "open", visits: "", outcome: "" },
    },
    {
      key: "returning",
      label: "Returning",
      hint: "Got in touch more than once",
      icon: Repeat,
      active: filters.visits === "returning",
      apply: { conversation: "", visits: "returning", outcome: "" },
    },
    {
      key: "missed",
      label: "Need follow-up",
      hint: "Had an enquiry nobody answered",
      icon: AlertCircle,
      active: filters.outcome === "missed",
      apply: { conversation: "", visits: "", outcome: "missed" },
    },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Everyone who started a conversation or asked for one, whether or not an agent was free.
          </p>
        </div>
        <Button onClick={() => void exportCsv()} disabled={exporting || total === 0}>
          <Download className="size-4" aria-hidden />
          {exporting ? "Exporting…" : `Export CSV${total ? ` (${total})` : ""}`}
        </Button>
      </div>

      {/* ---------------------------- summary cards ---------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map(({ key, label, hint, icon: Icon, active, apply }) => (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => update(apply)}
            className={cn(
              "flex items-start justify-between gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              active && "border-primary ring-1 ring-primary",
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <span className="mt-1 block text-2xl font-semibold tracking-tight">
                {summary ? summary[key] : "—"}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
            </span>
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                key === "missed"
                  ? "bg-warning-soft text-warning"
                  : active
                    ? "bg-primary text-primary-foreground"
                    : "bg-success-soft text-primary",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
          </button>
        ))}
      </div>

      {/* ------------------------------ filter bar ----------------------------- */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative lg:w-72">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search name, phone or city"
              aria-label="Search leads"
              className="pl-9"
            />
          </div>

          <div
            role="radiogroup"
            aria-label="Latest conversation"
            className="flex flex-wrap gap-1 lg:ml-auto"
          >
            {CHAT_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                role="radio"
                aria-checked={filters.conversation === chip.value}
                onClick={() => update({ conversation: chip.value })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  filters.conversation === chip.value &&
                    "border-transparent bg-success-soft text-foreground hover:bg-success-soft",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden />
          <select
            value={filters.branchId}
            onChange={(e) => update({ branchId: e.target.value })}
            aria-label="Branch"
            className={selectClass}
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
                {branch.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </select>

          <select
            value={filters.agentId}
            onChange={(e) => update({ agentId: e.target.value })}
            aria-label="Agent who handled them"
            className={selectClass}
          >
            <option value="">Any agent</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} · {agent.branchName}
              </option>
            ))}
          </select>

          <select
            value={filters.outcome}
            onChange={(e) => update({ outcome: e.target.value as Filters["outcome"] })}
            aria-label="Outcome"
            className={selectClass}
          >
            <option value="">Answered or missed</option>
            <option value="missed">Has a missed enquiry</option>
            <option value="answered">Always answered</option>
          </select>

          <select
            value={filters.visits}
            onChange={(e) => update({ visits: e.target.value as Filters["visits"] })}
            aria-label="Visits"
            className={selectClass}
          >
            <option value="">New or returning</option>
            <option value="new">First-time</option>
            <option value="returning">Returning</option>
          </select>

          <select
            value={filters.date}
            onChange={(e) => update({ date: e.target.value as DatePreset })}
            aria-label="Enquired"
            className={selectClass}
          >
            <option value="">Any time</option>
            <option value="today">Today</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom range…</option>
          </select>

          {filters.date === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={filters.fromDay}
                max={filters.toDay || undefined}
                onChange={(e) => update({ fromDay: e.target.value })}
                aria-label="From date"
                className="w-40"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={filters.toDay}
                min={filters.fromDay || undefined}
                onChange={(e) => update({ toDay: e.target.value })}
                aria-label="To date"
                aria-invalid={customInvalid}
                className="w-40"
              />
            </div>
          )}

          {activeCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-destructive hover:text-destructive"
              onClick={() => {
                setSearchDraft("");
                setFilters({ ...DEFAULTS, pageSize: filters.pageSize });
              }}
            >
              <FilterX className="size-4" aria-hidden />
              Clear {activeCount} filter{activeCount === 1 ? "" : "s"}
            </Button>
          )}
        </div>
        {customInvalid && (
          <p className="text-xs text-destructive">
            The start date must be on or before the end date.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* --------------------------------- table -------------------------------- */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-muted-foreground">
              <Contact className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-semibold">
                {activeCount ? "Filtered leads" : "All leads"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {loading && !data
                  ? "Loading…"
                  : `${total} ${total === 1 ? "person" : "people"} · click a row for their history`}
              </p>
            </div>
          </div>
          {loading && data && (
            <span className="text-xs text-muted-foreground" aria-live="polite">
              Updating…
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table
            className={cn(
              "w-full min-w-[980px] text-sm transition-opacity",
              loading && data && "opacity-60",
            )}
          >
            <thead className="bg-chat-header text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="w-12" />
                <SortHeader label="Lead" column="name" filters={filters} onSort={toggleSort} />
                <SortHeader label="Phone" column="phone" filters={filters} onSort={toggleSort} />
                <SortHeader label="Branch" column="branch" filters={filters} onSort={toggleSort} />
                <SortHeader
                  label="Enquiries"
                  column="enquiries"
                  filters={filters}
                  onSort={toggleSort}
                  numeric
                />
                <SortHeader
                  label="Missed"
                  column="missed"
                  filters={filters}
                  onSort={toggleSort}
                  numeric
                />
                <th scope="col" className="px-3 py-3 text-left font-semibold">
                  Latest chat
                </th>
                <SortHeader
                  label="First contact"
                  column="firstEnquiryAt"
                  filters={filters}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Last contact"
                  column="lastEnquiryAt"
                  filters={filters}
                  onSort={toggleSort}
                />
              </tr>
            </thead>
            <tbody className="bg-card">
              {!data && loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    Loading leads…
                  </td>
                </tr>
              )}
              {data && data.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-14">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-primary">
                        <Contact className="size-5" aria-hidden />
                      </span>
                      <div>
                        <p className="font-semibold">
                          {activeCount ? "No leads match these filters" : "No leads yet"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activeCount
                            ? "Try widening the date range or clearing a filter."
                            : "Leads appear here as soon as someone starts a chat."}
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {data?.rows.map((lead) => {
                const open = openLeadId === lead.id;
                return (
                  <Fragment key={lead.id}>
                    <tr
                      data-testid="lead-row"
                      onClick={() => setOpenLeadId(open ? null : lead.id)}
                      className={cn(
                        // Rows stay on the white card; hover is a faint green, never the page grey.
                        "cursor-pointer border-t bg-card transition-colors hover:bg-success-soft/25",
                        open && "bg-success-soft/40 hover:bg-success-soft/50",
                      )}
                    >
                      <td
                        className={cn(
                          "border-l-2 pl-3",
                          open ? "border-primary" : "border-transparent",
                        )}
                      >
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={`${open ? "Hide" : "Show"} history for ${lead.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenLeadId(open ? null : lead.id);
                          }}
                          className={cn(
                            "flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent",
                            open && "bg-primary text-primary-foreground hover:bg-primary/90",
                          )}
                        >
                          {open ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={lead.name} seed={lead.id} size="md" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{lead.name}</p>
                            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <MapPin className="size-3 shrink-0" aria-hidden />
                              <span className="truncate">
                                {lead.city ?? "City not given"}
                                {lead.maritalStatus &&
                                  ` · ${MARITAL_STATUS_LABELS[lead.maritalStatus]}`}
                              </span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                        {lead.phone}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {lead.branchName ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 className="size-3.5 text-muted-foreground" aria-hidden />
                            {lead.branchName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Removed</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className="font-semibold tabular-nums">{lead.enquiryCount}</span>
                        {lead.enquiryCount > 1 && (
                          <span className="ml-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-medium text-success">
                            Returning
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {lead.missedCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
                            <AlertCircle className="size-3" aria-hidden />
                            {lead.missedCount}
                          </span>
                        ) : (
                          <span className="text-muted-foreground tabular-nums">0</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {lead.latestConversation ? (
                          <Link
                            href={`/admin/conversations/${lead.latestConversation.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="group inline-flex items-center gap-2"
                          >
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                lead.latestConversation.status === "ACTIVE"
                                  ? "bg-success-soft text-success"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {lead.latestConversation.status === "ACTIVE" && (
                                <span className="size-1.5 rounded-full bg-online" aria-hidden />
                              )}
                              {lead.latestConversation.status === "ACTIVE" ? "Open" : "Closed"}
                            </span>
                            <span className="truncate text-xs text-muted-foreground group-hover:text-primary group-hover:underline">
                              {lead.latestConversation.agentName}
                            </span>
                          </Link>
                        ) : (
                          <span className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
                            No chat
                          </span>
                        )}
                      </td>
                      <td
                        className="px-3 py-3 whitespace-nowrap text-muted-foreground"
                        title={lead.firstEnquiryAt ? fullDate(lead.firstEnquiryAt) : undefined}
                      >
                        {lead.firstEnquiryAt ? formatListTime(lead.firstEnquiryAt) : "—"}
                      </td>
                      <td
                        className="px-3 py-3 font-medium whitespace-nowrap"
                        title={lead.lastEnquiryAt ? fullDate(lead.lastEnquiryAt) : undefined}
                      >
                        {lead.lastEnquiryAt ? formatListTime(lead.lastEnquiryAt) : "—"}
                      </td>
                    </tr>

                    {open && (
                      <tr className="bg-success-soft/20">
                        <td className="border-l-2 border-primary" />
                        <td colSpan={8} className="px-3 pt-1 pb-4" data-testid="lead-history">
                          <LeadHistory lead={lead} history={history} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ------------------------------ pagination ----------------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3 text-xs text-muted-foreground">
          <p>
            {total === 0 ? (
              "No results"
            ) : (
              <>
                Showing{" "}
                <span className="font-semibold text-foreground">
                  {firstShown}–{lastShown}
                </span>{" "}
                of <span className="font-semibold text-foreground">{total}</span>
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5">
              Rows per page
              <select
                value={filters.pageSize}
                onChange={(e) => update({ pageSize: Number(e.target.value) })}
                className="h-8 rounded-md border border-input bg-card px-1.5 text-xs"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <nav aria-label="Pages" className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => update({ page: currentPage - 1 })}
                aria-label="Previous page"
                className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              {pageNumbers(currentPage, pageCount).map((item, index) =>
                item === "…" ? (
                  <span key={`gap-${index}`} className="px-1">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => update({ page: item })}
                    aria-current={item === currentPage ? "page" : undefined}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full font-medium tabular-nums transition-colors hover:bg-accent",
                      item === currentPage && "bg-primary text-primary-foreground hover:bg-primary",
                    )}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => update({ page: currentPage + 1 })}
                aria-label="Next page"
                className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </nav>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Every conversation is a lead. People are deduplicated by phone number, so the same person
        getting in touch twice updates one row, while every individual enquiry is kept in their
        history. &quot;Missed&quot; counts enquiries that arrived when nobody in that branch was
        online.
      </p>
    </div>
  );
}

/* --------------------------------- pieces ---------------------------------- */

type SummaryKey = "all" | "open" | "returning" | "missed";

const CHAT_CHIPS: Array<{ value: Filters["conversation"]; label: string }> = [
  { value: "", label: "All chats" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "none", label: "No chat" },
];

/** 1 … 4 5 6 … 12: the first, last and neighbours of the current page. */
function pageNumbers(current: number, count: number): Array<number | "…"> {
  const wanted = new Set([1, count, current - 1, current, current + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= count).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  pages.forEach((page, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && page - previous > 1) out.push("…");
    out.push(page);
  });
  return out;
}

function SortHeader({
  label,
  column,
  filters,
  onSort,
  numeric,
}: {
  label: string;
  column: Sort;
  filters: Filters;
  onSort: (column: Sort) => void;
  numeric?: boolean;
}) {
  const active = filters.sort === column;
  const Icon = !active ? ArrowUpDown : filters.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (filters.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-3 py-3 font-semibold", numeric ? "text-right" : "text-left")}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 rounded tracking-wide whitespace-nowrap uppercase hover:text-foreground",
          active && "text-primary",
        )}
      >
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
      </button>
    </th>
  );
}

function LeadHistory({ lead, history }: { lead: LeadTableRow; history: LeadDetail | null }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm md:flex-row md:gap-8">
      <div className="min-w-0 flex-1">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold">
          <CalendarClock className="size-4 text-primary" aria-hidden />
          {history ? `Every time ${history.name} got in touch` : "Loading history…"}
        </p>
        {history && (
          <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
            {history.enquiries.map((enquiry) => (
              <li
                key={enquiry.id}
                data-testid="enquiry-row"
                className="relative flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-1 -left-[21px] size-2.5 rounded-full ring-2 ring-card",
                    enquiry.answered ? "bg-success" : "bg-warning",
                  )}
                />
                <span className="font-medium">
                  {formatDateSeparator(enquiry.createdAt)} at {formatClock(enquiry.createdAt)}
                </span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {enquiry.branchName ?? "Branch removed"}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    enquiry.answered
                      ? "bg-success-soft text-success"
                      : "bg-warning-soft text-warning",
                  )}
                >
                  {enquiry.answered ? "Connected to an agent" : "Nobody was online"}
                </span>
                {enquiry.conversationId && (
                  <Link
                    href={`/admin/conversations/${enquiry.conversationId}`}
                    className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                  >
                    <MessageCircle className="size-3" aria-hidden />
                    View chat
                  </Link>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 md:w-60">
        <p className="text-xs font-semibold">Contact</p>
        <a
          href={`tel:${lead.phone}`}
          className="inline-flex items-center gap-2 rounded-lg bg-success-soft/60 px-3 py-2 text-xs font-medium text-success transition-colors hover:bg-success-soft"
        >
          <Phone className="size-3.5 shrink-0" aria-hidden />
          {lead.phone}
        </a>
        <p className="inline-flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{lead.city ?? "City not given"}</span>
        </p>
        <p className="inline-flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Heart className="size-3.5 shrink-0" aria-hidden />
          {lead.maritalStatus
            ? MARITAL_STATUS_LABELS[lead.maritalStatus]
            : "Marital status not given"}
        </p>
      </div>
    </div>
  );
}
