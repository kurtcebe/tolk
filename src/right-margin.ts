// The right margin holds the top-right controls and, below them, the docked player.
// When it's too narrow for them, the controls fold into one menu button and the
// player becomes a bar at the bottom. Both are fixed overlays (invariant 5).

import { requireElement } from "./controls.js";
import { subscribe } from "./state.js";

/** The 208 px block, its 16 px from the window edge, and a 16 px gap to the text. */
const MARGIN_NEEDED_PX = 240;

export function mountRightMargin(): void {
  window.addEventListener("resize", updateMargin);
  // The column scales with the text, so the room in the margin depends on both.
  subscribe(updateMargin);
  trackControlsBottom();
  closeMenuOnPick();
}

function updateMargin(): void {
  const root = document.documentElement;
  const columnRight = requireElement("reader").getBoundingClientRect().right;
  const wide = root.clientWidth - columnRight >= MARGIN_NEEDED_PX;
  root.dataset["margin"] = wide ? "wide" : "narrow";
  const panel = requireElement("controls-panel");
  if (wide && panel.matches(":popover-open")) {
    panel.hidePopover();
  }
}

/** The player and the drawers start below the controls, whose height varies. */
function trackControlsBottom(): void {
  const controls = requireElement("top-controls");
  const observer = new ResizeObserver(() => {
    const bottom = controls.getBoundingClientRect().bottom;
    document.documentElement.style.setProperty("--controls-bottom", `${bottom}px`);
  });
  observer.observe(controls);
}

/** A picked button has done its job, so the menu gets out of the way. */
function closeMenuOnPick(): void {
  const panel = requireElement("controls-panel");
  panel.addEventListener("click", (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest("button, a") !== null &&
      panel.matches(":popover-open")
    ) {
      panel.hidePopover();
    }
  });
}
