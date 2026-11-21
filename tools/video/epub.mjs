// Writes a small EPUB 3 with no dependencies: an uncompressed zip, which every
// EPUB reader accepts as long as `mimetype` comes first.

import { writeFileSync } from "node:fs";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Entries are [name, Buffer], stored without compression. */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const escape = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function chapterPage(book, chapter) {
  const paragraphs = chapter.paragraphs.map((p) => `<p>${escape(p)}</p>`).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${book.language}" lang="${book.language}">
<head><title>${escape(chapter.title)}</title></head>
<body>
<h1>${escape(chapter.title)}</h1>
${paragraphs}
</body>
</html>`;
}

/** Writes `book` to `path`, with `cover` as a PNG Buffer. */
export function writeEpub(path, book, cover) {
  const id = `urn:tolk-demo:${book.file}`;
  const chapters = book.chapters.map((chapter, i) => [`OEBPS/chapter-${i + 1}.xhtml`, chapter]);
  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${book.language}">
<head><title>${escape(book.title)}</title></head>
<body><nav epub:type="toc"><ol>
${chapters.map(([name, c]) => `<li><a href="${name.slice(6)}">${escape(c.title)}</a></li>`).join("\n")}
</ol></nav></body>
</html>`;
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">${id}</dc:identifier>
<dc:title>${escape(book.title)}</dc:title>
<dc:creator>${escape(book.author)}</dc:creator>
<dc:language>${book.language}</dc:language>
<meta property="dcterms:modified">2026-11-21T00:00:00Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>
${chapters.map(([name], i) => `<item id="c${i + 1}" href="${name.slice(6)}" media-type="application/xhtml+xml"/>`).join("\n")}
</manifest>
<spine>
${chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join("\n")}
</spine>
</package>`;
  const container = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;
  const text = (value) => Buffer.from(value, "utf8");
  writeFileSync(
    path,
    zip([
      ["mimetype", text("application/epub+zip")],
      ["META-INF/container.xml", text(container)],
      ["OEBPS/content.opf", text(opf)],
      ["OEBPS/nav.xhtml", text(nav)],
      ["OEBPS/cover.png", cover],
      ...chapters.map(([name, chapter]) => [name, text(chapterPage(book, chapter))]),
    ]),
  );
}
