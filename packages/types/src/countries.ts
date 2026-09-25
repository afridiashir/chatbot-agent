/**
 * Countries as a phone field needs them: what to call them, what to dial, and
 * enough to draw a flag.
 *
 * Only the dialling code is kept, not the national formats — those differ per
 * carrier and change, and getting them wrong refuses real customers. The rule
 * in `phoneProblem` is the one that decides what is acceptable.
 *
 * Ordered with Pakistan first, then the countries this business actually hears
 * from, then the rest alphabetically. A picker is only useful if the answer is
 * near the top for most people.
 */
export interface Country {
  /** ISO 3166-1 alpha-2, which is also what the flag is derived from. */
  iso: string;
  name: string;
  /** Digits only, without the plus. */
  dial: string;
}

export const COUNTRIES: readonly Country[] = [
  { iso: "PK", name: "Pakistan", dial: "92" },
  { iso: "AE", name: "United Arab Emirates", dial: "971" },
  { iso: "SA", name: "Saudi Arabia", dial: "966" },
  { iso: "GB", name: "United Kingdom", dial: "44" },
  { iso: "US", name: "United States", dial: "1" },
  { iso: "CA", name: "Canada", dial: "1" },
  { iso: "QA", name: "Qatar", dial: "974" },
  { iso: "OM", name: "Oman", dial: "968" },
  { iso: "KW", name: "Kuwait", dial: "965" },
  { iso: "BH", name: "Bahrain", dial: "973" },
  { iso: "AU", name: "Australia", dial: "61" },
  { iso: "MY", name: "Malaysia", dial: "60" },
  { iso: "AF", name: "Afghanistan", dial: "93" },
  { iso: "AL", name: "Albania", dial: "355" },
  { iso: "DZ", name: "Algeria", dial: "213" },
  { iso: "AR", name: "Argentina", dial: "54" },
  { iso: "AM", name: "Armenia", dial: "374" },
  { iso: "AT", name: "Austria", dial: "43" },
  { iso: "AZ", name: "Azerbaijan", dial: "994" },
  { iso: "BD", name: "Bangladesh", dial: "880" },
  { iso: "BY", name: "Belarus", dial: "375" },
  { iso: "BE", name: "Belgium", dial: "32" },
  { iso: "BR", name: "Brazil", dial: "55" },
  { iso: "BG", name: "Bulgaria", dial: "359" },
  { iso: "KH", name: "Cambodia", dial: "855" },
  { iso: "CM", name: "Cameroon", dial: "237" },
  { iso: "CL", name: "Chile", dial: "56" },
  { iso: "CN", name: "China", dial: "86" },
  { iso: "CO", name: "Colombia", dial: "57" },
  { iso: "HR", name: "Croatia", dial: "385" },
  { iso: "CY", name: "Cyprus", dial: "357" },
  { iso: "CZ", name: "Czechia", dial: "420" },
  { iso: "DK", name: "Denmark", dial: "45" },
  { iso: "EG", name: "Egypt", dial: "20" },
  { iso: "ET", name: "Ethiopia", dial: "251" },
  { iso: "FI", name: "Finland", dial: "358" },
  { iso: "FR", name: "France", dial: "33" },
  { iso: "GE", name: "Georgia", dial: "995" },
  { iso: "DE", name: "Germany", dial: "49" },
  { iso: "GH", name: "Ghana", dial: "233" },
  { iso: "GR", name: "Greece", dial: "30" },
  { iso: "HK", name: "Hong Kong", dial: "852" },
  { iso: "HU", name: "Hungary", dial: "36" },
  { iso: "IN", name: "India", dial: "91" },
  { iso: "ID", name: "Indonesia", dial: "62" },
  { iso: "IR", name: "Iran", dial: "98" },
  { iso: "IQ", name: "Iraq", dial: "964" },
  { iso: "IE", name: "Ireland", dial: "353" },
  { iso: "IL", name: "Israel", dial: "972" },
  { iso: "IT", name: "Italy", dial: "39" },
  { iso: "JP", name: "Japan", dial: "81" },
  { iso: "JO", name: "Jordan", dial: "962" },
  { iso: "KZ", name: "Kazakhstan", dial: "7" },
  { iso: "KE", name: "Kenya", dial: "254" },
  { iso: "KR", name: "South Korea", dial: "82" },
  { iso: "KG", name: "Kyrgyzstan", dial: "996" },
  { iso: "LB", name: "Lebanon", dial: "961" },
  { iso: "LY", name: "Libya", dial: "218" },
  { iso: "MV", name: "Maldives", dial: "960" },
  { iso: "MU", name: "Mauritius", dial: "230" },
  { iso: "MX", name: "Mexico", dial: "52" },
  { iso: "MA", name: "Morocco", dial: "212" },
  { iso: "MM", name: "Myanmar", dial: "95" },
  { iso: "NP", name: "Nepal", dial: "977" },
  { iso: "NL", name: "Netherlands", dial: "31" },
  { iso: "NZ", name: "New Zealand", dial: "64" },
  { iso: "NG", name: "Nigeria", dial: "234" },
  { iso: "NO", name: "Norway", dial: "47" },
  { iso: "PS", name: "Palestine", dial: "970" },
  { iso: "PH", name: "Philippines", dial: "63" },
  { iso: "PL", name: "Poland", dial: "48" },
  { iso: "PT", name: "Portugal", dial: "351" },
  { iso: "RO", name: "Romania", dial: "40" },
  { iso: "RU", name: "Russia", dial: "7" },
  { iso: "RS", name: "Serbia", dial: "381" },
  { iso: "SG", name: "Singapore", dial: "65" },
  { iso: "SK", name: "Slovakia", dial: "421" },
  { iso: "ZA", name: "South Africa", dial: "27" },
  { iso: "ES", name: "Spain", dial: "34" },
  { iso: "LK", name: "Sri Lanka", dial: "94" },
  { iso: "SD", name: "Sudan", dial: "249" },
  { iso: "SE", name: "Sweden", dial: "46" },
  { iso: "CH", name: "Switzerland", dial: "41" },
  { iso: "SY", name: "Syria", dial: "963" },
  { iso: "TW", name: "Taiwan", dial: "886" },
  { iso: "TZ", name: "Tanzania", dial: "255" },
  { iso: "TH", name: "Thailand", dial: "66" },
  { iso: "TN", name: "Tunisia", dial: "216" },
  { iso: "TR", name: "Türkiye", dial: "90" },
  { iso: "UG", name: "Uganda", dial: "256" },
  { iso: "UA", name: "Ukraine", dial: "380" },
  { iso: "UZ", name: "Uzbekistan", dial: "998" },
  { iso: "VN", name: "Vietnam", dial: "84" },
  { iso: "YE", name: "Yemen", dial: "967" },
];

/** Where the field starts, and what an unrecognised number is read as. */
export const DEFAULT_COUNTRY = COUNTRIES[0]!;

/**
 * The flag, built from the country code rather than stored.
 *
 * Two regional indicator letters, which a phone draws as a flag. Windows has
 * no flag glyphs and shows the letters instead — "PK" rather than 🇵🇰 — which
 * is a fair fallback: it still says which country, and nearly every visitor is
 * on a phone.
 */
export function flagFor(iso: string): string {
  return [...iso.toUpperCase()]
    .map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65))
    .join("");
}

/**
 * Splits a number someone has already given us back into a country and the
 * rest, so a remembered number reopens the field the way they left it.
 *
 * The longest matching dialling code wins, because some are prefixes of others
 * (1 and 1-something, 7 for both Russia and Kazakhstan). Where two countries
 * share a code the first in the list is used — there is nothing in the number
 * itself to tell them apart.
 */
export function splitPhone(value: string): { country: Country; national: string } {
  const digits = value.replace(/[^0-9]/g, "").replace(/^00/, "");
  const candidates = [...COUNTRIES]
    .filter((country) => digits.startsWith(country.dial))
    .sort((a, b) => b.dial.length - a.dial.length);

  const country = candidates[0];
  if (!country) return { country: DEFAULT_COUNTRY, national: digits };
  return { country, national: digits.slice(country.dial.length) };
}

/**
 * A country and a national number as one international number.
 *
 * The leading zero goes: it is a trunk prefix for dialling inside a country and
 * is never part of the international form, so `0300 1234567` under +92 is
 * `+92 3001234567` rather than `+92 03001234567`.
 */
export function joinPhone(country: Country, national: string): string {
  const digits = national.replace(/[^0-9]/g, "").replace(/^0+/, "");
  return digits ? `+${country.dial} ${digits}` : "";
}
