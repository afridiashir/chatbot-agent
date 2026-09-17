import { useEffect, useState } from "react";

export interface Viewport {
  height: number;
  offsetTop: number;
}

/**
 * The part of the screen actually visible, which on a phone is what is left
 * above the on-screen keyboard.
 *
 * Android's Chrome shrinks the visual viewport when the keyboard opens but
 * leaves the layout viewport — and so `100dvh` — at full height, which puts
 * the message box behind the keyboard. Following `visualViewport` keeps the
 * chat inside what can be seen, on a host page whose viewport meta tag we do
 * not control as much as on our own.
 */
export function useVisualViewport(): Viewport | null {
  const [viewport, setViewport] = useState<Viewport | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      // Below this the keyboard is closed and the normal layout is right:
      // following the viewport then only fights the browser's own chrome
      // hiding and showing as the page scrolls.
      const covered = window.innerHeight - vv.height;
      setViewport(covered > 120 ? { height: vv.height, offsetTop: vv.offsetTop } : null);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return viewport;
}
