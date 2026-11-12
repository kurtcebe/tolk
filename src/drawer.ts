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
  { panel: "contents-drawer", button: "contents-button" },
] as const;

/** Using these leaves a drawer open. They're separate controls, not the page behind it. */
const KEEPS_DRAWER_OPEN = ".drawer, .top-controls, .player, .word-popup, .first-run, [popover]";

type Drawer = (typeof DRAWERS)[number];

export function mountDrawer(): void {
  mountDrawerToggles();
  mountSettings();
  mountTextSizeStepper();
}

export function openDrawer(): void {
  const settings = DRAWERS[0];
  setOpenDrawer(settings);
}

export function closeDrawers(): void {
  setOpenDrawer(null);
}

/** The library only has the saved words drawer. */
function drawersOnPage(): Drawer[] {
  return DRAWERS.filter(({ panel }) => document.getElementById(panel) !== null);
}

function setOpenDrawer(open: Drawer | null): void {
  for (const drawer of drawersOnPage()) {
    const isOpen = drawer === open;
    requireElement(drawer.panel).classList.toggle("open", isOpen);
    requireElement(drawer.button).setAttribute("aria-expanded", String(isOpen));
  }
}

function openDrawerNow(): Drawer | undefined {
  return drawersOnPage().find(({ panel }) => requireElement(panel).classList.contains("open"));
}

export function mountDrawerToggles(): void {
  for (const drawer of drawersOnPage()) {
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
      focusOpener(requireElement(drawer.button));
    }
  });

  // On pointerdown, which comes before the click, so a button elsewhere that opens
  // a drawer still gets to. The same press carries on and can select or seek.
  document.addEventListener("pointerdown", (event) => {
    const onPageScrollbar = event.clientX >= document.documentElement.clientWidth;
    if (
      !onPageScrollbar &&
      event.target instanceof Element &&
      event.target.closest(KEEPS_DRAWER_OPEN) === null
    ) {
      setOpenDrawer(null);
    }
  });
}

/** In a narrow window the opener is folded into the reader's closed menu. */
function focusOpener(button: HTMLElement): void {
  const menu = document.getElementById("controls-menu-button");
  if (!button.checkVisibility() && menu !== null) {
    menu.focus();
  } else {
    button.focus();
  }
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
