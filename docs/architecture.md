# Architecture

A starting point rather than a finished design. Update it as the code proves or disproves it.

## Everything becomes one document

```
Live page ── Readability ──────┐
                               ├─► Document ─► reader, read-along, AI tools
EPUB ──── unzip, parse, clean ─┘
```

A source adapter's only job is producing a `Document`. Nothing downstream knows where the text came from. In code the type is `TolkDocument`, because `Document` would shadow the browser's own type.

```js
TolkDocument = {
  id, source, title, author, language,
  chapters: [ { id, title, blocks: [ { id, type, html } ] } ],
}
```

A live page is a document with one chapter. The reader renders one chapter at a time, which keeps long books fast and the word index small.

A block's `html` is untrusted, whatever its source. `render.ts` parses it in an inert `DOMParser` document and rebuilds it node by node from an allowlist, so it never goes through `innerHTML`. Links keep only absolute `http` and `https` URLs.

## Where the code runs

- **Injected script:** extracts the article and hands it over, only after a click or shortcut. No AI calls here, because host pages are hostile and the DOM isn't ours.
- **Reader page:** a full-page extension page holding tokenizing, speech, AI calls and UI. Built-in AI APIs are available there directly.
- **Library page:** imports and lists books, on its own page.
- **Service worker:** kept thin.

## Storage

- **Books:** IndexedDB, as original file blobs plus parsed metadata and reading position. `localStorage` is too small and only holds strings. They have their own `tolk-books` database, with the file in a separate store from the details, so saving a position never touches the file and adding books can't put saved words at risk.
- **Saved words:** IndexedDB, so they stay local. `unlimitedStorage` exempts them from eviction when disk space runs low, and shows no warning at install. A saved word's source is stored by value, so it outlives the book it came from.
- **Reading history:** IndexedDB, in its own `tolk-history` database, so clearing it can't touch books or saved words. One record per local date and language, holding seconds, words, and seconds per book ID. Nothing about what was read, and live articles are pooled without a URL. Never synced.
- **Settings:** `chrome.storage.sync`.
- **Voice choices:** `chrome.storage.local`, so a remote voice picked on one computer never applies on another.
- **Model output:** in memory only. Don't persist it.

## Live pages

The icon or shortcut grants `activeTab` for the current page, with no host permissions.

1. **Extract:** `background.ts` makes two `executeScript` calls, one injecting `vendor/Readability.js` and one running `extractArticle` from `extract.ts`. Two calls, because the docs don't say whether several files run in order or what a file returns. Chrome serialises `extractArticle`, so it can't import anything, and it works on a clone of the page because Readability rewrites what it's given.
2. **Nothing to read:** a page with no article, or one Chrome won't let extensions read, opens `library.html?note=<reason>` instead. Only the reason travels in the address.
3. **Hand over:** the service worker has no `DOMParser`, so it stores Readability's raw result in `chrome.storage.session` under a random ID and opens `reader.html?article=<id>`. Session storage stays in memory and survives a reload, and the entry goes when the reader tab closes. A reader that finds it gone shows a note.
4. **Build blocks:** `article-blocks.ts` turns the HTML into blocks on the reader page, in an inert document, and `render.ts` then rebuilds each one from its allowlist as usual. Every text node goes into exactly one block: a run of inline content beside block elements becomes its own paragraph, a list item becomes a `list-item` block whose marker is drawn in CSS, and a table row becomes one paragraph.

The page's `lang` is never read. `language` stays null, and detection decides.

## EPUB

An EPUB is a zip of XHTML files, with a manifest listing them in order.

- **Parsing:** `DOMParser` as XHTML, and never execute anything from the file. Real books often break XHTML's rules, for example `&nbsp;` with no doctype, so anything it refuses goes through the HTML parser, after expanding self-closed tags like `<title/>` that would otherwise swallow the body. A string has no encoding, so `epub.ts` decodes the bytes first, honouring a BOM and the declared encoding, because older books are often Latin-1.
- **Console noise:** Chrome checks the page's CSP while `DOMParser` reads a book, so a book's inline styles and `on*` attributes log CSP violations from `epub.js`. Nothing runs or loads, because they're blocked and the document is inert, and the sanitiser then drops them.
- **Sanitising:** `epub-document.ts` copies each body into a new inert HTML document, element by element, keeping only `id`, a link's `href` and an `ol`'s `start`. Scripts, event handlers, forms, iframes, media, styles and remote references stop there (invariants 4 and 6). `render.ts` applies its own allowlist afterwards.
- **Images:** only a path inside the book survives sanitising, and only image types are served, through blob URLs. `chapter-images.ts` measures a chapter's images before it renders, so their space is reserved and a restored position holds. Alt text stays in `alt`, and an image has no block ID, so it's never in the word index. The book's CSS isn't applied, since the reader's typography wins.
- **Unzipping:** `zip.ts` reads the central directory and unpacks with the native `DecompressionStream`. It counts real bytes against a limit, because a zip's declared sizes can't be trusted and a small file can unpack to something enormous. Zip64 is refused.
- **DRM:** `META-INF/encryption.xml` is also used for harmless font obfuscation, and Tolk never uses a book's fonts. So a book counts as protected when anything besides a font is encrypted.
- **Chapters:** one per spine file, in spine order. `linear="no"` parts are skipped unless the contents list them, and parts with no text or images are dropped. A contents entry pointing inside a file splits the file, if the anchor is on a heading or leads straight into one. Contents lists can also point at printed page numbers, which mustn't cut the text up. A `Range` clones the part between two anchors and closes any wrappers it cuts through, so no text is lost or repeated.
- **Titles:** the contents list's, then the first heading's. A part with neither has no title, and nothing is invented to read out.
- **Opening:** the whole book is parsed when it opens, and only the current chapter is rendered. On a test machine, War and Peace took under a second. A book's language comes from detection on its longest chapter, since its first pages are often a title page or copyright notice in another language. `dc:language` is ignored, for the same reason a page's `lang` is.

### Moving between chapters

`chapter-view.ts` owns which chapter is on the page, and every change goes through it. There are three paths, all building the chapter complete in a fragment before one swap: a language change rebuilds in place and stops speech, a reader's jump from Contents or a chapter link stops speech and goes to the top, and playback reaching a chapter's end continues.

Continuing needs more care. `advance()` silences speech first, so the watchdog can't fire while the next chapter's images load, then asks `chapter-view.ts` whether there's more. `continueInBlocks()` swaps the index and the page without ending the session, so a reader who paused in that gap stays paused, and a chapter change or language change in that gap abandons the continuation through a generation number. The jump to the top of the chapter goes through `jumpTo()` in `follow.ts`, so it doesn't count as the reader scrolling, and happens before the swap, because a shorter page would otherwise clamp the scroll position and look like a manual scroll.

### Reading position

Stored as chapter, block and word rather than pixels, so it holds at any text size or window width (`reading-position.ts`). It's the word speech has reached during a session, or otherwise the first word on screen. Hear and Read this paragraph don't move it. It's restored last, after detection and fonts, because it's a place in the finished layout. A save reads the book before writing it, which a page navigating away doesn't get time to finish, so the library links wait for the save. Closing a tab can lose the last moment, up to the 800 ms after a scroll or 5 seconds of speech. Play from idle in a book starts at the first sentence that starts on screen.

## The word index

The mechanism everything else depends on.

At render, each block is tokenized. Every word becomes `<span class="w" data-w="12">word</span>`, and whitespace and punctuation stay as text nodes between spans.

```js
{
  blockId,
  text,            // exactly the string behind each utterance
  words: [ { index, start, end, el } ],   // offsets into `text`
  sentences: [ { start, end, firstWord, lastWord } ],
  original: null,  // set when simplified, used by revert
}
```

Rules learned the hard way:

- **Build `text` and the offsets in one pass from the same source.** Reconstructing the utterance separately makes them drift on non-breaking spaces, soft hyphens and collapsed whitespace, and the highlight ends up one word off, two paragraphs in.
- **Don't normalise `text`.** It's the exact concatenation of the block's text nodes, plus a `\n` for each `<br>`, so the words on either side of a break don't run together when spoken.
- **Word numbers are per block.** `data-w` restarts at 0 in each block, so re-tokenizing one block can't renumber any other.
- **Segment sentences on a stand-in copy with each `\n` replaced by a space.** `Intl.Segmenter` forces a break after any bare line feed, which fragments text converted from line-wrapped sources. This is common in EPUBs of older books. The copy has the same length, so offsets still line up.
- **Speak one utterance per sentence, not per block.** Chrome stalls on long utterances, and stepping by sentence is simpler. Map `charIndex` back with the sentence's base offset. An utterance has each `\n` replaced by a space, which has the same length, so line-wrapped text doesn't make a voice pause mid-sentence.
- **Resolve boundaries by binary search** over `words`.
- **Highlight with the CSS Custom Highlight API,** using two ranges for sentence and word. It paints background only, so it can't reflow text, and it covers the gaps between words.

## Voices that misbehave

Boundary events aren't reliable across voices. If no boundary fires for longer than a plausible word duration, treat that voice as reporting no word positions for the session and fall back to the sentence highlight, which stays exact. Interpolating the word position on a timer was tested on real Dutch articles and doesn't hold sync, so it isn't the fallback.

Resolve the voice before speech can start, not after the voice list arrives, or the first utterance can use the wrong one.

Every restart, whether from pausing, seeking or changing speed or voice, cancels the utterance and starts a new one from the current position. `pause()` can cancel instead of pausing on some platforms, so it isn't used, and each utterance's events carry a generation number so a cancelled one can't move anything. A voice that reports words resumes from the current word. One that doesn't restarts its sentence.

An engine can also go quiet without an event. A watchdog retries an utterance that never starts, then fails visibly, and moves on from one that stops or runs far past its expected length.

## Block mutation

Simplify and revert follow one sequence in one function:

1. If playback is inside this block, stop and remember that.
2. Remove any interlinear translation on this block. Don't rebuild it automatically, because an in-flight translation can race the replacement.
3. Cache the original text if it isn't cached yet.
4. Replace the block's text.
5. Re-tokenize and rebuild the index and sentences.
6. If it was playing, resume from the block's first word.

Anything that bypasses this desynchronises the highlight.

## Interlinear lines

Interlinear lines live inside the block but aren't a block mutation, because the L2 doesn't change. The index holds element references and offsets into `text`, and a line changes neither, so speech can carry on while one appears. `interlinear.ts` adds a line at each sentence's end offset, splitting a text node between words if it has to, and it compares the block's text with `text` afterwards and logs an error if they differ.

A line must never be tokenized, since that would make the translation readable words. A language change or a new chapter rebuilds from the source blocks, so the tokenizer can't meet one. Margin tools are added after indexing for the same reason, and keep their labels in attributes, so a block's text stays exactly what was indexed. Simplify, when it arrives, removes lines first (step 2 above).

## Speech ranges

Hear and Read this paragraph are one mechanism in `playback.ts`: a range of words to speak before stopping. It uses the same one-utterance-per-sentence path as a session, cut at the range's ends, so the same word index maps its boundaries. The last utterance keeps the sentence's closing punctuation when the range reaches it, because that gives the voice its falling tone.

## Language changes

Detection can finish after the reader is built, and an override can come at any time. A language change rebuilds the whole chapter, because every block's segmentation depends on the language: `rebuildChapter()` in `chapter-view.ts` renders and indexes the source blocks in a detached fragment, stops speech and swaps the index through `replaceBlocks()`, then replaces the page's chapter in one step. It never re-tokenizes existing word spans, which would nest them. Speech doesn't resume, because the voice list has changed too.

`document-language.ts` is the one owner of L2 and L1. A choice always beats detection, so a late detection result can't undo an override. A book saves its override with the book.

## AI layer

- **Gating:** one availability entry point per capability and language. Re-check on each load, since Chrome can evict models when disk space runs low.
- **Sessions:** one configured session per task and language pair, with a fresh `clone()` per request so paragraphs don't share history.
- **Timeouts:** every Prompt API request gets its own `AbortController` and a timeout, because a model can hang on a repetition loop with no error. A cold model can legitimately take well over a minute, and the model can fall out of memory again while idle.
- **Validation:** re-detect the language of Simplify output and retry once, then fail visibly. Validate structured output against what the feature needs too, since a schema guarantees the format and not the truth.
- **Stale results:** select word A, then B before A resolves, and A's late result must not land in B's popup. Use a generation counter.
- **Concurrency:** one in-flight request per capability, with a cancellable queue. For translation, `translation.ts` puts a popup ahead of a paragraph, because someone waiting on one word shouldn't wait for a long paragraph. Each request is gated again when its turn comes, and has a timeout, because a request that never answers mustn't block the queue.

## Reading history

`reading-history.ts` counts in the reader and `history-store.ts` keeps the totals.

- **Time:** a one-second tick adds a second while the tab is visible and either speech is playing or there's been a scroll, selection or chapter change in the last 60 seconds. The tick stops while the tab is hidden, rather than ticking and doing nothing.
- **Words:** a set of chapter, block and word positions per open document. When scrolling settles, and every 5 seconds while time counts, the words on screen join it. While speech plays, each tick adds the sentence being spoken, since speech doesn't tell listeners about each word. Words read is the set's growth. A block re-tokenized by the mutation path can count some words twice, which is accepted, since the number is a rough measure.
- **Writes:** totals build in memory and are added to the stored record every 30 seconds, and on `pagehide` and when the tab is hidden. Closing a tab can lose up to the last 30 seconds.
- **Library:** reads the records for the month shown. The library never writes, apart from clearing.

## State

One module owns app state and the UI subscribes. Playback state lives in exactly one place. Two components tracking "is it playing" was the second most common bug source in the prototype, after the word index.

## Cache keys

Compose keys from the block's current state, not the requested action, or a simplified-then-translated block collides with a translated-only one: `(blockId, mutationState, simplifyTarget, targetLang)`.
