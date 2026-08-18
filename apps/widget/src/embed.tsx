import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { readConfig } from "./config.js";
import { Widget } from "./Widget.js";
// `?inline` keeps the compiled CSS as a string inside the bundle, so the host
// page loads exactly one file and our reset never leaks onto their markup.
import styles from "./styles.css?inline";

const MOUNT_ID = "acme-chat-widget";

function mount(): void {
  if (document.getElementById(MOUNT_ID)) return;

  const config = readConfig();

  const host = document.createElement("div");
  host.id = MOUNT_ID;
  document.body.appendChild(host);

  // Shadow DOM isolates the widget from the embedding site's styles in both
  // directions — required once this ships onto a customer's website.
  const shadow = host.attachShadow({ mode: "open" });
  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  shadow.appendChild(styleEl);

  const container = document.createElement("div");
  shadow.appendChild(container);

  createRoot(container).render(
    <StrictMode>
      <Widget config={config} />
    </StrictMode>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
