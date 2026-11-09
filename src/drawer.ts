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

/** Each drawer closes from the button that opened it, and only one is open at a time. */
const DRAWERS = [
  { panel: "settings-drawer", button: "settings-button" },
  { panel: "saved-drawer", button: "saved-button" },
] as const;

type Drawer = (typeof DRAWERS)[number];

export function mountDrawer(): void {
  mountToggles();
  mountSettings();
  mountTextSizeStepper();
}

export function openDrawer(): void {
  const settings = DRAWERS[0];
  setOpenDrawer(settings);
}

function setOpenDrawer(open: Drawer | null): void {
  for (const drawer of DRAWERS) {
    const isOpen = drawer === open;
    requireElement(drawer.panel).classList.toggle("open", isOpen);
    requireElement(drawer.button).setAttribute("aria-expanded", String(isOpen));
  }
}

function openDrawerNow(): Drawer | undefined {
  return DRAWERS.find(({ panel }) => requireElement(panel).classList.contains("open"));
}

function mountToggles(): void {
  for (const drawer of DRAWERS) {
    requireElement(drawer.button).addEventListener("click", () => {
      const open = openDrawerNow() !== drawer;
      setOpenDrawer(open ? drawer : null);
      if (open) {
        requireElement(drawer.panel).focus();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    // An open popover is what Escape closes first, not the drawer behind it.
    if (event.key !== "Escape" || document.querySelector(":popover-open") !== null) {
      return;
    }
    const drawer = openDrawerNow();
    if (drawer !== undefined) {
      setOpenDrawer(null);
      requireElement(drawer.button).focus();
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
