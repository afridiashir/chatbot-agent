/**
 * Light until someone chooses otherwise: the agent inbox shares this setting
 * and was designed light-first, so nobody is switched to dark by their OS alone.
 */
export type ThemePreference = "light" | "dark" | "system";

const KEY = "acme-dashboard:theme";

/**
 * Runs inline in <head> before first paint, so a dark-mode reader never sees a
 * white flash while React loads. Kept as a string because it cannot import.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem("${KEY}")||"light";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export function getThemePreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "dark" || value === "system" ? value : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(preference: ThemePreference): void {
  const dark =
    preference === "dark" ||
    (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(KEY, preference);
  } catch {
    // The choice still applies until reload.
  }
  applyTheme(preference);
}
