# Chrome built-in AI notes

What we rely on and what has gone wrong. Details change often, so verify against [the current docs](https://developer.chrome.com/docs/ai/built-in-apis) before writing calls, and record any drift here with a date.

## Status, checked 2026-11-08

| Capability | API | Use | Status |
| --- | --- | --- | --- |
| Detect L2 | Language Detector | Reader load | Stable |
| Translate to L1 | Translator | Translate | Stable, per language pair |
| Simplify, Explain, word cards | Prompt API | Text and structured output | Stable |
| Read-along | `speechSynthesis` | Playback | Web standard |
| Read it back to me | `SpeechRecognition` with `processLocally` | After v1 | API present in Chrome 157, no local Dutch pack. See the Dutch results below |
| Recaps | Summarizer | After v1 | Stable since 138 |

Writer, Rewriter and Proofreader are still listed as developer trials, so don't build on them. Rewriter can't take a target difficulty anyway.

Chrome's status table says the Prompt API reached extensions in 138, while the prototype's earlier check of the extensions docs said 148. Detect support at runtime and don't hard-code a version. On 2026-11-08 the docs still disagreed: the Prompt API page says 138 for extensions, and the built-in APIs table says 148 while its own text says 138.

## Languages

The Prompt API and Summarizer docs list only `en`, `ja`, `es`, `de` and `fr`, with more in development. On a Chrome build tested 2026-08-13, `create()` without `expectedOutputs` also warned: *"Please specify a supported output language code: [de, en, es, fr, ja]."*

Dutch is not listed. The prototype declared `expectedInputs` and `expectedOutputs` only for listed languages and left them off otherwise, to avoid risking `NotSupportedError`. Simplify ran that way on Dutch articles, but quality and speed may be uneven. Don't assume this keeps working or applies to Summarizer or structured output. Test each one per language.

## Dutch results, 2026-11-08

Tested by hand from an extension page in Chrome 157.0.8103.38 on an Intel Mac running macOS 26.6.2, with a throwaway harness. Output quality rests on two runs of one prompt per config, and 20 words for word cards, so treat it as a first reading. Other machines and Chrome versions may differ.

### Availability

| Config | `availability()` | `create()` |
| --- | --- | --- |
| Prompt API: `nl` declared as input, output or both | `unavailable` | `NotSupportedError` in under 10 ms |
| Prompt API: nothing declared | `available` | Works |
| Prompt API: input undeclared, `en` output | `available` | Works |
| Summarizer: `nl` declared as input, output or both | `unavailable` | `NotSupportedError` in under 10 ms |
| Summarizer: input undeclared, `en` output | `available` | Works |
| Summarizer: nothing declared | `available` | Works |

`availability()` matched `create()` in every case tested. Chrome's console says of an undeclared output language that specifying one is needed "to ensure optimal output quality and properly attest to output safety", so the undeclared route runs without that assurance. Don't declare `nl`, and keep checking at runtime in case support arrives.

### Text output

| Task | Config | Language of output | Quality over two runs |
| --- | --- | --- | --- |
| Simplify to A2 | Prompt API, nothing declared | Dutch | Barely shorter or simpler. One run changed a fact, turning "ruim twaalfduizend" into "bijna zestien duizend". The other dropped a space between two sentences |
| Explain in English | Prompt API, `en` output | English | Readable. One run added a claim about "a strong cycling culture" that isn't in the text, and the other left out the protests |
| Recap in Dutch | Prompt API, nothing declared | Dutch | Distorted the content both times, with "waarschijnlijk" and "recente bewegingen" in one run and "dankzij vlak terrein" in the other, where the source says flatness isn't the whole reason |
| Recap | Summarizer, nothing declared | Dutch | Grammar slips in one run, such as a missing "naar". The other kept the numbers but credited the cycling numbers partly to "de ontwikkeling van problemen" |
| Recap in English | Summarizer, `en` output | English | Good in one run. The other made flat terrain a cause of the 1970s shift |

Nothing came back in the wrong language in either run, but that doesn't remove the need to re-detect the output language. Language checks won't catch the changed number, so a rewrite can stay in Dutch and still be wrong.

### Word cards

Structured output worked: input undeclared, `en` output and `responseConstraint` returned JSON that parsed and matched the schema on 42 of 42 prompts over two runs. The schema only guarantees the shape: verbs and an adjective still got an article, and one meaning was cut off mid-sentence inside otherwise valid JSON ("(The verb form of ").

Correct against a hand-written key, out of 20 words:

| Field | Run 1 | Run 2 | Notes |
| --- | --- | --- | --- |
| Part of speech | 20/20 | 20/20 | |
| Dictionary form | 14/20 | 14/20 | Separable verbs 0/2 both times. Irregular plurals 2/5, then 1/5 |
| Article on nouns | 5/13 | 6/13 | Het nouns 0/7 both times. Always answering "de" scores 6/13, which is exactly what run 2 did |
| Article on other words | 5/7 | 4/7 | Gave "de" to verbs and to the adjective `brutaal` |
| Meaning, by sense | 17/20, provisional | 17/20, provisional | Pending a hand check. Run 1 had one wrong and two partial, run 2 had three partial |

- **Article:** across both runs the model said "de" for 25 of 26 noun answers, and its only "het" was wrong (*de zin*). It got *het ziekenhuis*, *het kind*, *het schip*, *het ei*, *het museum*, *het meisje* and *het voetbalveld* wrong every time. This is the confidently wrong gender the product spec warns about.
- **Separable verbs:** never right. `bel` in "Ik bel je morgen op" gave "bell", then `bellen`. `staat` in "Zij staat ... op" gave `staan`, then `zijn`. The participle `uitgenodigd` gave `uitnodigen` both times.
- **Dictionary form:** two came back in English in run 1 ("bell", "children"), and `steden` and `musea` stayed plural both times. `fietsenstalling` was replaced with an invented synonym, "fietsparkeerplaats", in run 1 only.
- **Instability:** the same prompt can give different answers. The dictionary form score was the same in both runs, but `fietsenstalling` went from wrong to right and `eieren` from right to wrong. `bel` went from a wrong meaning to a right one. Regenerating a card isn't a reliable way to check it.
- **Meaning:** context worked for both senses of `bank`, both senses of `was`, and the false friend `brutaal`. `zin` was right in run 1, then described as "a feeling of not wanting to do something" in run 2, which reverses it. Many answers paraphrased the sentence instead of defining the word, which is probably fixable in the prompt.

### Speech recognition

With `processLocally: true`, `nl-NL`, `nl-BE` and `nl` all report `unavailable`, and `install()` for `nl-NL` returned `false` immediately. `en-US` and `de-DE` report `downloadable`, so this is about Dutch and not about local speech as a whole. Recognition accuracy and mispronunciation couldn't be tested, because there's nothing to run them on.

`quality: "dictation"` reported `unavailable` for all five language tags, including `en-US` and `de-DE`. The microphone prompt works from an extension page opened in a tab.

### Translate and detection

`Translator` reported `available` for both `nl` to `en` and `en` to `nl`. `create()` took 323 ms, and translations took 20 to 287 ms. All four samples were accurate, including the full passage, which kept "more than twelve thousand". Sentences the Prompt API struggled with came back right: "I don't feel like cooking", "I'll call you tomorrow" and "That child is very cheeky". This is one run, with `en` as the only target tested.

`LanguageDetector` reported `available`. It gave `nl` at 0.99 for the passage and for a five-word sentence, and `en` at 0.27 for the single word "bank", with `nl` third. Don't trust a detection from one word.

### Playback

This Mac lists two local Dutch voices, Ellen (`nl-BE`) and Xander (`nl-NL`), and one remote voice, Google Nederlands. The test sentence has 13 words and doesn't replace the long-text alignment check in the read-along milestone.

Local voices fired a word boundary at the start of all 13 words on every run we checked. The remote voice fired none on any run, so it gets the sentence highlight described in `architecture.md`.

Actual speed compared with that voice at `rate` 1, measured from how long the sentence took:

| `rate` | Ellen, local | Xander, local | Google Nederlands, remote |
| --- | --- | --- | --- |
| 0.1 | 55% | 57% | Not tested |
| 0.25 | 63% | 63% | 37% |
| 0.4 | 72% | 72% | Not tested |
| 0.5 | 78% | 78% | 52% |
| 0.6 | 77% | 78% | Not tested |
| 0.75 | 91% | 91% | 72% |
| 0.9 | 91% | 91% | 89% |
| 0.95 to 1.02 | 100% | 100% | 98 to 104% where tested |
| 1.03 | 104% | 104% | Not tested |
| 1.1 | 107% | 107% | 115% |
| 1.25 | 122% | 123% | Not tested |
| 1.5 | 140% | 141% | 194% |
| 2 | 189% | 191% | 357% |

- **Local voices move in steps:** 0.5 and 0.6 gave the same speed, as did 0.75 and 0.9, and everything from 0.95 to 1.02. A 1% change often does nothing. They also can't get much slower than about 55%, since 0.1 is the lowest `rate` the API allows.
- **The remote voice responds to 1% steps:** 0.98, 0.99, 1, 1.01 and 1.02 all gave measurably different times, about 40 to 90 ms apart on a 4-second sentence. Its speed still isn't equal to `rate`, especially above 1. Nobody has checked by ear whether it stays clear at 2.
- **`rate` isn't the true speed:** don't label a slider as if it were. These figures come from one Mac and may differ on other systems, so don't hard-code them.
- **`rate` is fixed per utterance:** changing speed during playback means restarting from the current position.
- **Long text:** the remote voice read the 119-word passage in 40 seconds and reported `end`, with no sign of stopping early. It took 140 to 260 ms to start.
- **Single-word translation:** not tested. Saved words depend on it, so check it in M4, because a word translated on its own has no context to choose a sense from.

### Decisions for Dutch

| Feature | Decision | Reason |
| --- | --- | --- |
| Translate | Keep in v1 | Fast and accurate on every sample |
| Read-along | Keep in v1 | Local voices give exact word positions, and the remote voice gets the sentence highlight |
| Saved words | New in v1 | Translate covers it without relying on the Prompt API |
| Simplify | Postpone | Barely simplified, and changed a number in one run |
| Explain | Postpone | Added or left out details |
| Word cards | Postpone | Articles no better than always guessing "de", and unreliable dictionary forms |
| Recaps | Stays after v1 | Declaring `nl` is rejected, and undeclared output distorted the content |
| Read it back to me | Blocked for Dutch | No local pack, and invariant 7 rules out a cloud fallback. Keep the runtime check |

### Timing and API behaviour

- **Warm word cards:** about 2.4 seconds each on average, from 1.6 to 3.3, including `create()`.
- **Cold starts:** not measured cleanly. Several tests ran at once in both runs, so their totals of 70 to 146 seconds include queueing. Overlapping requests can clearly wait a long time, so the product shouldn't assume they run in parallel.
- **`contextWindow`:** 9216 on this machine.
- **`LanguageModel.params()`:** returned `null`, even after sessions had run, although the docs describe an object. Null-check it.
- **`downloadprogress`:** fired and reached 1 even when `availability()` already said `available`, so it doesn't prove a real download happened.

### Docs to read carefully

- **Summarizer:** `expectedInputLanguages`, `expectedContextLanguages` and `outputLanguage` appear only in a code sample, not in the options list.
- **`SpeechRecognition.install()`:** MDN lists `langs` and `quality`, while its examples also pass `processLocally`.
- **Cloud fallback:** an MDN example falls back to cloud recognition when local isn't available. Invariant 7 forbids copying it.

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
