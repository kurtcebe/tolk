// Applies the reader's settings to the page's root element, so every extension
// page shares the same colour scheme.

import { subscribe, type Scheme, type Settings } from "./state.js";

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
let currentScheme: Scheme = "auto";

export function mountAppearance(): void {
  subscribe(applySettings);
  systemDark.addEventListener("change", applyCurrentScheme);
}

function applySettings(settings: Settings): void {
  const root = document.documentElement;
  root.dataset["mode"] = settings.mode;
  root.dataset["font"] = settings.font;
  root.dataset["lineSpacing"] = settings.lineSpacing;
  root.style.setProperty("--text-size", `${settings.textSize}px`);
  currentScheme = settings.scheme;
  applyCurrentScheme();
}

function applyCurrentScheme(): void {
  document.documentElement.dataset["scheme"] = resolveScheme(currentScheme);
}

function resolveScheme(scheme: Scheme): Exclude<Scheme, "auto"> {
  if (scheme !== "auto") {
    return scheme;
  }
  return systemDark.matches ? "dark" : "light";
}
