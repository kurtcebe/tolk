# Releasing Tolk

How a version gets from `main` to the Chrome Web Store, and the listing text to paste into the dashboard. The store's requirements were read from Chrome's docs on 2026-11-21. Check them again in the dashboard each time, because they change.

## Versions

`version` in `extension/manifest.json` and `package.json` stay the same. The first store release is 1.0.0. After that, a fix raises the patch number and a new feature raises the minor number. The store rejects an upload whose version isn't higher than the published one.

## Before every release

1. On `main`, raise the version in both files.
2. Run `npm run package`. It recompiles from scratch and writes `dist/tolk-<version>.zip`.
3. Unzip it into a new folder, and load that folder unpacked in a fresh Chrome profile, so no settings or books carry over. Then run a full pass:
   - an article, and a page with no article
   - importing an EPUB, and opening it from the library
   - read-along with a local voice, then a remote one across a chapter change
   - translating a word and a paragraph, including a download from Needs download
   - saving words, and exporting them
   - the library's calendar and aquarium after a minute's reading
4. Note the install warning Chrome shows for the permissions. If it changed, update the listing.
5. Check that `help.html`, `README.md` and `PRIVACY.md` describe this version. If the privacy policy changes, give it a new effective date.

## Publishing

1. Push `main` and the release tag to GitHub. The listing's homepage, support and privacy links point there, so this has to happen before submitting. Before the first push, check the history for anything private: tickets and `CLAUDE.local.md` are gitignored, and commits use the noreply address.
2. In the [developer dashboard](https://chrome.google.com/webstore/devconsole), upload the zip. For a new item, choose *Add new item*. For an update, use the item's Package tab.
3. Fill in or check Store listing, Privacy, Distribution and Test instructions, using the text below.
4. Choose *Submit for review*, and **untick publishing automatically** in the confirm dialog. After review, there are 30 days to publish before the submission goes back to draft.
5. When it passes, install the staged version in a fresh profile if the dashboard offers it, then publish.
6. After publishing, install from the store in a fresh profile and check that the capability stub is ignored: in a reader tab's console, `chrome.storage.local.set({ capabilityStub: { translator: "unavailable" } })` and a reload should change nothing.
7. Tag the release as `v<version>`, and on the first release, add the store link to the README.

Review usually takes a few days and sometimes a few weeks. New developers and new extensions get a closer look. If it's pending for more than three weeks, contact developer support. A rejection email names the policy it broke and how to appeal.

## The developer account

Registered once, from the dashboard link above: agree to the developer agreement, pay the one-time fee, then fill in the Account page and verify the contact email. The account's email can never be changed afterwards. Turn on the review and staged notifications on the Account page.

A new publisher can have at most two published extensions until they ask for more.

## Store listing

**Name:** Tolk

**Summary,** from the manifest's `description`: Read real articles and books in the language you're learning, with everything running on your own machine.

**Description:**

> Tolk is a reader for web articles and EPUB books in a language you're learning. It reads the text aloud and highlights each word as it's spoken, translates what you select, and keeps the words you want to remember.
>
> It's made for people who can read authentic text in another language, but slowly and with gaps. Instead of switching to the translation after three unknown words, you keep reading.
>
> Features:
> • A clean reader for the article on the current page, or for EPUB books in your own library
> • Read-along that highlights the current word and sentence, with a fine speed control that goes down to slow speeds
> • Translation of a word, a phrase or a whole paragraph, shown under each sentence so the original stays in view
> • Saved words, with their translation and the sentence they came from, exportable to Anki
> • A calendar of how much you read each day, and an aquarium that fills with a fish for each day you read
> • Book and Learner modes, and Light, Sepia, Dark and Dim colour schemes
>
> Tolk detects the language of the text itself. You tell it your own language once.
>
> Privacy: language detection and translation use Chrome's built-in AI and run on your computer. Tolk has no account or analytics and makes no network requests of its own. Your books, saved words and reading history stay in your browser. If Chrome sync is on, your settings go to your Google account. If you choose one of Chrome's remote voices, Chrome sends the spoken text to Google. Local voices are the default.
>
> What it needs: Chrome 138 or later on a desktop computer. Translation depends on your computer and the language pair, and Chrome downloads a language pack, about 80 MB, the first time you ask. Read-along needs a voice for the language. Languages written right to left aren't supported yet.
>
> Tolk is free and open source, under the Apache 2.0 licence.

**Category:** Education, if the dashboard still has it. **Language:** English.

**Homepage URL:** https://github.com/kurtcebe/tolk

**Support URL:** https://github.com/kurtcebe/tolk/issues

### Images

All images use our own artwork, and only public domain or properly licensed text. No Chrome or Google branding.

| Image | Size | Needed | Plan |
| --- | --- | --- | --- |
| Store icon | 128 × 128 PNG, 96 px of artwork with 16 px transparent padding | Yes, inside the zip | `extension/icons/icon-128.png` |
| Screenshots | 1280 × 800, square corners, no padding. Up to 5 | At least 1 | Read-along in progress, the word popup with interlinear translation, saved words, the library with the aquarium and calendar, Book mode |
| Small promo tile | 440 × 280 PNG or JPEG | No, but items without one are listed after items with one | Icon and aquarium, with little or no text |
| Marquee | 1400 × 560 | Only to be featured there | Skip for now |
| Video | A YouTube link | No | See below |

## Privacy tab

**Single purpose:** Read web articles and EPUB books in a language you're learning, with read-aloud and translation that run in the browser.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `activeTab` | Reads the current page's article only after the user clicks the toolbar icon or presses the shortcut. |
| `scripting` | Runs the article extraction in that tab, after that click. |
| `storage` | Keeps settings and voice choices, and passes the extracted article to the reader tab. |
| `unlimitedStorage` | Keeps imported books and saved words from being evicted when disk space runs low. |
| `contextMenus` | Adds "Open library" to the toolbar icon's right-click menu. |

**Remote code:** No, I am not using remote code.

**Data use.** Check the dashboard's own wording each time. Tolk itself collects nothing: no data reaches the developer. What it handles on the device is website content, the page the user opens, and the books they import. Two things leave the device through Chrome, and the policy says so: settings through Chrome sync, and the text spoken by a remote voice the user picks. Tick the three certifications: no selling, no use unrelated to the single purpose, no use for credit.

**Privacy policy URL:** https://github.com/kurtcebe/tolk/blob/main/PRIVACY.md

## Distribution

Free, public, in all countries.

## Test instructions

> No account or sign-in is needed. Click the toolbar icon on an article, for example a Wikipedia page, to open it in the reader. Press Play to hear it read aloud with word highlighting, select a word to translate it, and press the star to save it. Right-click the toolbar icon and choose Open library to import an EPUB, for example any book from Project Gutenberg.
>
> Translation and language detection use Chrome's built-in on-device AI, so they depend on the machine. If they aren't available, the settings panel (Aa) says so, and reading and read-aloud still work. Chrome may need to download a language pack the first time you translate, which starts when you click Download or Translate.

## Introduction video

Optional for the store, which takes a YouTube link. Chrome's guidance is that it shows the real experience, so everything on screen is Tolk running in Chrome. Only the reading history is staged, because the aquarium takes weeks of reading to fill.

The video is generated by scripts in `tools/video/` instead of being recorded by hand. `record.mjs` drives a real Chrome window through the DevTools protocol and captures each tab's frames. `assemble.mjs` adds the voice, captions and cards, and encodes an MP4 with ffmpeg. None of it ships in the extension.

Branded Chrome no longer loads an unpacked extension from the command line, so `record.mjs` starts Chrome with `--remote-debugging-pipe` and `--enable-unsafe-extension-debugging`, and loads `extension/` with the protocol's `Extensions.loadUnpacked`. It opens the article with `Extensions.triggerAction`, which runs the toolbar icon's own code.

### Tools

- Node.js 24, which has `fetch` and `WebSocket` built in, so the script has no dependencies.
- ffmpeg. On an Intel Mac, the pip package `imageio-ffmpeg` brings a ready-built binary, which is much faster than Homebrew:

  ```sh
  python3 -m venv ~/.local/share/tolk-video/venv
  ~/.local/share/tolk-video/venv/bin/pip install imageio-ffmpeg
  ```

- macOS's Dutch voice Xander, under System Settings → Accessibility → Spoken Content → System voice → Manage Voices.

### Text with clear rights

Every text in the video was written for it, in `tools/video/content.mjs`, so it carries this repository's licence and needs no credit.

- **The article:** a short Dutch piece about cycling, served as an ordinary-looking news page from `127.0.0.1` by the script, so no real site appears and nothing is fetched while recording.
- **The books:** two short Dutch books and one German one, so the aquarium shows two fish shapes. `epub.mjs` writes them as EPUB 3 files, with covers Chrome renders from `cards.mjs`.

### The recording profile

A new, empty Chrome profile in a temporary folder, deleted afterwards, with the extension loaded unpacked from `extension/`. Your everyday profile is never opened. The one thing copied from it is Chrome's `TranslateKit` folder, the translation packs, so the demo doesn't download them again.

1. Set your own language to English, so the first-run card doesn't cover the opening shot.
2. Import the three books through the library's file input.
3. Mark one book finished, so a shell lies on the tank floor.
4. Write 30 days of reading history through the extension's own `history-store.js`, so the calendar and aquarium draw it exactly as they would draw real reading. The days follow a believable pattern: most days, a few misses, two to three books on a busy day, one German day a week, some article days for the silver fish, and a few longer streaks so the plants grow.
5. Save a dozen words, so bubbles rise.
6. Choose Xander as the voice, at 85% speed, and create a Dutch to English translator and a language detector once, so the reader finds both ready.

### Shot list

About 80 seconds at 1280 × 800, the same size as the screenshots. Captions are in `tools/video/shots.mjs`, and what happens in each shot is in `filmShots()` in `record.mjs`. The pointer is drawn into the page, because Chrome's frames don't include it, and follows every mouse event the script sends. The library is filmed at 80% zoom, so the aquarium, the calendar and the covers fit on one screen.

| Time | Shot | On screen | Caption |
| --- | --- | --- | --- |
| 0–4 s | Title card | The Tolk icon and name | Read real articles and books in the language you're learning |
| 4–10 s | Open an article | The Dutch news page, then the reader after the toolbar action | Click Tolk's icon on any article |
| 10–23 s | Read-along | Play at 85% speed. The highlight follows each word and the sentence | Tolk reads aloud and highlights each word |
| 23–33 s | Slower | `[` three times: the slider steps down and the voice slows with it, then Pause | As slow as you need |
| 33–41 s | A word | Double-click *verkeerslichten*, the popup says *traffic lights*, press the star | Translate a word and save it with its sentence |
| 41–49 s | A paragraph | Translate in the third paragraph's margin, and English lines appear under each sentence | Translate a paragraph without losing the original |
| 49–55 s | Library | The books button opens the library, which scrolls to three covers with their colour dots and progress | Import EPUB books into your own library |
| 55–61 s | Aquarium | Back up to the tank: fish, plants, bubbles and a shell on the floor | Every day you read adds a fish |
| 61–67 s | A book's fish | Point at *Een jaar in Amsterdam*, and its fish stand out while the rest fade | Each book has its own colour |
| 67–74 s | A day's fish | Point at the day 8 days ago, and that day's fish stand out | Your reading, day by day |
| 74–79 s | Closing card | | Everything runs on your own computer. Free and open source |

The captions fade in and out over the bottom of the frame, and also go in a separate `.srt` file for YouTube.

### The voice

Capturing a tab's frames doesn't capture its sound. During the recording, the script wraps `speechSynthesis.speak` in the reader tab and logs each sentence's text, rate and voice, when it started and stopped, and when each word began. `assemble.mjs` then renders the same text offline with the same voice, `say -v Xander`, and places each sentence at its recorded start. To find the pace, it renders the text up to the last word Chrome reported and compares that clip's length with when Chrome reached that word. A sentence Chrome cut short, such as when the speed changes, is cut at the same moment. The script prints each sentence's start and pace, and a pace far from 1.00 is worth a listen.

### Producing it

```sh
npm run video
```

It takes about two minutes. A Chrome window opens and speaks, so leave it alone until it closes. Then it writes `dist/video/tolk-intro.mp4` and `dist/video/tolk-intro.srt`, and keeps the raw frames and timings in `dist/video/work/`. `node tools/video/assemble.mjs` on its own rebuilds the MP4 from those, which is enough after changing a caption's timing or the cards. It finds ffmpeg in `FFMPEG`, then in the venv above, then on the `PATH`.

### Before uploading

- Watch it all the way through with sound: the highlight and voice in sync, no first-run card, no developer-mode banner, and no text from outside the chosen sources.
- The screen needs room for a 1280 × 800 page plus Chrome's toolbar, or `record.mjs` stops and says so.
- Upload to YouTube under an account you're happy to have public, with the `.srt` as English captions. Add a credit for the texts in the description. Then add the link to the store listing.
