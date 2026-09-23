import type { Socket } from "socket.io-client";

/**
 * Keeping a socket alive when the server refuses the handshake.
 *
 * Socket.IO retries a dropped connection by itself, but not one the server
 * turned away: `socket.active` is false and nothing further happens, which is
 * how a dashboard ends up sitting there looking fine with a dead socket — text
 * still queues, media and voice notes do not, and only signing out and in again
 * fixes it. Reconnecting is therefore ours to do.
 *
 * What we do not do is retry forever on bad credentials. The server says which
 * it is (`retryable` on the handshake error), and an expired session is
 * reported rather than hammered at.
 *
 * Returns a teardown for the effect that created the socket.
 */
export function keepConnected(
  socket: Socket,
  handlers: {
    /** A retry is scheduled; the socket is down until it lands. */
    onRetrying?: (attempt: number) => void;
    /** The session is no longer good. Nothing will reconnect on its own. */
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
    // Backing off to half a minute: the trouble is usually over in seconds, and
    // a dashboard left open overnight must not spend the night reconnecting.
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
