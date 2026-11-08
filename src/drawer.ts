import { bindChoice, requireElement } from "./controls.js";
import {
  FONTS,
  getSettings,
  LINE_SPACINGS,
  SCHEMES,
  subscribe,
  TEXT_SIZES,
  updateSettings,
} from "./state.js";

export function mountDrawer(): void {
  mountToggle();
  mountSettings();
  mountTextSizeStepper();
}

function mountToggle(): void {
  const button = requireElement("settings-button");
  const drawer = requireElement("settings-drawer");

  const setOpen = (open: boolean): void => {
    drawer.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
  };

  button.addEventListener("click", () => {
    const open = !drawer.classList.contains("open");
    setOpen(open);
    if (open) {
      drawer.focus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawer.classList.contains("open")) {
      setOpen(false);
      button.focus();
    }
  });
}

function mountSettings(): void {
  bindChoice(
    "scheme",
    SCHEMES,
    () => getSettings().scheme,
    (scheme) => updateSettings({ scheme }),
  );
  bindChoice(
    "font",
    FONTS,
    () => getSettings().font,
    (font) => updateSettings({ font }),
  );
  bindChoice(
    "line-spacing",
    LINE_SPACINGS,
    () => getSettings().lineSpacing,
    (lineSpacing) => updateSettings({ lineSpacing }),
  );
}

function mountTextSizeStepper(): void {
  const smaller = requireElement("text-smaller");
  const larger = requireElement("text-larger");
  const value = requireElement("text-size-value");

  const step = (direction: -1 | 1): void => {
    const index = TEXT_SIZES.indexOf(getSettings().textSize);
    const textSize = TEXT_SIZES[index + direction];
    if (textSize !== undefined) {
      updateSettings({ textSize });
    }
  };

  smaller.addEventListener("click", () => step(-1));
  larger.addEventListener("click", () => step(1));

  // aria-disabled rather than disabled: a disabled button would drop keyboard
  // focus the moment a reader reached the end of the range.
  subscribe(({ textSize }) => {
    value.textContent = `${textSize} px`;
    smaller.setAttribute("aria-disabled", String(textSize === TEXT_SIZES[0]));
    larger.setAttribute("aria-disabled", String(textSize === TEXT_SIZES.at(-1)));
  });
}
