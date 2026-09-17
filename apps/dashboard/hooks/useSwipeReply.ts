"use client";

import { useRef, useState } from "react";

/** How far the bubble may travel, and how far counts as "reply". */
const MAX = 72;
const THRESHOLD = 46;

/**
 * WhatsApp's swipe-to-reply: drag a message to the right and let go. The
 * bubble follows the finger with resistance, and only past the threshold does
 * releasing open the reply.
 *
 * A gesture that starts out mostly vertical is handed back to the scroller, so
 * swiping never fights scrolling the conversation.
 */
export function useSwipeReply(enabled: boolean, onReply: () => void) {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number; horizontal: boolean } | null>(null);

  if (!enabled) {
    return { offset: 0, swiping: false, handlers: {} as Record<string, never> };
  }

  const end = () => {
    if (offset >= THRESHOLD) {
      onReply();
      // A short tick of feedback, where the device offers it.
      navigator.vibrate?.(12);
    }
    setOffset(0);
    start.current = null;
  };

  return {
    offset,
    swiping: offset > 0,
    handlers: {
      onTouchStart: (event: React.TouchEvent) => {
        const touch = event.touches[0];
        if (touch) start.current = { x: touch.clientX, y: touch.clientY, horizontal: false };
      },
      onTouchMove: (event: React.TouchEvent) => {
        const from = start.current;
        const touch = event.touches[0];
        if (!from || !touch) return;

        const dx = touch.clientX - from.x;
        const dy = touch.clientY - from.y;
        if (!from.horizontal) {
          if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
          if (Math.abs(dx) <= Math.abs(dy)) {
            // Scrolling, not swiping.
            start.current = null;
            return;
          }
          from.horizontal = true;
        }
        setOffset(Math.max(0, Math.min(MAX, dx * 0.7)));
      },
      onTouchEnd: end,
      onTouchCancel: end,
    },
  };
}
