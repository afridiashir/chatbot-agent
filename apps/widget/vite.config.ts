import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The widget builds to a single self-mounting IIFE (`dist/widget.js`) that any
 * page can drop in with one script tag. `index.html` stays available for local
 * development so the widget can be worked on standalone.
 */
export default defineConfig({
  /*
   * A library build does not substitute `process.env.NODE_ENV` the way an app
   * build does, and React plus socket.io-client both read it — leaving it
   * unreplaced throws "process is not defined" in the browser.
   */
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.emit": "undefined",
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      // The hosted chat page lives at /chat in production (deploy/chat.html,
      // served by Caddy). Serve the dev copy at the same address.
      name: "chat-page",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === "/chat" || req.url?.startsWith("/chat?")) {
            req.url = req.url.replace("/chat", "/chat.html");
          }
          next();
        });
      },
    },
  ],
  // `index.html` is the standalone development harness for the widget itself;
  // the company site consumes the built bundle instead (see apps/web).
  server: { cors: true },
  build: {
    lib: {
      entry: "src/embed.tsx",
      name: "AcmeChatWidget",
      formats: ["iife"],
      fileName: () => "widget.js",
    },
    // CSS is inlined into the bundle via `?inline`, so no stylesheet is emitted.
    cssCodeSplit: false,
  },
});
