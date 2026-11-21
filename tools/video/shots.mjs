// The words on screen. Each shot's caption shows from its start to the next
// shot's start. record.mjs decides what happens in each shot.

export const TITLE_CARD = {
  heading: "Tolk",
  line: "Read real articles and books in the language you're learning",
};

export const CLOSING_CARD = {
  heading: "Everything runs on your own computer.",
  line: "Free and open source",
};

export const SHOTS = [
  { name: "open", caption: "Click Tolk's icon on any article" },
  { name: "read-along", caption: "Tolk reads aloud and highlights each word" },
  { name: "slower", caption: "As slow as you need" },
  { name: "word", caption: "Translate a word and save it with its sentence" },
  { name: "paragraph", caption: "Translate a paragraph without losing the original" },
  { name: "library", caption: "Import EPUB books into your own library" },
  { name: "aquarium", caption: "Every day you read adds a fish" },
  { name: "book-fish", caption: "Each book has its own colour" },
  { name: "day-fish", caption: "Your reading, day by day" },
  { name: "end", caption: null },
];
