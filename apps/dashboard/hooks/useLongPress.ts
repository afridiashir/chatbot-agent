"use client";

import { useRef } from "react";

const DELAY = 450;
/** Moving this far means the finger is scrolling or swiping, not holding. */
const SLOP = 10;

/**
 * Press and hold on a touch screen, the way WhatsApp opens a message's
 * reactions. Mouse presses are ignored: on a desktop the same thing is one
 * hover away.
 */
export function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const from = useRef<{ x: number; y: number } | null>(null);

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    from.current = null;
  };

  return {
    onTouchStart: (event: React.TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      from.current = { x: touch.clientX, y: touch.clientY };
      timer.current = setTimeout(() => {
        onLongPress();
        navigator.vibrate?.(12);
        cancel();
      }, DELAY);
    },
    onTouchMove: (event: React.TouchEvent) => {
      const touch = event.touches[0];
      const start = from.current;
      if (!touch || !start) return;
      if (Math.abs(touch.clientX - start.x) > SLOP || Math.abs(touch.clientY - start.y) > SLOP) {
        cancel();
      }
    },
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}
