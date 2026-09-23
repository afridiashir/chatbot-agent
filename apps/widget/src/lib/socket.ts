import type { Socket } from "socket.io-client";

/**
 * Keeping the chat's socket alive when the server refuses the handshake.
 *
 * Socket.IO retries a dropped connection by itself, but not one the server
 * turned away: `socket.active` is false and nothing more happens, leaving the
 * chat open on screen but unable to send. A visitor has no "sign out and back
 * in" to fall back on, so reconnecting matters more here than anywhere.
 *
 * The server says whether trying again is worth it (`retryable` on the error).
 *
 * Returns a teardown for the effect that created the socket.
 */
export function keepConnected(
  socket: Socket,
  handlers: {
    /** A retry is scheduled; the chat is offline until it lands. */
    onRetrying?: (attempt: number) => void;
    /** Nothing will reconnect on its own. */
    onRejected?: (message: string) => void;
  },
): () => void {
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onConnect = () => {
    attempt = 0;
    clearTimeout(timer);
  };

  const onError = (error: Error & { data?: { retryable?: boolean } }) => {
    // Still active: a transport hiccup, which Socket.IO is already retrying.
    if (socket.active) return;

    if (error.data?.retryable === false) {
      handlers.onRejected?.(error.message);
      return;
    }

    attempt += 1;
    handlers.onRetrying?.(attempt);
    const delay = Math.min(30_000, 1000 * 2 ** (attempt - 1));
    clearTimeout(timer);
    timer = setTimeout(() => socket.connect(), delay);
  };

  socket.on("connect", onConnect);
  socket.on("connect_error", onError);

  return () => {
    clearTimeout(timer);
    socket.off("connect", onConnect);
    socket.off("connect_error", onError);
  };
}
