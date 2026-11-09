import { getSettings, isOneOf, MODES, subscribe, updateSettings } from "./state.js";

export function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`reader.html is missing #${id}`);
  }
  return element;
}

export function requireSelect(id: string): HTMLSelectElement {
  const select = requireElement(id);
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`reader.html's #${id} must be a select`);
  }
  return select;
}

/** Keeps a group of radio buttons and one setting in step, in both directions. */
export function bindChoice<T extends string>(
  groupName: string,
  options: readonly T[],
  read: () => T,
  write: (value: T) => void,
): void {
  const inputs = document.querySelectorAll<HTMLInputElement>(
    `input[type="radio"][name="${groupName}"]`,
  );
  for (const input of inputs) {
    input.addEventListener("change", () => {
      if (isOneOf(options, input.value)) {
        write(input.value);
      }
    });
  }
  subscribe(() => {
    for (const input of inputs) {
      input.checked = input.value === read();
    }
  });
}

export function mountModeSwitch(): void {
  bindChoice(
    "mode",
    MODES,
    () => getSettings().mode,
    (mode) => updateSettings({ mode }),
  );
}
