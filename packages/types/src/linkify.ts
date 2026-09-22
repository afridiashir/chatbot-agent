import { normalizePhone } from "./visitor-profile";

/**
 * Finding the links and phone numbers inside a message someone typed.
 *
 * People paste an address or type a number mid-sentence and expect it to be
 * tappable, the way it is in WhatsApp. Nothing is stored differently for this —
 * the message is plain text in the database, and this runs when it is drawn, so
 * it applies to the whole history rather than only to messages sent from now on.
 *
 * Both the widget and the dashboard render from these tokens, so a number that
 * is a link for the visitor is a link for the agent too. The rendering itself
 * is deliberately not here: the two apps style their bubbles separately.
 */
export type MessageToken =
  | { kind: "text"; text: string }
  /** A web address or an email. `href` is always http(s) or mailto. */
  | { kind: "link"; text: string; href: string }
  /** A phone number, offered as a call or a WhatsApp chat. */
  | { kind: "phone"; text: string; tel: string; whatsapp: string };

/**
 * Bare domains (`ikonicdistro.com`, with no `https://` or `www.`) are only
 * linked when they end in one of these.
 *
 * Without the list, ordinary prose becomes links: a missing space after a full
 * stop makes "sale.Order now" look exactly like a domain. Anything written with
 * a scheme or a `www.` is linked whatever its ending, so a rare TLD is never
 * unreachable — it just has to be written in full.
 */
const LINKED_TLDS = new Set(
  // Global, then the ones this product actually sees: Pakistan and the Gulf.
  `com net org edu gov mil int info biz pro name mobi app dev io ai co me tv cc ly xyz
   shop store online site live blog club fun link space tech work world news media agency
   pk ae sa qa kw om bh jo lb iq ir af in bd lk np cn jp kr hk tw sg my th vn ph id
   uk de fr es it nl be ch at se no dk fi pl pt gr ru ua tr il eg ma dz tn
   us ca mx br ar au nz za ng ke gh tz ug`.split(/\s+/),
);

/**
 * One pass over the text. The order matters: an email would otherwise be read
 * as a domain, and the digits inside an address as a phone number.
 */
const PATTERN = new RegExp(
  [
    // someone@example.com
    "(?<email>[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,24})",
    // https://example.com/path  or  www.example.com/path
    "(?<url>(?:https?:\\/\\/|www\\.)\\S+)",
    // example.com/path — checked against LINKED_TLDS below
    "(?<domain>[A-Za-z0-9][A-Za-z0-9-]*(?:\\.[A-Za-z0-9-]+)*\\.[A-Za-z]{2,24}(?:\\/\\S*)?)",
    // +92 300 1234567, 0300-1234567, 03001234567
    "(?<phone>(?:\\+|00)?\\d[\\d \\-().]{7,18}\\d)",
  ].join("|"),
  "g",
);

/**
 * Punctuation that ends a sentence rather than the address inside it. Matched
 * one character at a time, so `…/Foo_(bar))` can give up the sentence's bracket
 * while keeping the path's.
 */
const TRAILING = /[.,;:!?'"»)\]}>]$/;

/**
 * Trims the sentence's punctuation off the end of a match.
 *
 * A closing bracket is kept when the address opened one — `…/Foo_(bar)` is a
 * real path, and cutting it gives a link that 404s.
 */
function trimTrailing(match: string): string {
  let out = match;
  for (;;) {
    const trimmed = out.replace(TRAILING, "");
    if (trimmed === out) return out;
    const dropped = out.slice(trimmed.length);
    if (dropped === ")" && countOf(trimmed, "(") > countOf(trimmed, ")")) return out;
    if (dropped === "]" && countOf(trimmed, "[") > countOf(trimmed, "]")) return out;
    out = trimmed;
    if (!out) return out;
  }
}

const countOf = (value: string, char: string) => value.split(char).length - 1;

/**
 * Whether a match stands on its own rather than sitting inside a longer word.
 * Without this, the tail of an order number (`ORD-1234567890`) or of a handle
 * (`@someone.com`) would be picked up as something to tap.
 */
function standsAlone(text: string, start: number, end: number): boolean {
  const before = text[start - 1];
  const after = text[end];
  const glued = /[A-Za-z0-9@._\-/+]/;
  return !(before && glued.test(before)) && !(after && /[A-Za-z0-9@._\-/]/.test(after));
}

/**
 * A phone number as opposed to any other run of digits.
 *
 * Ten to fifteen digits is the range of a real number once the separators are
 * gone: a local mobile written `0300 1234567` is eleven, the same number with
 * its country code is twelve, and E.164 allows no more than fifteen. Shorter
 * runs are dates, prices and quantities; longer ones are order and tracking
 * numbers. Two numbers written on one line with only a space between them read
 * as a single over-long run and are left as text — put them on separate lines.
 */
function phoneToken(match: string): MessageToken | null {
  const digits = match.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;

  // `+` is only a country code at the very start; `1+2=3` is not a number.
  if (match.includes("+") && !match.startsWith("+")) return null;

  const international = normalizePhone(match);
  return {
    kind: "phone",
    text: match,
    tel: `tel:+${international}`,
    whatsapp: `https://wa.me/${international}`,
  };
}

/**
 * Splits a message into what to draw as plain text and what to make tappable.
 *
 * Always returns the whole message: every character of the input appears in
 * exactly one token, so rendering the tokens in order reproduces it verbatim.
 * A message with nothing to link comes back as a single text token.
 */
export function linkify(content: string): MessageToken[] {
  const tokens: MessageToken[] = [];
  let cursor = 0;

  const pushText = (text: string) => {
    if (!text) return;
    const last = tokens[tokens.length - 1];
    if (last?.kind === "text") last.text += text;
    else tokens.push({ kind: "text", text });
  };

  PATTERN.lastIndex = 0;
  for (let match = PATTERN.exec(content); match; match = PATTERN.exec(content)) {
    const groups = match.groups ?? {};
    const raw = match[0];
    const start = match.index;

    const token = tokenFor(groups, raw, content, start);
    if (!token) continue;

    // `trimTrailing` may have shortened the match, so the scan resumes at the
    // end of what was actually linked rather than at the end of the match.
    const end = start + token.text.length;
    pushText(content.slice(cursor, start));
    tokens.push(token);
    cursor = end;
    PATTERN.lastIndex = end;
  }

  pushText(content.slice(cursor));
  return tokens;
}

function tokenFor(
  groups: Record<string, string | undefined>,
  raw: string,
  content: string,
  start: number,
): MessageToken | null {
  if (!standsAlone(content, start, start + raw.length)) return null;

  if (groups.email) {
    const text = trimTrailing(raw);
    return { kind: "link", text, href: `mailto:${text}` };
  }

  if (groups.url) {
    const text = trimTrailing(raw);
    if (!text) return null;
    // `www.` carries no scheme, and a link without one resolves against the
    // page it was clicked on rather than going anywhere.
    const href = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    return { kind: "link", text, href };
  }

  if (groups.domain) {
    const text = trimTrailing(raw);
    const host = text.split("/")[0] ?? "";
    const tld = host.slice(host.lastIndexOf(".") + 1).toLowerCase();
    if (!LINKED_TLDS.has(tld)) return null;
    return { kind: "link", text, href: `https://${text}` };
  }

  if (groups.phone) return phoneToken(trimTrailing(raw));

  return null;
}

/** True when there is anything in the message worth making tappable. */
export const hasLinks = (content: string): boolean =>
  linkify(content).some((token) => token.kind !== "text");
