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

export interface Settings {
  mode: Mode;
  scheme: Scheme;
  font: Font;
  textSize: TextSize;
  lineSpacing: LineSpacing;
}

type Listener = (settings: Settings) => void;

const STORAGE_KEY = "settings";

const DEFAULTS: Settings = {
  mode: "learner",
  scheme: "auto",
  font: "literata",
  textSize: 20,
  lineSpacing: "normal",
};

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

/** Loads saved settings. If storage fails, the reader still opens with defaults. */
export async function loadSettings(): Promise<void> {
  chrome.storage.sync.onChanged.addListener(handleStorageChange);
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
  };
}

function pick<T extends string | number>(
  options: readonly T[],
  value: unknown,
  fallback: T,
): T {
  return isOneOf(options, value) ? value : fallback;
}
