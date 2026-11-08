# Chrome built-in AI notes

What we rely on and what has gone wrong. Details change often, so verify against [the current docs](https://developer.chrome.com/docs/ai/built-in-apis) before writing calls, and record any drift here with a date.

## Status, checked 2026-11-08

| Capability | API | Use | Status |
| --- | --- | --- | --- |
| Detect L2 | Language Detector | Reader load | Stable |
| Translate to L1 | Translator | Translate | Stable, per language pair |
| Simplify, Explain, word cards | Prompt API | Text and structured output | Stable |
| Read-along | `speechSynthesis` | Playback | Web standard |
| Read it back to me | `SpeechRecognition` with `processLocally` | After v1 | Chrome version unconfirmed |
| Recaps | Summarizer | After v1 | Stable since 138 |

Writer, Rewriter and Proofreader are still listed as developer trials, so don't build on them. Rewriter can't take a target difficulty anyway.

Chrome's status table says the Prompt API reached extensions in 138, while the prototype's earlier check of the extensions docs said 148. Detect support at runtime and don't hard-code a version.

## Languages

The Prompt API and Summarizer docs list only `en`, `ja`, `es`, `de` and `fr`, with more in development. On a Chrome build tested 2026-08-13, `create()` without `expectedOutputs` also warned: *"Please specify a supported output language code: [de, en, es, fr, ja]."*

Dutch is not listed. The prototype declared `expectedInputs` and `expectedOutputs` only for listed languages and left them off otherwise, to avoid risking `NotSupportedError`. Simplify ran that way on Dutch articles, but quality and speed may be uneven. Don't assume this keeps working or applies to Summarizer or structured output. Test each one per language.

## Machine requirements

Translator and Language Detector are lighter than the Prompt API, so many readers get one without the other. Gate them independently: translation working while Simplify is unavailable is a normal configuration.

Never put hardware figures in UI copy. On one Mac in August 2026, Chrome asked for 3000 MiB VRAM and 20480 MiB free disk while the docs said more than 4 GB and 22 GB. Point readers to `chrome://on-device-internals`, which shows actual against required.

Chrome can evict the model if free space drops below about 10 GB, so availability can go from ready back to downloadable. Re-check on each load.

## Availability and activation

- States are `unavailable`, `downloadable`, `downloading` and `available`. Normalise anything unexpected and log it.
- `availability()` needs no user activation, but `create()` can, so a download can only start from a click.
- `downloadprogress` gives `e.loaded` as a fraction from 0 to 1, with no byte count.

## Known failures

- **Instruction drift:** Simplify can come back translated, summarised or with a preamble. Re-detect the language, retry once, then fail visibly. Silently showing English where a learner expected Dutch is the worst thing this product could do.
- **Chat framing:** a generic "no preamble" isn't enough. Name and forbid specific openers, and tell the model not to mention what's absent.
- **Never stopping:** a request can hang on a repetition loop with no error. Every request needs an abort signal and a timeout.
- **Cold starts:** the first request after `create()` can take well over a minute, so a flat 45 second timeout fails real requests. The model can also fall out of memory while idle, with `availability()` still reporting `available`, so "completed one request" doesn't mean "still warm". This was unsolved in the prototype.
- **Pre-warming:** Chrome recommends creating a session once the reader's intent is clear, but doing that on every load costs too much. The prototype made it an opt-in preference.
- **Streaming:** `promptStreaming()` yields deltas, so append chunks.
- **Finite context:** work per block, and watch `contextUsage` against `contextWindow`. Truncated input produces output missing its last sentences, which is hard to notice.
- **Detection:** it's unreliable on short samples. Feed it a few hundred words of body text and ignore `<html lang>`, which often describes the site rather than the article.
- **Availability isn't quality:** a language pair can report available and still translate badly, so don't promise quality in UI copy.
- **Model changes:** a `gemma4` generation was rolling out in August 2026, and Google has mentioned a small Gemma 197M model for task APIs. Validate output instead of relying on one model's behaviour.

## Worth trying

- **Structured output:** `responseConstraint` takes a JSON Schema, and it counts toward context unless `omitResponseConstraintInput` is set.
- **`initialPrompts`:** moving static instructions into the base session should speed up the first prompt. The prototype had an unmerged experiment on this.
- **Sampling in extensions:** `topK` and `temperature` remain available to extensions, and must be set together.
- **Local speech recognition:** `SpeechRecognition.available()` and `install()`, with packs reportedly around 60 MB each. Availability varies by language. Recognisers tend to guess plausible words, which limits how far they can judge pronunciation.

## Debugging

`chrome://on-device-internals` shows what the machine has and lets you force a download.
