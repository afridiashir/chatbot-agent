import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Acme Corp",
  description: "Company website with live branch support chat",
};

/**
 * The widget bundle is copied into `public/` at build time by
 * `scripts/sync-widget.mjs`, so it is served from this site's own origin —
 * exactly how a customer would embed it.
 *
 * Only public identifiers are passed. The widget runs on a page we do not
 * control, so no secret may ever appear here.
 */
const WIDGET_URL = process.env.NEXT_PUBLIC_WIDGET_URL ?? "/widget.js";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <Script
          src={WIDGET_URL}
          strategy="afterInteractive"
          data-acme-chat=""
          data-api-url={API_URL}
        />
      </body>
    </html>
  );
}
