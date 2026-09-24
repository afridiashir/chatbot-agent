import { useState } from "react";
import { phoneProblem } from "@repo/types";

/**
 * The door into the widget: a phone number, and nothing else.
 *
 * The number is the identity a visitor is known by, so typing it is what brings
 * back the chats they have already had — on this device or any other. There is
 * no code to enter and no account, which is a deliberate product decision and
 * the reason the lookup behind this is rate limited.
 *
 * The rule it validates against is the server's own, so a number accepted here
 * is never refused a moment later.
 */
export function PhoneGate({
  agentName,
  branchName,
  busy,
  error,
  onSubmit,
}: {
  /** Set when this is an agent's personal link, and shown in the greeting. */
  agentName?: string | null;
  branchName?: string | null;
  busy: boolean;
  error?: string | null;
  onSubmit: (phone: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const bad = phoneProblem(phone);
    setProblem(bad);
    setTouched(true);
    if (!bad) onSubmit(phone.trim());
  }

  const shown = touched ? problem : null;

  return (
    <form
      onSubmit={submit}
      className="wa-canvas flex flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {/* A greeting bubble, so this reads as the start of a chat rather than a
          sign-in page. */}
      <div className="wa-bubble-in max-w-[85%] px-3 py-2 text-sm">
        {agentName
          ? `👋 Hi, I'm ${agentName}! What's your number? I'll pull up our chat.`
          : branchName
            ? `👋 Hi! What's your number? We'll bring up your chats with our ${branchName} team.`
            : "👋 Hi! What's your number? We'll bring up your chats."}
      </div>

      <div className="flex flex-col gap-3 rounded-lg bg-white p-3 shadow-[0_1px_0.5px_rgb(11_20_26/0.13)]">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-wa-meta">Phone number</span>
          <input
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              if (touched) setProblem(phoneProblem(event.target.value));
            }}
            onBlur={() => {
              setTouched(true);
              setProblem(phoneProblem(phone));
            }}
            // `tel` brings up the number pad on a phone, which is most of them.
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="go"
            placeholder="0300 1234567"
            aria-label="Phone number"
            aria-invalid={shown ? true : undefined}
            className={`w-full rounded-lg border bg-white px-3 py-2 text-base text-wa-text placeholder:text-wa-meta/70 focus:outline-none sm:text-sm ${
              shown ? "border-red-400" : "border-wa-divider focus:border-wa-green"
            }`}
          />
          {shown && <span className="text-xs text-red-600">{shown}</span>}
        </label>

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-wa-green px-4 py-2.5 text-sm font-medium text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Looking…" : "Continue"}
        </button>

        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}

        <p className="text-[11px] leading-relaxed text-wa-meta">
          We use your number to find your chats and to reach you if the conversation drops.
        </p>
      </div>
    </form>
  );
}
