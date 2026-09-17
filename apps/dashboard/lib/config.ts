export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Where widget.js and the hosted /chat page are served. In production Caddy
 * serves both from the API domain; in development the widget's Vite server.
 */
export const WIDGET_BASE_URL = process.env.NEXT_PUBLIC_WIDGET_BASE_URL ?? "http://localhost:3002";
