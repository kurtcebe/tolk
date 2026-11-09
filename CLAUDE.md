# Tolk: a reader for language learners

A Chrome extension for reading live web pages and EPUB books in the language you're learning. All AI runs locally through Chrome's built-in AI APIs, with no accounts or API keys.

## Read before writing code

| File | What it settles |
| --- | --- |
| `docs/product-spec.md` | Who it's for, v1 scope, privacy |
| `docs/ui-ux-spec.md` | Every surface, state and interaction, plus the visual identity |
| `docs/architecture.md` | The source pipeline, document model and word index |
| `docs/chrome-ai-notes.md` | Built-in AI APIs, per-language limits and known failures |
| `docs/roadmap.md` | Milestones in dependency order |

## Two languages

Confusing these produces a broken product:

- **L2** is the language being read and learned. It's detected, never asked for, and can be overridden. Simplified text stays in L2.
- **L1** is the reader's own language, set once. Translations and grammar explanations go into L1.

Simplify keeps the language and lowers the difficulty. Translate changes the language and keeps the difficulty. They are different features with different APIs and different effects on the document.

## Invariants

Breaking one is a bug even if everything appears to work.

1. **The word index is the source of truth for read-along.** Every readable word is wrapped in a `<span data-w="N">`, and speech boundary events map to `N` through a per-block index.
2. **Mutating a block invalidates its word index.** Every change goes through the single mutate-and-retokenize path. If speech is playing in that block, stop it first.
3. **No AI call happens without an availability check, per language.** `unavailable` and `downloadable` are normal states with real UI, not error paths. Never assume a capability from another language or another API.
4. **AI output and EPUB content are untrusted.** Insert model output with `textContent`. Sanitise EPUB content before it reaches the document. Never use `innerHTML` on either.
5. **Reader controls never reflow the text.** They live in the margin or in overlays, so text doesn't shift under the reader's eye. There is one named exception: changing the text's language updates its `lang`, so the font can draw that language's letters correctly, and this re-wraps some lines for Turkish.
6. **Nothing in the extension uses the network.** No `fetch`, `XMLHttpRequest`, host permissions or remote resources, including anything referenced by an EPUB. If a feature seems to need one, stop and raise it. Chrome downloading a model or language pack is allowed, and only ever starts from a click. There is one named exception: Chrome's remote speech voices, which send text to Google, are used only when a reader picks one, and the player says so. Local voices are the default. A second exception needs a conversation first.
7. **Speech recognition always sets `processLocally = true`, with no fallback.** Without it, audio may go to a server.

## Conventions

- Manifest V3 with native ES modules. No bundler: the only build step is `tsc`.
- TypeScript in strict mode, with no framework. Source is in `src/`, and `tsc` compiles it to `extension/js/`, which is gitignored. Manifest, HTML and CSS live in `extension/`.
- Ask before adding a dependency. Dev-only type packages are fine; anything shipped in the extension counts.
- Avoid `any`. At an API or file boundary, take `unknown` and narrow it. AI output and EPUB content stay untrusted even when typed, because a type is not a runtime check.
- `async`/`await` throughout, no `.then()` chains.
- Prefer a small function that does one thing over an options object.
- Vendored third-party files keep their licence notices and are listed in `docs/third-party.md`.

## Working style

- Work milestones in order. Each ends with a hand-check in the browser, so don't start the next until it passes.
- When a UI decision isn't settled by the specs, ask instead of picking.
- Any change a reader can see updates `extension/help.html` in the same branch, including shortcuts, privacy and voices. It describes only what exists.
- Verify AI API details against the current docs before writing calls, and record drift in `docs/chrome-ai-notes.md`.
- Branch per task from an up-to-date `main`, and use one worktree per session so parallel sessions don't collide.
- Task tracking is private. Commits may start with a key such as `TOLK-12:`, but each commit message must stand on its own.

## Commands

There's no test runner yet.

```
# install the dev tools
npm install

# compile, and recompile on save
npx tsc --watch

# load unpacked
chrome://extensions → Developer mode → Load unpacked → select extension/

# see what the local models can do on this machine
chrome://on-device-internals
```
