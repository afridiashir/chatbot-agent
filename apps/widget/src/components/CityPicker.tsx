import { useMemo, useRef, useState } from "react";
import { PAKISTAN_CITY_GROUPS } from "@repo/types";

/**
 * A city, typed rather than scrolled for.
 *
 * There are over two hundred on the list, which is more than anyone wants to
 * scroll on a phone, so this filters as they type. Whatever they type stands on
 * its own if nothing matches: somebody from a town that is not on the list has
 * to be able to say where they are from, and turning them away over it would
 * cost a customer to keep a filter tidy.
 *
 * The suggestions are still the list, so the overwhelming majority of answers
 * land on the same spelling and the admin's filter keeps working.
 */
export function CityPicker({
  value,
  invalid,
  onChange,
}: {
  value: string;
  invalid?: boolean;
  onChange: (city: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const all = PAKISTAN_CITY_GROUPS.flatMap((group) =>
      group.cities.map((city) => ({ city, province: group.province })),
    );
    if (!needle) return all.slice(0, 40);
    // What they typed at the front of a name beats it appearing in the middle,
    // so "kar" offers Karachi before Bhakkar. Within each group the shorter
    // name wins, which is a decent stand-in for the better-known one: "kar"
    // should reach Karachi before Karor Lal Esan.
    const byName = (a: { city: string }, b: { city: string }) =>
      a.city.length - b.city.length || a.city.localeCompare(b.city);
    const starts = all.filter((row) => row.city.toLowerCase().startsWith(needle)).sort(byName);
    const contains = all
      .filter(
        (row) =>
          !row.city.toLowerCase().startsWith(needle) && row.city.toLowerCase().includes(needle),
      )
      .sort(byName);
    return [...starts, ...contains].slice(0, 40);
  }, [query]);

  const typed = query.trim();
  const exact = matches.some((row) => row.city.toLowerCase() === typed.toLowerCase());

  function choose(city: string) {
    setQuery(city);
    onChange(city);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          // Kept in step as they type, so a name we do not have on the list is
          // still their answer if they stop there.
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Deferred: a click on a suggestion blurs the input before it lands.
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" && open) {
            event.preventDefault();
            choose(matches[0]?.city ?? typed);
          }
        }}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label="City"
        placeholder="Start typing your city"
        className={`w-full rounded-lg border bg-white px-3 py-2 text-base text-wa-text placeholder:text-wa-meta/70 focus:outline-none sm:text-sm ${
          invalid ? "border-red-400" : "border-wa-divider focus:border-wa-green"
        }`}
      />

      {open && (
        <ul
          role="listbox"
          // Above the keyboard's reach on a phone, and over the fields below it.
          className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto overscroll-contain rounded-lg border border-wa-divider bg-white py-1 shadow-[0_4px_16px_rgb(11_20_26/0.18)]"
          onMouseDown={() => clearTimeout(blurTimer.current)}
        >
          {matches.map((row) => (
            <li key={`${row.province}-${row.city}`}>
              <button
                type="button"
                onClick={() => choose(row.city)}
                className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm text-wa-text hover:bg-black/5"
              >
                <span>{row.city}</span>
                <span className="shrink-0 text-[11px] text-wa-meta">{row.province}</span>
              </button>
            </li>
          ))}

          {/* Last, not first: the list is what nearly everyone wants, and a
              town that is not on it is still their answer. */}
          {typed.length >= 2 && !exact && (
            <li>
              <button
                type="button"
                onClick={() => choose(typed)}
                className="flex w-full items-center gap-2 border-t border-wa-divider px-3 py-2 text-left text-sm text-wa-text hover:bg-black/5"
              >
                <span className="text-wa-green">+</span>
                Use &ldquo;{typed}&rdquo;
              </button>
            </li>
          )}

          {matches.length === 0 && typed.length < 2 && (
            <li className="px-3 py-2 text-sm text-wa-meta">Type to search</li>
          )}
        </ul>
      )}
    </div>
  );
}
