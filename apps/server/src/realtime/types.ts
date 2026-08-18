import type { Server, Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@repo/types";
import type { Actor } from "../lib/actor.js";

/** Nothing is exchanged between server instances — there is only one. */
type InterServerEvents = Record<never, never>;

/** The resolved caller is stashed on `socket.data` at handshake time. */
export type SocketData = Actor;

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;
