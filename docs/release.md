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
>
> The screenshots and video show the Dutch Wikipedia article “Stroopwafel”, under CC BY-SA 4.0.

**Category:** Education, if the dashboard still has it. **Language:** English.

**Homepage URL:** https://github.com/kurtcebe/tolk

**Support URL:** https://github.com/kurtcebe/tolk/issues

### Images

All images use our own artwork, and only public domain or properly licensed text. No Chrome or Google branding.

| Image | Size | Needed | Plan |
| --- | --- | --- | --- |
| Store icon | 128 × 128 PNG, 96 px of artwork with 16 px transparent padding | Yes, inside the zip | `extension/icons/icon-128.png` |
| Screenshots | 1280 × 800, square corners, no padding. Up to 5 | At least 1 | Cut from the video's recording: read-along, a word's translation, interlinear translation, the aquarium and calendar, and the books. See below |
| Small promo tile | 440 × 280 PNG or JPEG | No, but items without one are listed after items with one | The aquarium in the light scheme with Tolk's icon, and no text. See below |
| Marquee | 1400 × 560 | Only to be featured there | Skip for now |
| Video | A YouTube link | No | See below |

### Making the images

Both scripts write to `dist/store/`.

**Screenshots** are cut from the raw OBS recording, which has no captions, so they show the same article as the video. The last line of the description credits it. `dist/video/edit.json` lists them next to the cuts:

```json
"screenshots": [
  { "name": "1-read-along", "at": 20.5, "crop": [520, 106, 1400, 875] },
  { "name": "4-aquarium", "at": 56.5, "crop": [320, 160, 1280, 800] }
]
```

`at` is the moment in the recording, in seconds, and `crop` is the part of the 1920 × 1080 frame to keep, as x, y, width and height. It must be 16:10, which leaves out Chrome's toolbar. A 1400 × 875 crop fits the reader's text and its controls and is scaled down to 1280 × 800. The library is narrower, so it's kept at 1280 × 800 with no scaling. Then run `node tools/video/screenshots.mjs`. Look at each one at full size, because the recording is compressed and the pointer is in it.

**The promo tile** is drawn by the extension's own `aquarium.js` in a headless Chrome, with made-up reading days, so it's sharp instead of being cut from the video. Run `npx tsc && node tools/video/promo-tile.mjs`. A number after it, such as `3`, places the fish differently.

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

Optional for the store, which takes a YouTube link. Chrome's guidance is that it shows the real experience, so it's a screen recording of Tolk in Chrome, made by hand in OBS. Only the reading history is staged, because the aquarium takes weeks of reading to fill. The finished video is about 90 seconds at 1920 × 1080.

### Text with clear rights

- **The article:** Dutch Wikipedia's "Stroopwafel". Wikipedia text is CC BY-SA 4.0, so the closing card credits it, and so does the YouTube description.
- **The books:** three short books written for the demo, two Dutch and one German, so the aquarium shows two fish shapes. The text is in `tools/video/content.mjs` and carries this repository's licence.

### Tools

- [OBS Studio](https://obsproject.com/), to record the screen and Chrome's sound.
- Node.js 24, for the scripts in `tools/video/`. They have no dependencies, and none of them ships in the extension.
- ffmpeg. On an Intel Mac, the pip package `imageio-ffmpeg` brings a ready-built binary, which is much faster than Homebrew:

  ```sh
  python3 -m venv ~/.local/share/tolk-video/venv
  ~/.local/share/tolk-video/venv/bin/pip install imageio-ffmpeg
  ```

  The scripts find ffmpeg in `FFMPEG`, then in that venv, then on the `PATH`.

### The recording profile

A separate Chrome profile kept only for recording, so your own books, words and history never appear on screen.

1. Run `node tools/video/demo.mjs`. It writes the three demo books as EPUBs, and `seed-history.js`, into `dist/video/demo/`. The covers are drawn by a headless Chrome, so this takes a few seconds.
2. In the recording profile, load `extension/` unpacked and pin Tolk to the toolbar.
3. Set your own language to English, so the first-run card doesn't cover the opening shot.
4. Import the three books in the library.
5. Open the library's DevTools console, and paste the contents of `dist/video/demo/seed-history.js`. It writes 30 days of reading history through the extension's own stores, so the calendar and aquarium draw it exactly as they would draw real reading. It marks one book finished, so a shell lies on the tank floor, and saves a dozen words, so bubbles rise. Then it reloads the library.
6. Pick a local Dutch voice, and translate something once, so the language pack is already downloaded when filming.

### OBS

- **Video:** canvas and output both 1920 × 1080, 30 fps.
- **Sources:** a *macOS Screen Capture* in window mode, set to the Chrome window, and a *macOS Audio Capture* set to the Google Chrome application only, so notifications and the microphone stay out.
- **Output:** Simple mode, recording quality *Small* or better, x264, hybrid MOV. The file lands in `~/Movies`.
- Size the Chrome window so it fills the canvas, and make a short test recording to check that the voice is in it.

### Shot list

Record in one take and keep going after a slip. Cuts are cheap later. The times are in the finished video, after the 4-second title card.

| Time | On screen | Caption |
| --- | --- | --- |
| 0–4 s | Title card: the Tolk icon and name | Read real articles and books in the language you're learning |
| 5–10 s | The Stroopwafel article, then Tolk's toolbar icon | Click Tolk's icon on any article |
| 11–15 s | Press Play | Press play to hear it read aloud |
| 15–18 s | Click a word further on, and reading jumps there | Click any word to jump there |
| 18–25 s | The highlight follows each word and the sentence | Tolk highlights each word as it's read |
| 26–38 s | Lower the speed, and the voice slows with it | As slow as you need |
| 39–45 s | Select a word, see its translation, press the star | Translate a word and save it with its sentence |
| 46–58 s | Translate a paragraph from its margin, and English lines appear under each sentence | Translate a paragraph without losing the original |
| 58–63 s | Open the library and its books | Import EPUB books into your own library |
| 63–67 s | The aquarium: fish, plants, bubbles and the shell | Every day you read adds a fish |
| 68–72 s | Point at a book, and its fish stand out | Each book has its own colour |
| 72–83 s | Point at a day in the calendar, and that day's fish stand out | Your reading, day by day |
| 84–90 s | Closing card, with the article credit | Everything runs on your own computer. Free and open source |

### Editing

`tools/video/edit.mjs` finishes the recording. It reads `dist/video/edit.json`, which stays out of git because it names a file on your own computer:

```json
{
  "input": "/Users/you/Movies/2026-11-21 19-23-06.mov",
  "cuts": [[62.4, 66.45]],
  "title": { "heading": "Tolk", "line": "Read real articles and books in the language you're learning" },
  "closing": {
    "heading": "Everything runs on your own computer.",
    "line": "Free and open source",
    "credit": "Article: “Stroopwafel”, Dutch Wikipedia, CC BY-SA 4.0"
  },
  "captions": [
    { "from": 0.6, "to": 6.2, "text": "Click Tolk's icon on any article" },
    { "from": 11.0, "to": 14.2, "text": "Click any word to jump there", "align": "right", "y": 0.52 }
  ]
}
```

- `cuts` are stretches of the recording to remove, in seconds.
- Each caption's `from` and `to` are seconds in the original recording, so cuts don't move them. A caption sits at the bottom by default. `align` and `y`, a fraction of the height, move it out of the way of what's on screen.
- `music` is optional. Without it, the script composes a quiet original piece with ffmpeg, so there are no rights to clear. It sits well under the voice and ducks whenever the voice speaks.

Then run:

```sh
node tools/video/edit.mjs
```

It draws the cards and captions in a headless Chrome with Tolk's own fonts, levels the sound to YouTube's usual loudness, and writes `dist/video/tolk-intro.mp4` and `dist/video/tolk-intro.srt`. Its working files go in `dist/video/edit/`. Run it again after every change to the JSON.

### Before uploading

- Watch it all the way through with sound: the highlight and voice in sync, no first-run card, no developer-mode banner, no notifications, and nothing from your own profile.
- Upload to YouTube under an account you're happy to have public, with the `.srt` as English captions. Put the article credit in the description: "Stroopwafel", Dutch Wikipedia, CC BY-SA 4.0, with a link to the article. Then add the link to the store listing.

### The generated video, unfinished

`npm run video` runs an earlier attempt that films and voices the demo with no hand recording: `record.mjs` drives a throwaway Chrome profile through the DevTools protocol, and `assemble.mjs` puts it together. It was set aside because it couldn't show Chrome's toolbar reliably, and the Dutch voice it rendered with `say` barely slowed for small speed changes. The last changes to it are untested, so check it before relying on it.
