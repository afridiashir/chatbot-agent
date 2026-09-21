import { useState } from "react";
import type { Branch, MaritalStatus } from "@repo/types";
import {
  MARITAL_STATUSES,
  MARITAL_STATUS_LABELS,
  OTHER_CITY,
  PAKISTAN_CITIES,
  PAKISTAN_CITY_GROUPS,
} from "@repo/types";
import type { SavedVisitor } from "../lib/storage.js";

export interface VisitorDetails {
  name: string;
  phone: string;
  maritalStatus: MaritalStatus;
  city: string;
}

interface PreChatFormProps {
  /** Named by an agent or branch link, and shown in the greeting. Without one
   *  the chat goes to the company's main branch; the visitor is never asked. */
  lockedBranch?: Branch | null;
  /** The agent whose personal link this is. */
  agentName?: string | null;
  /** What this visitor told us before, on this device. */
  saved?: SavedVisitor | null;
  submitting: boolean;
  onStart: (visitor: VisitorDetails) => void;
}

const EMPTY = { name: "", phone: "", maritalStatus: "", city: "" };

/**
 * Collected before an agent is assigned, so whoever picks the chat up already
 * knows who they are talking to and how to reach them if the chat drops.
 *
 * Validation here is only for fast feedback — the server validates the same
 * fields again, and is the authority.
 */
export function PreChatForm({
  lockedBranch,
  agentName,
  saved,
  submitting,
  onStart,
}: PreChatFormProps) {
  const [form, setForm] = useState({
    name: saved?.name ?? "",
    phone: saved?.phone ?? "",
    maritalStatus: saved?.maritalStatus ?? "",
    city: saved?.city ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY, string>>>({});
  // Someone we already know starts with one tap; the form is one link away.
  const [editing, setEditing] = useState(!saved);

  function validate(): boolean {
    const next: typeof errors = {};
    if (form.name.trim().length < 2) next.name = "Please enter your name";
    if (!/^[0-9+()\-.\s]{7,24}$/.test(form.phone.trim())) next.phone = "Enter a valid number";
    // Checked against the same lists the server validates against, so a value
    // that passes here cannot be rejected there.
    if (!MARITAL_STATUSES.includes(form.maritalStatus as MaritalStatus)) {
      next.maritalStatus = "Choose your marital status";
    }
    if (!PAKISTAN_CITIES.includes(form.city)) next.city = "Choose your city";

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function startWithSaved() {
    if (submitting || !saved) return;
    onStart({
      name: saved.name,
      phone: saved.phone,
      maritalStatus: saved.maritalStatus,
      city: saved.city,
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !validate()) return;

    onStart({
      name: form.name.trim(),
      phone: form.phone.trim(),
      maritalStatus: form.maritalStatus as MaritalStatus,
      city: form.city,
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
        {!editing && saved
          ? agentName
            ? `👋 Welcome back, ${saved.name.split(" ")[0]}! ${agentName} is here whenever you are.`
            : `👋 Welcome back, ${saved.name.split(" ")[0]}! Pick up where you left off.`
          : agentName
            ? `👋 Hi, I'm ${agentName}! Tell me how to reach you and we can start chatting.`
            : lockedBranch
              ? `👋 Hi! Tell us how to reach you and we'll connect you to our ${lockedBranch.name} team.`
              : "👋 Hi! Tell us how to reach you and we'll connect you to an agent."}
      </div>

      {!editing && saved ? (
        <div className="flex flex-col gap-3 rounded-lg bg-white p-3 shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
          <div>
            <p className="text-sm font-medium text-wa-text">{saved.name}</p>
            <p className="truncate text-xs text-wa-meta">{saved.phone}</p>
            <p className="truncate text-xs text-wa-meta">
              {MARITAL_STATUS_LABELS[saved.maritalStatus]} · {saved.city}
            </p>
          </div>

          <button
            type="button"
            onClick={startWithSaved}
            disabled={submitting}
            className="rounded-full bg-wa-green px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-60"
          >
            {submitting ? "Starting…" : "Start chatting"}
          </button>

          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-wa-meta underline-offset-2 hover:underline"
          >
            Not you, or details changed?
          </button>
        </div>
      ) : (
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
            <span className="text-xs font-medium text-wa-icon">Marital status</span>
            <select
              value={form.maritalStatus}
              onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })}
              aria-label="Marital status"
              className={field("maritalStatus")}
            >
              <option value="">Select your marital status</option>
              {MARITAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {MARITAL_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            {errors.maritalStatus && (
              <span className="text-xs text-red-600">{errors.maritalStatus}</span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-wa-icon">City</span>
            {/*
              Grouped by province: over two hundred options in one flat list is
              unreadable, and a native <select> gives the phone's own picker,
              which is easier to scroll than anything drawn here.
            */}
            <select
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              aria-label="City"
              className={field("city")}
            >
              <option value="">Select your city</option>
              {PAKISTAN_CITY_GROUPS.map((group) => (
                <optgroup key={group.province} label={group.province}>
                  {group.cities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </optgroup>
              ))}
              <option value={OTHER_CITY}>{OTHER_CITY}</option>
            </select>
            {errors.city && <span className="text-xs text-red-600">{errors.city}</span>}
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 rounded-full bg-wa-green px-3 py-2.5 text-sm font-medium text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Connecting…" : "Start chat"}
          </button>
        </div>
      )}
    </form>
  );
}
