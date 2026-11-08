import { mountAppearance } from "./appearance.js";
import { loadSettings } from "./state.js";

try {
  await loadSettings();
  mountAppearance();
  // Hidden until here, so the saved colour scheme can't flash in after loading.
  await document.fonts.ready;
} finally {
  document.documentElement.dataset["ready"] = "true";
}
