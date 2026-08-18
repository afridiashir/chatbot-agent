"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import type { BranchWithAgents, Lead, LeadDetail } from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatClock, formatDateSeparator, formatListTime } from "@/lib/format";

export default function AdminLeadsPage() {
  return <AdminShell>{({ token }) => <Leads token={token} />}</AdminShell>;
}

function Leads({ token }: { token: string }) {
  const [rows, setRows] = useState<Lead[]>([]);
  const [branches, setBranches] = useState<BranchWithAgents[]>([]);
  const [branchId, setBranchId] = useState("");
  const [missedOnly, setMissedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [history, setHistory] = useState<LeadDetail | null>(null);

  // Loaded on demand: the list only needs totals, the timeline only matters
  // for the lead an admin actually opens.
  function toggle(leadId: string) {
    if (openLeadId === leadId) {
      setOpenLeadId(null);
      setHistory(null);
      return;
    }
    setOpenLeadId(leadId);
    setHistory(null);
    void api<LeadDetail>(`/api/admin/leads/${leadId}`, { token })
      .then(setHistory)
      .catch(() => setError("Could not load that lead's history"));
  }

  useEffect(() => {
    void api<BranchWithAgents[]>("/api/admin/branches", { token })
      .then(setBranches)
      .catch(() => setError("Could not load branches"));
  }, [token]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    if (missedOnly) params.set("missedOnly", "true");
    if (search.trim()) params.set("search", search.trim());

    try {
      setRows(await api<Lead[]>(`/api/admin/leads?${params}`, { token }));
      setError(null);
    } catch {
      setError("Could not load leads");
    } finally {
      setLoading(false);
    }
  }, [token, branchId, missedOnly, search]);

  // Debounced so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 250);
    return () => clearTimeout(timer);
  }, [refresh]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Leads</h1>
        <p className="text-xs text-muted-foreground">
          Everyone who submitted the chat form, whether or not an agent was free.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Search
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, email or phone"
            aria-label="Search leads"
            className="w-56"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium">
          Branch
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            aria-label="Filter by branch"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex h-9 items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={missedOnly}
            onChange={(e) => setMissedOnly(e.target.checked)}
            aria-label="Only missed enquiries"
            className="h-4 w-4"
          />
          Missed only
        </label>

        <p className="ml-auto text-xs text-muted-foreground">
          {loading ? "Loading..." : `${rows.length} lead${rows.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-lg border">
        {rows.length === 0 && !loading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            {missedOnly
              ? "No missed enquiries. Everyone who asked reached an agent."
              : "No leads match those filters."}
          </p>
        ) : (
          rows.map((lead) => (
            <div key={lead.id} className="border-b last:border-b-0">
            <button
              type="button"
              data-testid="lead-row"
              onClick={() => toggle(lead.id)}
              aria-expanded={openLeadId === lead.id}
              className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
            >
              <div className="flex min-w-0 items-center gap-3">
                {openLeadId === lead.id ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <Avatar name={lead.name} seed={lead.id} size="md" />
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {lead.name}
                    {lead.missedCount > 0 && (
                      <span
                        title={`${lead.missedCount} enquiry/enquiries found nobody online`}
                        className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                      >
                        <AlertCircle className="h-3 w-3" aria-hidden="true" />
                        {lead.missedCount} missed
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {lead.email} · {lead.phone}
                  </p>
                </div>
              </div>

              <div className="text-right text-xs text-muted-foreground">
                <p>{lead.branchName ?? "Branch removed"}</p>
                <p>
                  {lead.enquiryCount} enquir{lead.enquiryCount === 1 ? "y" : "ies"} ·{" "}
                  {lead.lastEnquiryAt ? formatListTime(lead.lastEnquiryAt) : "—"}
                </p>
              </div>
            </button>

            {openLeadId === lead.id && (
              <div data-testid="lead-history" className="bg-muted/40 px-4 py-3 pl-11">
                {!history ? (
                  <p className="text-xs text-muted-foreground">Loading history...</p>
                ) : (
                  <>
                    <p className="mb-2 text-xs font-medium">
                      Every time {history.name} got in touch
                    </p>
                    <ol className="flex flex-col gap-1.5">
                      {history.enquiries.map((enquiry) => (
                        <li
                          key={enquiry.id}
                          data-testid="enquiry-row"
                          className="flex items-center gap-2 text-xs"
                        >
                          <span
                            aria-hidden="true"
                            className={[
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              enquiry.answered ? "bg-emerald-500" : "bg-amber-500",
                            ].join(" ")}
                          />
                          <span className="text-muted-foreground">
                            {formatDateSeparator(enquiry.createdAt)} at{" "}
                            {formatClock(enquiry.createdAt)}
                          </span>
                          <span>{enquiry.branchName ?? "Branch removed"}</span>
                          <span
                            className={
                              enquiry.answered ? "text-emerald-700" : "font-medium text-amber-700"
                            }
                          >
                            {enquiry.answered ? "connected to an agent" : "nobody was online"}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-2 flex gap-3 text-xs text-muted-foreground">
                      <a href={`mailto:${history.email}`} className="underline-offset-4 hover:underline">
                        Email {history.email}
                      </a>
                      <a href={`tel:${history.phone}`} className="underline-offset-4 hover:underline">
                        Call {history.phone}
                      </a>
                    </p>
                  </>
                )}
              </div>
            )}
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Leads are deduplicated by email, so the same person enquiring twice updates one row rather
        than creating a second — but every individual enquiry is kept, so the history builds up over
        time. Open a lead to see it. &quot;Missed&quot; counts the enquiries that arrived when nobody
        in that branch was online.
      </p>
    </div>
  );
}
