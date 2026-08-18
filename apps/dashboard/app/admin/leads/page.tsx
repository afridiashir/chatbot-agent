"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { BranchWithAgents, Lead } from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatListTime } from "@/lib/format";

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
            <div
              key={lead.id}
              data-testid="lead-row"
              className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
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
                    <a href={`mailto:${lead.email}`} className="hover:underline">
                      {lead.email}
                    </a>
                    {" · "}
                    <a href={`tel:${lead.phone}`} className="hover:underline">
                      {lead.phone}
                    </a>
                  </p>
                </div>
              </div>

              <div className="text-right text-xs text-muted-foreground">
                <p>{lead.branchName ?? "Branch removed"}</p>
                <p>
                  {lead.enquiryCount} enquir{lead.enquiryCount === 1 ? "y" : "ies"} ·{" "}
                  {formatListTime(lead.updatedAt)}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Leads are deduplicated by email, so the same person enquiring twice updates one row rather
        than creating a second. &quot;Missed&quot; counts the enquiries that arrived when nobody in
        that branch was online.
      </p>
    </div>
  );
}
