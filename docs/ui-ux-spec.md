# UI/UX spec

What Tolk v1 looks like and how it behaves. `product-spec.md` settles what's in scope, and `CLAUDE.md` holds the invariants. If something here seems wrong, raise it rather than quietly diverging.

## Principles

- **The text is the design.** Everything else is apparatus around someone else's words, and reads as apparatus.
- **Each surface owns one scope.** To place something new, find its scope first.
- **Reading always works.** A missing feature is explained where the reader reaches for it, never in a modal or a warning on load.
- **Controls never move the text.** They live in the margin or in overlays (invariant 5).

| Surface | Scope | Contains |
| --- | --- | --- |
| Word popup | A selected word or phrase | Translation, Hear, Save |
| Margin tools | One paragraph | Translate, Read this paragraph |
| Player | The document's playback | Previous, Play, Next, speed, voice |
| Top-right controls | The reader | Book or Learner, your books, read aloud (Book mode), drawer buttons |
| Drawer | Settings and lists | Settings, language status, saved words, contents |

## Reader

A full-page extension page with one centred column and nothing else at rest. There's no product name or heading in the reader.

- **Column:** 640 px wide at the default text size. It scales with the text (32em), so the line length holds at every size.
- **Top-right controls:** fixed in place while the text scrolls, and never over the text. When the right margin has room for the docked player, they form a block of the same 208 px width above it: Book or Learner across the top, then the buttons, four to a row. When it hasn't, they fold into one ⋯ menu button, which opens them as an overlay. The overlay closes with Escape, a press outside it, or once a button in it is used. Switching Book or Learner leaves it open.
- **Text defaults:** 20 px with a line height of 1.65.
- **Length:** one chapter at a time, in one continuous scroll. A live page counts as one chapter. There are no page turns.
- **End of a chapter:** previous and next chapter links in a book, with enough space below the last line that the player never covers it. Using them, or Contents, stops any speech and starts at the top of that chapter.
- **In a book:** the author isn't repeated under each chapter's title. A section with no title in the book shows and speaks none, and Contents calls it "Section 3".
- **Book images:** shown at up to the column's width, with their space reserved before the chapter appears. They aren't read aloud, and neither is their alt text. Links inside a book, such as footnotes and cross-references, are plain text in v1.

### Book and Learner modes

One design that shows more or fewer tools. The modes never have separate styling.

| | Book | Learner |
| --- | --- | --- |
| Margin tools | None | On paragraph hover or keyboard focus |
| Player | Hidden until called up | Always visible |
| Today's reading | Not shown | One line under the docked player |
| Saved words | Not marked | Dotted underline |
| Word popup | Yes | Yes, identical |
| Text and typography | Identical | Identical |

- Learner is the default. The choice is a remembered setting and isn't part of first run.
- The switch is a two-part control at the top right, and switching never moves the text.
- The popup stays in Book mode, because the mode that feels most like reading mustn't remove the help that keeps someone reading.
- An open interlinear translation stays visible when switching to Book, since removing it would move the text. It closes from Learner mode.
- Switching to Book while playing pauses playback and hides the player.
- In Book mode, the read-aloud button opens the player without starting playback, so nothing starts talking unexpectedly. Book mode's player has a close button.

### Opening a reader

- **Live page:** clicking the toolbar icon extracts the current article and opens the reader in a new tab, using `activeTab` with no host permissions. The original tab stays where it was. A keyboard shortcut does the same.
- **No readable article:** the icon opens the library instead, with a short note at the top saying why. The same goes for a page Chrome won't let extensions read, and for an article that couldn't be kept.
- **Article gone:** a reader tab reopened after its article has gone, such as after a browser restart, shows "This article is no longer open. Go back to the page and click the Tolk icon."
- **What an article shows:** its text and links. Images are dropped and their captions kept, each list item and table row is one paragraph, and a code block is a plain paragraph. A list's bullet or number is drawn beside the text and is never read aloud.
- **Book:** from the library, resuming at the reading position, with that word at the top of the window.
- **Book gone:** a reader tab whose book has been deleted shows "This book is no longer in your library.", with a link to the library. A book that can't be opened shows "This book couldn't be opened.", with the same link.
- **Library link:** a button in the reader's top-right controls, in both modes, as well as in the toolbar icon's menu and at the bottom of the settings drawer. In a book, the button and the drawer link open the library in the same tab, and clicking the book resumes it. In a live article they open a new tab, so the article stays open.

## Player

A narrow panel, 208 px wide, in the right margin under the top-right controls, where it covers no text. When the margin is too small for it, because of the window width or a large text size, it becomes a floating bar at the bottom of the window, 660 px wide, over the text. Changing between the two moves no text.

### Highlighting

- **Current sentence:** a faint band, which is what lets a reader look away and find their place again.
- **Current word:** a stronger wash on top. It paints background only, using the CSS Custom Highlight API.
- **Voices without word positions:** the sentence band alone. A drifting word highlight teaches the wrong word, so never guess.

### Speed

A slider with fine steps, labelled Slower and Faster at its ends, with a mark at the centre.

- The ends are `rate` 0.1, the API's minimum, and `rate` 2. Each half has its own scale, so the centre stays at normal.
- The centre mark is the voice's normal speed, `rate` 1.
- A label under the slider reads "Normal speed", "Slower than normal" or "Faster than normal". Away from normal, it adds Reset, and clicking it returns to normal.
- **No percentages or multipliers.** `rate` isn't the true speed and differs by voice, so "normal" is the only point we can promise.
- The slider snaps to normal nearby. The snap zone covers the range where local voices don't change speed at all, about `rate` 0.95 to 1.02 on the Mac we tested, so the label doesn't say "slower" while the voice sounds the same.
- Changing speed during playback restarts from the current position, because `rate` is fixed per utterance.

Speed and voice are remembered per language. Speed follows the Chrome profile, while a voice choice stays on the computer where it was made, so picking a remote voice on one computer can't start sending text to Google from another.

### Voices

- A local voice is the default.
- The voice picker shows each voice as local or remote, and says when a voice highlights the sentence only. That's only known once a voice has spoken, so it appears after the first use in a session.
- With a remote voice chosen, the player says: "This voice sends the text to Google to be spoken." If it reports no word positions, it adds that only the sentence is highlighted.

### What gets read

The chapter title and every block are read aloud. The byline isn't.

### Seeking

- Clicking a word seeks while a session is under way, playing or paused. From idle, a click does nothing.
- A drag or double-click is selecting, not seeking.
- A click on a word inside a link follows the link.
- Read this paragraph, from the margin tools, plays that one paragraph and stops at its end.
- Hear, from the popup, plays only the selection and stops. It never scrolls the page.
- Clicking either one again stops it early.
- Either one interrupts a session under way, which then waits, paused, at the place it had reached. Seeking or stepping during them takes over from there instead.
- With only remote voices, they offer a voice like Play does, opening the player in Book mode. With a remote voice already chosen, the popup doesn't repeat that its text goes to Google: the voice picker and the player say so, and the help page explains it. With no voices, or while the language is Unknown, they're hidden.

### Scrolling during playback

- The text stays still while the highlight moves down the screen, so nobody is reading moving text.
- When the highlight reaches about two-thirds of the way down, the page scrolls smoothly to bring it back to the upper third. With `prefers-reduced-motion`, it jumps instead.
- Manual scrolling stops following immediately, and the audio carries on. "Back to reading position" appears by the player.
- Pressing Play while scrolled away continues from where reading stopped and scrolls back there.
- At the end of a book chapter, playback continues into the next one, and the chapter title shows for about 2 seconds in a small overlay at the top, which moves no text. A chapter that's only a picture is passed over.
- Pressing Play from idle in a book starts at the first sentence that starts on screen, so resuming doesn't jump back to the chapter's start.
- In Book mode with the player hidden, nothing scrolls by itself.

## Translate

### Word popup

Appears when a word or phrase is selected, anchored below the selection and flipping above it near the bottom of the window. It shows the selected text, its translation with no further click, Hear and Save.

Dismissed by clicking away, Escape or changing the selection. A late result never lands in a newer popup. A partly selected word counts as the whole word. A dismissed selection doesn't reopen until it changes.

- **Unknown language:** the selected text and "Choose the text's language to translate. [Choose]", with no Hear or Save.
- **Failure:** "Couldn't translate this. [Try again]". Save still works, with the translation blank.
- **Saving before the result:** the word saves straight away and gets its translation when it arrives, even if the popup has closed.
- **Clicking inside it:** keeps the selection, which means the translation can't be selected and copied.

### Paragraph

Translate in the margin tools gives interlinear lines, with an L1 line under each L2 sentence.

- **Style:** the interface font at about 0.82em in the muted colour. No italics, since they hurt legibility at small sizes.
- **Structure:** per sentence, so pairs hold when a sentence wraps. A sentence ending inside an inline element such as emphasis has its line straight after that element.
- **Toggle:** clicking Translate again removes the lines, and the L2 stays intact. Clicking while it's still working cancels it.
- **Timing:** all the lines appear together, so the text below moves once.
- **Failure:** if every sentence fails, a note beside the tools says "Couldn't translate this paragraph. [Try again]" and the text doesn't move. If only some fail, each of those says "Couldn't translate this sentence." on its line.
- **Changing your own language:** lines already showing stay as they are, and the next Translate uses the new language.

### Margin tools

Icon buttons with tooltips, stacked in the left margin level with the paragraph's first line. Paragraphs and quotes get them, and headings don't. When the margin is too small, they become a `⋯` control in the gap above the paragraph, opening a small labelled menu over the text.

Interlinear lines are content the reader asked for, not a control, so the text below them moves. Text already above them stays still.

## Saved words

Saving takes one click on the star in the popup, with no dialog, and the star fills. Clicking it again unsaves. Asking people to categorise at save time is how word lists die. A word or phrase is saved once per language, so its star stays filled wherever it appears again, and the first sentence it was saved from is the one kept.

Each entry stores the word or phrase, translation, context sentence, source, L2 and date. If translation isn't available, the word still saves with the translation blank.

The list is a drawer view, reachable from the reader and the library:

- Grouped by day, newest first. Each entry shows the word, translation, sentence and source.
- A live page's source links to its original URL, which only opens on a click. A book's source opens that book. If the book has been deleted, the source shows the title without a link.
- Deleting from an entry's `⋯` menu happens straight away, with a brief Undo.
- A language selector appears only once there are saved words in two or more languages.
- The notice reads: "Saved in this browser only. Uninstalling Tolk deletes them."
- **Export for Anki (TSV):** word, translation, sentence and source, for the selected language, so each language can go into its own deck. A missing translation is a blank column. The file starts with Anki's `#separator`, `#html` and `#columns` headers, which need Anki 2.1.54 or later.

Saved words get a dotted underline in Learner mode wherever they appear again. Matching is deliberately cautious, since a missed match costs little and a false one misleads: the same whole words in the same order, ignoring case, within one sentence and in the same language. Other forms of a word don't match.

Left out of v1: search, tags, editing a translation and filling in blank translations later.

## Library

A separate full page in the same style and colour scheme.

- **Header:** "Your books", Import EPUB, and a permanent notice: "Books and your reading history are stored in this browser only. Uninstalling Tolk deletes them."
- **Top right:** the saved words star and a Help link. There's no settings drawer, so colour and type are set in the reader.
- **Note:** when the icon landed here because a page had no article, a line above the header says why.
- **Grid:** cover, title, author and progress, with the most recently read first. Progress shows a bar with a percentage, or "New".
- **Opening:** clicking a book resumes where the reader left off.
- **Import:** the button, or a file dropped anywhere on the page. A card appears straight away showing "Importing…".
- **No cover:** a plain generated cover showing the title.
- **Empty:** a large drop area, the import button and the notice.
- **Delete:** a `⋯` menu on the card, with confirmation on the card itself: "Delete this book and your reading position?" Saved words from that book stay.

Import problems appear on the card with a Remove button, so a failure can't be missed and the rest of the library keeps working:

- **DRM:** "This book is copy-protected, so Tolk can't open it."
- **Invalid file:** "This file couldn't be read as an EPUB."

### Your reading

A section above "Your books", hidden until there's a day with history.

- **Calendar:** one month, weeks starting on the browser's locale's first day, with ‹ and › to move between months. It goes back to the first month with history, and no further forward than this month.
- **Days:** each day is shaded in one of four levels, from none to a lot, scaled to the month's busiest day, so a light reader's calendar fills in as much as a heavy one's. Today has a ring. A day under a minute shows as none. Each day's accessible name says the date and its time, such as "12 November, 34 minutes".
- **Chosen day:** today, until another day is chosen. Below the calendar, its time and words per language, such as "Dutch · 34 min · 4,120 words", and the titles of the books read that day. A live article shows as "Articles", without its title.
- **Month total:** time and words for the month shown, across all languages.
- **Clear reading history:** a quiet button at the end of the section, with confirmation inline: "Clear all your reading history? Your books and saved words stay." Clearing hides the section.

### Today's reading in the reader

In Learner, one line under the docked player: "Today · 18 min · 2,340 words", for the text's language. It shows from the first counted minute of the day, and updates once a minute rather than ticking. It isn't shown while the player is the bar at the bottom of the window, or in Book mode, or while the language is Unknown. It never covers text, because it lives in the margin with the player.

### What counts

- **Time:** while the reader tab is visible and the reader has scrolled, selected text or changed chapter in the last 60 seconds, or while speech is playing. A tab left open in front doesn't count once that minute runs out.
- **Words:** a word counts once per open book or article, the first time it's on screen while time is counting, or when it's spoken. Scrolling back over it doesn't count it again.
- **Language:** the text's current language, including a language the reader chose by hand. Nothing counts while it's Unknown.
- **Day:** the computer's local date. Reading past midnight counts towards the new day from then on.

## Drawer

A 320 px panel from the right, over the page. It never resizes the text column. It closes from the button that opened it, even when that button is folded into the menu, with Escape, or with a press on the text or the page behind it, and that same press still selects or seeks. Pressing the top-right controls, the player or the word popup leaves it open.

- **Settings (`Aa`):** colour scheme, font, text size, line spacing, language status, your own language, and the library and help links.
- **Saved words (star):** see above.
- **Contents (list icon, books only):** the chapter list, with the current chapter marked.

## Availability

Every feature is checked per language, and translation per language pair (invariant 3).

### Translation

| State | Word popup | Margin Translate |
| --- | --- | --- |
| Ready | Shows the translation | Works |
| Needs download | `Download Dutch to English` in place of a translation | First click starts the download |
| Downloading | Progress, then the translation | Progress ring |
| Not available | "Translation from Dutch to English isn't available on this device." | Hidden |

- Selecting a word never starts a download, because people select text constantly. Clicking Translate on a paragraph is a clear enough request.
- Progress is a percentage or ring only, since Chrome gives no size. The reader can keep reading and close the popup.
- A failed download shows "Download didn't finish" with Try again.
- If Chrome evicts a model, the next reader load shows Needs download again.

### Voices

| Voices for this language | Player |
| --- | --- |
| Local | Uses one by default |
| Remote only | Doesn't start on its own. Play offers the voice, with the note that its text goes to Google, and it plays only if picked |
| None | One line: "No voice for Dutch on this device. How to add a voice", linking to the help page. In Book mode, the read-aloud button is hidden |

### Language detection

- **Detected:** `Language: Dutch (detected) [Change]` in the settings drawer. Change applies to that document only.
- **Unsure or unavailable:** `Language: Unknown [Choose]`. The text stays readable, and translation and voices start once a language is chosen. If detection only needs a download, a button offers it.
- **While Unknown:** the drawer hides the Translation and Read aloud rows. The player hides its transport and shows "Choose the text's language to read aloud. [Choose]", which opens the drawer on the dropdown. In Book mode, the read-aloud button is hidden.
- **Change and Choose:** a native dropdown in the drawer, listing Chrome's translation languages and the detected language. After an override, the line reads `Language: German (chosen)`, and the dropdown's "Use detected language" undoes it.
- **How long an override lasts:** until the page closes for a live page. A book saves its override with the book.
- **Text movement:** the text carries its language in `lang`, so the font can draw that language's letters correctly. For Turkish, this re-wraps some lines once when the language changes. Correct letters are worth it, since telling `i` from `ı` matters to a learner. Of Chrome's 39 translation languages, only Turkish moved the sample text when tested on 2026-11-09.
- **Never** fall back on the page's own `lang` tag, which often describes the site rather than the article.
- **L2 equals L1:** Translate and Save disappear with no message. Read-along stays.

### Status in the drawer

```
Language: Dutch (detected)   [Change]
Translation    Ready
Read aloud     2 local voices, 1 remote
```

Needs download adds a Download button. Not available adds a line pointing to `chrome://on-device-internals`. Never put hardware figures in the UI.

## First run

One small card over the first reader opened, with no welcome page or feature tour.

```
What should Tolk translate into?
[ English                        ▾]
Translation and local voices run on this device.
                          [ Continue ]
```

- It asks for L1 only, pre-filled from the browser's language, and it can be changed later in the drawer.
- It never asks for L2, which is detected per document.
- Model downloads are explained at the first click that needs one, not here.
- It doesn't block anything, and the text stays scrollable behind it. Only Continue saves and closes it, and the pre-filled language applies until then. If the browser's language isn't one Chrome translates, it pre-fills English.

## Help

A separate page in the same colour scheme, in English, covering what Tolk is, its features, keyboard shortcuts and privacy. It's reached from the settings drawer and from messages that need more explanation than fits on one line, such as having no voice. It opens in a new tab so the reader keeps their place, and it never opens by itself.

It describes only what exists, so each milestone adds its own features.

## Visual identity

**Quiet book:** warm paper, a strong reading serif and one ink accent.

### Type

- **Reading:** Literata. A reader can switch the text to Instrument Sans.
- **Interface and interlinear text:** Instrument Sans.
- **Text size:** 16 to 28 px, 20 by default, set with a − / + stepper in 2 px steps.
- **Line spacing:** Compact 1.45, Normal 1.65, Airy 1.9.

Fonts ship inside the extension and are listed in `third-party.md` (invariant 6).

### Colour

Light, Sepia, Dark and Dim. It follows the system's light or dark setting until a reader picks a scheme, and an Auto option goes back to following it. Dim is the lower-contrast dark option.

| Token | Light | Sepia | Dark | Dim |
| --- | --- | --- | --- | --- |
| Background | `#FBF8F1` | `#F1E6D0` | `#1A1B1E` | `#24262A` |
| Surface | `#FFFDF8` | `#F9F1E0` | `#26272B` | `#2E3035` |
| Text | `#25231E` | `#33291C` | `#E9E5DB` | `#C9C5BA` |
| Muted text | `#625D52` | `#5F5140` | `#ABA69A` | `#A09C91` |
| Line | `#E0D9C9` | `#D8C8A9` | `#3B3C41` | `#43454B` |
| Accent | `#1F4E79` | `#234B6E` | `#9CC2E8` | `#8FB0CF` |
| On accent | `#FFFFFF` | `#FFFFFF` | `#10202F` | `#12202D` |
| Sentence band | `#E5E9DF` | `#E0D5BB` | `#2D3138` | `#363A41` |
| Current word | `#CFE0F1` | `#C4D3D6` | `#385470` | `#3D5269` |
| Selection | `#F2DFA8` | `#E9CD8C` | `#6A5526` | `#5E4F2B` |
| Active tool | `#DCE6F0` | `#D5D8D0` | `#2F3C4A` | `#36404B` |

The highlights were judged by eye in a mockup, so check them again in the real reader and on real text in each scheme.

### Icons

Simple outline icons with rounded joins and a stroke of about 1.8 at 20 px. Don't copy Chrome's icons or artwork (see `product-spec.md`). A vendored icon set counts as a dependency, so ask first.

## Keyboard and focus

- **Space:** play or pause.
- **Left and right arrows:** previous and next sentence.
- **`[` and `]`:** slower and faster.
- **Escape:** closes the popup, then the drawer.
- **`Alt+Shift+R`** (`Option+Shift+R` on a Mac): opens the current page's article, from any page. Readers can change it at `chrome://extensions/shortcuts`.

Apart from that one, shortcuts apply on the reader page only and don't fire while typing in a field. Every control has a visible focus ring, and margin tools appear on keyboard focus as well as hover.

## Narrow windows

- Below the width where the margin fits the tools, they collapse into one overflow control at the paragraph's top-left, which still doesn't move the text.
- The column shrinks to fit, with a 16 px gutter.
- The player moves from the margin to the bottom of the window, and its voice button shortens to the voice name, then to an icon.
- The drawer covers the text rather than pushing it.

## Long selections

The popup translates a selection of any length and scrolls within itself if the result is long. Save appears only for selections of up to 20 words within one block, which is enough for most whole sentences. Longer selections can still be translated and heard.

## After v1: reserved room

Don't design these yet. The v1 layout just needs to leave them somewhere to go.

| Feature | Where it goes |
| --- | --- |
| Simplify | Margin tools for a paragraph, popup for a word or phrase. A persistent margin marker shows a simplified paragraph and reverts it |
| Explain | Margin tools, with the answer shown below the paragraph |
| Word cards | Extra fields on a popup result and a saved word entry |
| Read it back to me | The player, or per sentence, for languages with a local speech pack |
| Recaps and chapter checks | A book's start and end of chapter |

These follow the same availability rules. The Prompt API adds a cold-start wait that the four states can't show, so it will need its own design when Simplify arrives.
