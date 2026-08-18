"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TYPING } from "@repo/types";

type Emit = (isTyping: boolean) => void;

/**
 * The sending half of the typing indicator.
 *
 * Announces once when typing starts, re-announces at most every
 * `HEARTBEAT_MS` while it continues, and announces a stop `IDLE_MS` after the
 * last keystroke. Without the throttle this would emit on every character.
 */
export function useTypingSignal(emit: Emit) {
  const typingRef = useRef(false);
  const lastSentRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    if (!typingRef.current) return;
    typingRef.current = false;
    emit(false);
  }, [emit]);

  const onActivity = useCallback(() => {
    const now = Date.now();

    if (!typingRef.current || now - lastSentRef.current > TYPING.HEARTBEAT_MS) {
      typingRef.current = true;
      lastSentRef.current = now;
      emit(true);
    }

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(stop, TYPING.IDLE_MS);
  }, [emit, stop]);

  // A component that unmounts mid-keystroke would otherwise leave the other
  // side showing "typing..." until their own expiry fires.
  useEffect(() => stop, [stop]);

  return { onActivity, stop };
}

/**
 * The receiving half. Auto-clears if the announcements stop arriving, which is
 * what covers a dropped connection or a closed tab.
 */
export function useTypingIndicator(): {
  isTyping: boolean;
  setTyping: (isTyping: boolean) => void;
} {
  const [isTyping, setIsTyping] = useState(false);
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTyping = useCallback((next: boolean) => {
    if (expiryRef.current) clearTimeout(expiryRef.current);
    expiryRef.current = null;

    setIsTyping(next);
    if (next) {
      expiryRef.current = setTimeout(() => setIsTyping(false), TYPING.EXPIRY_MS);
    }
  }, []);

  useEffect(
    () => () => {
      if (expiryRef.current) clearTimeout(expiryRef.current);
    },
    [],
  );

  return { isTyping, setTyping };
}
