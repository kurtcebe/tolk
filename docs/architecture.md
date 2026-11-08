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

- **Content script:** extracts the article and hands it over. No AI calls here, because host pages are hostile and the DOM isn't ours.
- **Reader page:** a full-page extension page holding tokenizing, speech, AI calls and UI. Built-in AI APIs are available there directly.
- **Library page:** imports and lists books. It can share a page with the reader if that proves simpler.
- **Service worker:** kept thin.

## Storage

- **Books:** IndexedDB, as original file blobs plus parsed metadata and reading position. Needs the `unlimitedStorage` permission. `localStorage` is too small and only holds strings.
- **Saved words:** IndexedDB, so they stay local.
- **Settings:** `chrome.storage.sync`.
- **Voice choices:** `chrome.storage.local`, so a remote voice picked on one computer never applies on another.
- **Model output:** in memory only. Don't persist it.

## EPUB

An EPUB is a zip of XHTML files, with a manifest listing them in order.

- Parse with `DOMParser` as XHTML, and never execute anything from the file.
- Sanitise on the way in. Remove scripts, event handlers, forms, iframes and remote references (invariants 4 and 6).
- Serve images from the book's own zip through blob URLs. Don't apply the book's CSS at first, since the reader's typography wins.
- Unzip with the native `DecompressionStream` and a small zip reader if practical. Otherwise ask before vendoring a library.
- Detect DRM through `META-INF/encryption.xml`. Note that this file is also used for harmless font obfuscation, so check what it actually encrypts.

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
- **Speak one utterance per sentence, not per block.** Chrome stalls on long utterances, and stepping by sentence is simpler. Map `charIndex` back with the sentence's base offset.
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

## AI layer

- **Gating:** one availability entry point per capability and language. Re-check on each load, since Chrome can evict models when disk space runs low.
- **Sessions:** one configured session per task and language pair, with a fresh `clone()` per request so paragraphs don't share history.
- **Timeouts:** every Prompt API request gets its own `AbortController` and a timeout, because a model can hang on a repetition loop with no error. A cold model can legitimately take well over a minute, and the model can fall out of memory again while idle.
- **Validation:** re-detect the language of Simplify output and retry once, then fail visibly. Validate structured output against what the feature needs too, since a schema guarantees the format and not the truth.
- **Stale results:** select word A, then B before A resolves, and A's late result must not land in B's popup. Use a generation counter.
- **Concurrency:** one in-flight request per capability, with a cancellable queue where the paragraph being read has priority.

## State

One module owns app state and the UI subscribes. Playback state lives in exactly one place. Two components tracking "is it playing" was the second most common bug source in the prototype, after the word index.

## Cache keys

Compose keys from the block's current state, not the requested action, or a simplified-then-translated block collides with a translated-only one: `(blockId, mutationState, simplifyTarget, targetLang)`.
