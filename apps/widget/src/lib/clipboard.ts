/**
 * Copying a message's text.
 *
 * The bubble suppresses the browser's own long-press menu on a touch screen —
 * it opens the reactions instead — so the copy the phone would have offered has
 * to be offered back, which is what this is for.
 *
 * The modern API needs a secure context, and the widget runs on other people's
 * sites: one of them will be plain http. The old `execCommand` path is the
 * fallback, and it still works everywhere that matters.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Falls through to the fallback below.
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    // Off-screen but still focusable: a hidden or display:none field cannot be
    // selected, and a visible one would flash.
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}
