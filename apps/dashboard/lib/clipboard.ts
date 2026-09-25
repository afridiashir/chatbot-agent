/**
 * Copying a message's text.
 *
 * A long press on a touch screen opens the reactions rather than the browser's
 * own menu, so the copy that menu would have offered has to be offered back,
 * which is what this is for.
 *
 * The modern API needs a secure context; the dashboard is served over https, but
 * the old `execCommand` path costs a dozen lines and covers an agent on a
 * machine that is not, or an old browser.
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
