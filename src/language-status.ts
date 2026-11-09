// The drawer's language section. It only shows state owned elsewhere, and the
// drawer is an overlay, so nothing here can move the text (invariant 5).

import { requireElement, requireSelect } from "./controls.js";
import { openDrawer } from "./drawer.js";
import {
  chooseLanguage,
  detectionStatus,
  getDetectedLanguage,
  getLanguage,
  getLanguageOrigin,
  getOwnLanguage,
  isDetecting,
  hasTranslationPair,
  subscribeLanguage,
  translationStatus,
  useDetectedLanguage,
} from "./document-language.js";
import { languageName, languageOptions, TRANSLATION_LANGUAGES } from "./languages.js";
import { isOneOf, subscribe, updateSettings } from "./state.js";
import { areVoicesLoaded, availableVoices, subscribeVoices } from "./voices.js";

const INTERNALS_NOTE = "chrome://on-device-internals shows what this device can do.";
const DOWNLOAD_FAILED = "Download didn't finish";
/** The dropdown's value for "Use detected language" and for its placeholder. */
const NO_CHOICE = "";

export function mountLanguageStatus(): void {
  mountChooser();
  mountOwnLanguage();
  subscribeLanguage(renderStatus);
  subscribeVoices(renderStatus);
  translationStatus.subscribe(renderStatus);
  renderStatus();
}

/** Opens the drawer on the language dropdown, for the player's Choose button. */
export function openLanguageChooser(): void {
  openDrawer();
  setChooserOpen(true);
  requireElement("language-select").focus();
}

function mountChooser(): void {
  const button = requireElement("language-change");
  button.addEventListener("click", () => {
    const open = requireElement("language-chooser").hidden === true;
    setChooserOpen(open);
    if (open) {
      requireElement("language-select").focus();
    }
  });
  languageSelect().addEventListener("change", () => {
    const { value } = languageSelect();
    setChooserOpen(false);
    button.focus();
    if (value === NO_CHOICE) {
      useDetectedLanguage();
    } else {
      chooseLanguage(value);
    }
  });
}

function setChooserOpen(open: boolean): void {
  requireElement("language-chooser").hidden = !open;
  requireElement("language-change").setAttribute("aria-expanded", String(open));
}

function mountOwnLanguage(): void {
  const select = requireSelect("own-language");
  select.replaceChildren(...languageOptions());
  select.addEventListener("change", () => {
    if (isOneOf(TRANSLATION_LANGUAGES, select.value)) {
      updateSettings({ ownLanguage: select.value });
    }
  });
  subscribe(() => {
    select.value = getOwnLanguage();
  });
}

function renderStatus(): void {
  const language = getLanguage();
  renderLanguageLine(language);
  renderChooserOptions(language);
  renderDetection(language);
  renderTranslation(language);
  renderVoices(language);
}

function renderLanguageLine(language: string | null): void {
  const origin = getLanguageOrigin();
  requireElement("language-label").textContent =
    language !== null
      ? `Language: ${languageName(language)} (${origin})`
      : `Language: ${isDetecting() ? "Detecting…" : "Unknown"}`;
  requireElement("language-change").textContent = language === null ? "Choose" : "Change";
}

function renderChooserOptions(language: string | null): void {
  const detected = getDetectedLanguage();
  const offersDetected = detected !== null && getLanguageOrigin() === "chosen";
  const select = languageSelect();
  renderOnce(select, `${language}|${detected}|${offersDetected}`, () => {
    const first: HTMLOptionElement[] = [];
    if (offersDetected) {
      first.push(new Option(`Use detected language (${languageName(detected)})`, NO_CHOICE));
    } else if (language === null) {
      const placeholder = new Option("Choose a language", NO_CHOICE);
      placeholder.disabled = true;
      first.push(placeholder);
    }
    return [...first, ...languageOptions(detected === null ? [] : [detected])];
  });
  select.value = language ?? NO_CHOICE;
}

/** Only matters while there's no language, since a chosen one makes detection unneeded. */
function renderDetection(language: string | null): void {
  const element = requireElement("detection-status");
  const { state, progress, failed } = detectionStatus.status();
  const showing = language === null && !isDetecting() && state !== "available";
  element.hidden = !showing;
  if (!showing) {
    return;
  }
  renderOnce(element, `${state}|${progress}|${failed}`, () => {
    if (state === "unavailable") {
      return [`Language detection isn't available on this device. ${INTERNALS_NOTE}`];
    }
    if (state === "downloading") {
      return [`Downloading language detection${progressText(progress)}`];
    }
    return failed
      ? [`${DOWNLOAD_FAILED} `, downloadButton("Try again", () => detectionStatus.download())]
      : [downloadButton("Download language detection", () => detectionStatus.download())];
  });
}

/** Hidden when L2 is Unknown or equals L1, with no message. */
function renderTranslation(language: string | null): void {
  const row = requireElement("translation-row");
  const value = requireElement("translation-status");
  const note = requireElement("translation-note");
  const own = getOwnLanguage();
  const { state, progress, failed } = translationStatus.status();
  const hidden = !hasTranslationPair();
  row.hidden = hidden;

  note.hidden = hidden || state !== "unavailable";
  if (!note.hidden && language !== null) {
    note.textContent = `Translation from ${languageName(language)} to ${languageName(own)} isn't available on this device. ${INTERNALS_NOTE}`;
  }

  renderOnce(value, `${state}|${progress}|${failed}`, () => {
    switch (state) {
      case "checking":
        return ["Checking…"];
      case "available":
        return ["Ready"];
      case "unavailable":
        return ["Not available"];
      case "downloading":
        return [`Downloading${progressText(progress)}`];
      case "downloadable":
        return failed
          ? [`${DOWNLOAD_FAILED} `, downloadButton("Try again", () => translationStatus.download())]
          : ["Needs download ", downloadButton("Download", () => translationStatus.download())];
    }
  });
}

function renderVoices(language: string | null): void {
  requireElement("voices-row").hidden = language === null;
  requireElement("voices-status").textContent = describeVoices();
}

function describeVoices(): string {
  if (!areVoicesLoaded()) {
    return "Checking…";
  }
  const voices = availableVoices();
  const local = voices.filter((voice) => voice.localService).length;
  const remote = voices.length - local;
  if (voices.length === 0) {
    return "No voices";
  }
  if (local === 0) {
    return `${remote} remote`;
  }
  const localText = `${local} local ${local === 1 ? "voice" : "voices"}`;
  return remote === 0 ? localText : `${localText}, ${remote} remote`;
}

function progressText(progress: number | null): string {
  return progress === null ? "…" : ` ${Math.round(progress * 100)}%`;
}

function downloadButton(label: string, start: () => Promise<void>): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link-button";
  button.textContent = label;
  button.addEventListener("click", () => {
    // This button is about to be replaced, and focus shouldn't vanish with it.
    requireElement("settings-drawer").focus();
    void start();
  });
  return button;
}

/** Skips a rebuild when nothing changed, so a focused button isn't replaced under the reader. */
function renderOnce(element: HTMLElement, key: string, build: () => (Node | string)[]): void {
  if (element.dataset["shown"] !== key) {
    element.dataset["shown"] = key;
    element.replaceChildren(...build());
  }
}

function languageSelect(): HTMLSelectElement {
  return requireSelect("language-select");
}
