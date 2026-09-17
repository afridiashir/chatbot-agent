import { useState } from "react";
import type { Branch } from "@repo/types";

export interface VisitorDetails {
  name: string;
  email: string;
  phone: string;
}

interface PreChatFormProps {
  branches: Branch[];
  /** Set by an agent or branch link: no branch question. */
  lockedBranch?: Branch | null;
  /** The agent whose personal link this is. */
  agentName?: string | null;
  submitting: boolean;
  onStart: (branchId: string, visitor: VisitorDetails) => void;
}

const EMPTY = { name: "", email: "", phone: "", branchId: "" };

/**
 * Collected before an agent is assigned, so whoever picks the chat up already
 * knows who they are talking to and how to reach them if the chat drops.
 *
 * Validation here is only for fast feedback — the server validates the same
 * fields again, and is the authority.
 */
export function PreChatForm({
  branches,
  lockedBranch,
  agentName,
  submitting,
  onStart,
}: PreChatFormProps) {
  const [form, setForm] = useState({ ...EMPTY, branchId: lockedBranch?.id ?? "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY, string>>>({});

  function validate(): boolean {
    const next: typeof errors = {};
    if (form.name.trim().length < 2) next.name = "Please enter your name";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) next.email = "Enter a valid email";
    if (!/^[0-9+()\-.\s]{7,24}$/.test(form.phone.trim())) next.phone = "Enter a valid number";
    if (!form.branchId) next.branchId = "Choose a branch";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !validate()) return;

    onStart(form.branchId, {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    });
  }

  const field = (key: keyof typeof EMPTY) =>
    [
      "w-full rounded-lg border bg-white px-3 py-2 text-base text-wa-text placeholder:text-wa-meta/70 focus:outline-none sm:text-sm",
      errors[key] ? "border-red-400" : "border-wa-divider focus:border-wa-green",
    ].join(" ");

  return (
    <form
      onSubmit={submit}
      className="wa-canvas flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {/* A greeting bubble, so the form reads as the start of a chat. */}
      <div className="wa-bubble-in max-w-[85%] px-3 py-2 text-sm">
        {agentName
          ? `👋 Hi, I'm ${agentName}! Tell me how to reach you and we can start chatting.`
          : lockedBranch
            ? `👋 Hi! Tell us how to reach you and we'll connect you to our ${lockedBranch.name} team.`
            : "👋 Hi! Tell us how to reach you and we'll connect you to an agent."}
      </div>

      <div className="flex flex-col gap-3 rounded-lg bg-white p-3 shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-wa-icon">Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Your name"
            aria-label="Name"
            autoComplete="name"
            className={field("name")}
          />
          {errors.name && <span className="text-xs text-red-600">{errors.name}</span>}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-wa-icon">Phone number</span>
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+92 300 1234567"
            aria-label="Phone number"
            autoComplete="tel"
            inputMode="tel"
            className={field("phone")}
          />
          {errors.phone && <span className="text-xs text-red-600">{errors.phone}</span>}
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-wa-icon">Email</span>
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
            aria-label="Email"
            autoComplete="email"
            inputMode="email"
            className={field("email")}
          />
          {errors.email && <span className="text-xs text-red-600">{errors.email}</span>}
        </label>

        {!lockedBranch && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-wa-icon">Branch</span>
          <select
            value={form.branchId}
            onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            aria-label="Branch"
            className={field("branchId")}
          >
            <option value="">Select your branch</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          {errors.branchId && <span className="text-xs text-red-600">{errors.branchId}</span>}
        </label>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 rounded-full bg-wa-green px-3 py-2.5 text-sm font-medium text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Connecting…" : "Start chat"}
        </button>
      </div>
    </form>
  );
}
