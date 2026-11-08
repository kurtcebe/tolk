// The one owner of reader settings. The UI reads from here and subscribes to
// changes, and only this module talks to storage.

export const MODES = ["learner", "book"] as const;
export const SCHEMES = ["auto", "light", "sepia", "dark", "dim"] as const;
export const FONTS = ["literata", "instrument"] as const;
export const LINE_SPACINGS = ["compact", "normal", "airy"] as const;
export const TEXT_SIZES = [16, 18, 20, 22, 24, 26, 28] as const;

export type Mode = (typeof MODES)[number];
export type Scheme = (typeof SCHEMES)[number];
export type Font = (typeof FONTS)[number];
export type LineSpacing = (typeof LINE_SPACINGS)[number];
export type TextSize = (typeof TEXT_SIZES)[number];

/** The lowest and highest `rate` the slider offers. 0.1 is the API's minimum. */
export const MIN_RATE = 0.1;
export const MAX_RATE = 2;

/** Remembered per language, because voices respond differently per language. */
export interface SpeechPreference {
  rate: number;
}

export interface Settings {
  mode: Mode;
  scheme: Scheme;
  font: Font;
  textSize: TextSize;
  lineSpacing: LineSpacing;
  speech: Record<string, SpeechPreference>;
}

type Listener = (settings: Settings) => void;

const STORAGE_KEY = "settings";

const DEFAULTS: Settings = {
  mode: "learner",
  scheme: "auto",
  font: "literata",
  textSize: 20,
  lineSpacing: "normal",
  speech: {},
};

const DEFAULT_SPEECH: SpeechPreference = { rate: 1 };

// A voice choice stays on this computer instead of syncing. Voices belong to the
// machine, and picking a remote voice here must not start sending text to Google
// from another computer where nobody picked it (invariant 6).
const VOICE_CHOICES_KEY = "voiceChoices";
let voiceChoices: Record<string, string> = {};

// Storage echoes a page's own writes back to it. Without this tag, a slow echo
// of an older value could undo a newer change, such as during fast stepper
// clicks. Other tabs have a different tag, so they still pick up the change.
const WRITER_ID = crypto.randomUUID();

const listeners = new Set<Listener>();
let current: Settings = DEFAULTS;

export function isOneOf<T extends string | number>(
  options: readonly T[],
  value: unknown,
): value is T {
  return options.some((option) => option === value);
}

export function getSettings(): Settings {
  return current;
}

export function subscribe(listener: Listener): void {
  listeners.add(listener);
  listener(current);
}

export function updateSettings(change: Partial<Settings>): void {
  setCurrent({ ...current, ...change });
  void saveSettings();
}

export function getSpeechPreference(language: string | null): SpeechPreference {
  return current.speech[speechKey(language)] ?? DEFAULT_SPEECH;
}

export function updateSpeechPreference(
  language: string | null,
  change: Partial<SpeechPreference>,
): void {
  const key = speechKey(language);
  updateSettings({
    speech: {
      ...current.speech,
      [key]: { ...getSpeechPreference(language), ...change },
    },
  });
}

/** The voice picked on this computer for a language, or null if none was. */
export function getVoiceChoice(language: string | null): string | null {
  return voiceChoices[speechKey(language)] ?? null;
}

export function saveVoiceChoice(language: string | null, voiceURI: string): void {
  voiceChoices = { ...voiceChoices, [speechKey(language)]: voiceURI };
  void writeVoiceChoices();
}

async function writeVoiceChoices(): Promise<void> {
  try {
    await chrome.storage.local.set({ [VOICE_CHOICES_KEY]: voiceChoices });
  } catch (error) {
    // The choice still applies to this page, so reading isn't interrupted.
    console.warn("Couldn't save the voice choice.", error);
  }
}

async function loadVoiceChoices(): Promise<void> {
  try {
    const stored: Record<string, unknown> =
      await chrome.storage.local.get(VOICE_CHOICES_KEY);
    voiceChoices = parseVoiceChoices(stored[VOICE_CHOICES_KEY]);
  } catch (error) {
    console.warn("Couldn't load voice choices, using the default voice.", error);
  }
}

function parseVoiceChoices(stored: unknown): Record<string, string> {
  if (!isRecord(stored)) {
    return {};
  }
  const choices: Record<string, string> = {};
  for (const [language, voiceURI] of Object.entries(stored)) {
    if (typeof voiceURI === "string") {
      choices[language] = voiceURI;
    }
  }
  return choices;
}

/** "nl-BE" and "nl" share a preference, because they share the same voices. */
function speechKey(language: string | null): string {
  return language?.split("-")[0]?.toLowerCase() ?? "unknown";
}

/** Loads saved settings. If storage fails, the reader still opens with defaults. */
export async function loadSettings(): Promise<void> {
  chrome.storage.sync.onChanged.addListener(handleStorageChange);
  await loadVoiceChoices();
  try {
    const stored: Record<string, unknown> =
      await chrome.storage.sync.get(STORAGE_KEY);
    setCurrent(parseSettings(stored[STORAGE_KEY]));
  } catch (error) {
    console.warn("Couldn't load settings, using defaults.", error);
  }
}

function setCurrent(settings: Settings): void {
  current = settings;
  for (const listener of listeners) {
    listener(current);
  }
}

async function saveSettings(): Promise<void> {
  try {
    await chrome.storage.sync.set({
      [STORAGE_KEY]: { ...current, writer: WRITER_ID },
    });
  } catch (error) {
    // The change still applies to this page, so reading isn't interrupted.
    console.warn("Couldn't save settings.", error);
  }
}

function handleStorageChange(changes: {
  [key: string]: chrome.storage.StorageChange;
}): void {
  const change = changes[STORAGE_KEY];
  if (change === undefined) {
    return;
  }
  const stored: unknown = change.newValue;
  if (isRecord(stored) && stored["writer"] === WRITER_ID) {
    return;
  }
  setCurrent(parseSettings(stored));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseSettings(stored: unknown): Settings {
  if (!isRecord(stored)) {
    return DEFAULTS;
  }
  return {
    mode: pick(MODES, stored["mode"], DEFAULTS.mode),
    scheme: pick(SCHEMES, stored["scheme"], DEFAULTS.scheme),
    font: pick(FONTS, stored["font"], DEFAULTS.font),
    textSize: pick(TEXT_SIZES, stored["textSize"], DEFAULTS.textSize),
    lineSpacing: pick(
      LINE_SPACINGS,
      stored["lineSpacing"],
      DEFAULTS.lineSpacing,
    ),
    speech: parseSpeech(stored["speech"]),
  };
}

function parseSpeech(stored: unknown): Record<string, SpeechPreference> {
  if (!isRecord(stored)) {
    return {};
  }
  const speech: Record<string, SpeechPreference> = {};
  for (const [language, preference] of Object.entries(stored)) {
    if (isRecord(preference)) {
      speech[language] = { rate: parseRate(preference["rate"]) };
    }
  }
  return speech;
}

function parseRate(stored: unknown): number {
  return typeof stored === "number" && stored >= MIN_RATE && stored <= MAX_RATE
    ? stored
    : DEFAULT_SPEECH.rate;
}

function pick<T extends string | number>(
  options: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return isOneOf(options, value) ? value : fallback;
}
