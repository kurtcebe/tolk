// HTML for the images the video needs besides the recording itself: book
// covers, the title and closing cards, and caption bars. Chrome renders them,
// with the extension's own fonts and colours.

const FONTS = `
@font-face { font-family: "Literata"; font-weight: 200 900; src: url("/fonts/literata-latin-standard-normal.woff2") format("woff2"); }
@font-face { font-family: "Literata"; font-weight: 200 900; src: url("/fonts/literata-latin-ext-standard-normal.woff2") format("woff2"); unicode-range: U+0100-024F, U+1E00-1EFF; }
@font-face { font-family: "Instrument Sans"; font-weight: 400 700; src: url("/fonts/instrument-sans-latin-wght-normal.woff2") format("woff2"); }
* { margin: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; }
`;

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function page(style, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${style}</style></head><body>${body}</body></html>`;
}

export function coverHtml(book) {
  return page(
    `body { background: ${book.cover.background}; color: ${book.cover.ink};
      display: flex; flex-direction: column; justify-content: space-between; padding: 56px 44px; }
     h1 { font: 600 54px/1.12 "Literata", serif; }
     p { font: 500 22px/1.3 "Instrument Sans", sans-serif; letter-spacing: 0.04em; opacity: 0.8; }
     .rule { width: 72px; height: 4px; background: currentColor; opacity: 0.6; margin: 28px 0; }`,
    `<div><h1>${escape(book.title)}</h1><div class="rule"></div></div><p>${escape(book.author)}</p>`,
  );
}

export function titleCardHtml(heading, line) {
  return page(
    `body { background: #fbf8f1; color: #25231e; display: grid; place-content: center; text-align: center; gap: 28px; }
     img { width: 120px; height: 120px; margin: 0 auto; }
     h1 { font: 600 76px/1 "Literata", serif; }
     p { font: 400 30px/1.35 "Instrument Sans", sans-serif; color: #625d52; max-width: 860px; }`,
    `<img src="/icons/icon.svg" alt=""><h1>${escape(heading)}</h1><p>${escape(line)}</p>`,
  );
}

export function closingCardHtml(heading, line) {
  return page(
    `body { background: #fbf8f1; color: #25231e; display: grid; place-content: center; text-align: center; gap: 24px; }
     img { width: 72px; height: 72px; margin: 0 auto 8px; }
     h1 { font: 600 52px/1.2 "Literata", serif; max-width: 980px; }
     p { font: 400 28px/1.35 "Instrument Sans", sans-serif; color: #1f4e79; }`,
    `<img src="/icons/icon.svg" alt=""><h1>${escape(heading)}</h1><p>${escape(line)}</p>`,
  );
}

/** A caption on a transparent background, sized to the whole frame's width. */
export function captionHtml(text) {
  return page(
    `html, body { background: transparent; }
     body { display: flex; align-items: center; justify-content: center; }
     span { font: 500 28px/1.25 "Instrument Sans", sans-serif; color: #fffdf8;
       background: rgba(31, 78, 121, 0.94); padding: 14px 30px; border-radius: 999px;
       box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18); }`,
    `<span>${escape(text)}</span>`,
  );
}
