import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRIES, flagFor, joinPhone, splitPhone, type Country } from "@repo/types";

/**
 * A phone number with its country beside it.
 *
 * The number is how a visitor is identified, so it has to be unambiguous: a
 * country picker makes the code explicit rather than hoping someone types it,
 * and it strips the trunk zero on the way out, so `0300 1234567` under +92 and
 * `3001234567` land on the same person.
 *
 * It hands the caller the full international number, which is the only form
 * anything downstream deals with.
 */
export function PhoneField({
  value,
  invalid,
  onChange,
  onEnter,
}: {
  /** The full international number, or empty to start. */
  value: string;
  invalid?: boolean;
  onChange: (phone: string) => void;
  onEnter?: () => void;
}) {
  // Split once, on the first render only: re-splitting as they type would fight
  // the country they have picked.
  const [country, setCountry] = useState<Country>(() => splitPhone(value).country);
  const [national, setNational] = useState(() => splitPhone(value).national);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const numberRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The caller is told the composed number, never the halves.
  useEffect(() => {
    onChange(joinPhone(country, national));
    // `onChange` is an inline arrow in every caller; depending on it would run
    // this on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, national]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/^\+/, "");
    if (!needle) return COUNTRIES;
    return COUNTRIES.filter(
      (row) => row.name.toLowerCase().includes(needle) || row.dial.startsWith(needle),
    );
  }, [query]);

  function pick(next: Country) {
    setCountry(next);
    setOpen(false);
    setQuery("");
    numberRef.current?.focus();
  }

  return (
    <div className="relative">
      <div
        className={`flex items-stretch overflow-hidden rounded-lg border bg-white ${
          invalid ? "border-red-400" : "border-wa-divider focus-within:border-wa-green"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={`Country: ${country.name}, +${country.dial}`}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="flex shrink-0 items-center gap-1 border-r border-wa-divider px-2.5 text-sm text-wa-text transition hover:bg-black/[0.03]"
        >
          {/* Windows has no flag glyphs and draws the two letters instead,
              which still says which country. */}
          <span className="text-base leading-none">{flagFor(country.iso)}</span>
          <span className="tabular-nums">+{country.dial}</span>
          <svg viewBox="0 0 24 24" className="h-3 w-3 text-wa-meta" fill="currentColor" aria-hidden>
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </button>

        <input
          ref={numberRef}
          value={national}
          onChange={(event) => setNational(event.target.value.replace(/[^0-9\s-]/g, ""))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && onEnter) {
              event.preventDefault();
              onEnter();
            }
          }}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          enterKeyHint="go"
          placeholder="300 1234567"
          aria-label="Phone number"
          aria-invalid={invalid ? true : undefined}
          className="w-full min-w-0 bg-transparent px-3 py-2 text-base text-wa-text placeholder:text-wa-meta/70 focus:outline-none sm:text-sm"
        />
      </div>

      {open && (
        <div
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-wa-divider bg-white shadow-[0_4px_16px_rgb(11_20_26/0.18)]"
          onMouseDown={() => clearTimeout(blurTimer.current)}
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 150);
            }}
            autoFocus
            placeholder="Search country or code"
            aria-label="Search country"
            className="w-full border-b border-wa-divider px-3 py-2 text-sm text-wa-text placeholder:text-wa-meta/70 focus:outline-none"
          />
          <ul role="listbox" className="max-h-52 overflow-y-auto overscroll-contain py-1">
            {matches.map((row) => (
              <li key={`${row.iso}-${row.dial}`}>
                <button
                  type="button"
                  onClick={() => pick(row)}
                  aria-selected={row.iso === country.iso}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-wa-text hover:bg-black/5 ${
                    row.iso === country.iso ? "bg-black/[0.04]" : ""
                  }`}
                >
                  <span className="text-base leading-none">{flagFor(row.iso)}</span>
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="shrink-0 tabular-nums text-wa-meta">+{row.dial}</span>
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li className="px-3 py-2 text-sm text-wa-meta">No country matches that</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
