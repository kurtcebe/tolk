// The contents drawer, for books only. Titles come from the book, so they only ever
// go in as text (invariant 4).

import { getChapterIndex, getChapters, goToChapter, subscribeChapter } from "./chapter-view.js";
import { requireElement } from "./controls.js";
import { closeDrawers } from "./drawer.js";

export function mountContents(): void {
  requireElement("contents-button").hidden = false;
  subscribeChapter(render);
  render();
}

function render(): void {
  const current = getChapterIndex();
  requireElement("contents-list").replaceChildren(
    ...getChapters().map((chapter, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "contents-entry";
      button.textContent = chapter.title || `Section ${index + 1}`;
      if (index === current) {
        button.setAttribute("aria-current", "true");
      }
      button.addEventListener("click", () => {
        closeDrawers();
        void goToChapter(index);
      });
      const item = document.createElement("li");
      item.append(button);
      return item;
    }),
  );
}
