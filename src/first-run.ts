// The one question Tolk asks: the reader's own language. The card doesn't block
// anything, so the text stays readable behind it, and only Continue saves and
// closes it. L2 is never asked for here, because it's detected per document.

import { requireElement, requireSelect } from "./controls.js";
import { getOwnLanguage } from "./document-language.js";
import { languageOptions, TRANSLATION_LANGUAGES } from "./languages.js";
import { getSettings, isOneOf, subscribe, updateSettings } from "./state.js";

/** Runs after the page is revealed, because a hidden element can't take focus. */
export function mountFirstRun(): void {
  const card = requireElement("first-run");
  const select = requireSelect("first-run-language");
  select.replaceChildren(...languageOptions());
  select.value = getOwnLanguage();

  requireElement("first-run-continue").addEventListener("click", () => {
    if (isOneOf(TRANSLATION_LANGUAGES, select.value)) {
      updateSettings({ ownLanguage: select.value });
    }
  });

  // Also closes it if the reader answers in another tab.
  subscribe(({ ownLanguage }) => {
    card.hidden = ownLanguage !== null;
  });

  if (getSettings().ownLanguage === null) {
    select.focus({ preventScroll: true });
  }
}
