// Finishes a screen recording made by hand: cuts out mistakes, adds the title
// and closing cards and the captions, levels the sound, and writes an MP4 and
// an .srt for YouTube.
//
//   node tools/video/edit.mjs [dist/video/edit.json]
//
// The JSON names the recording, the cuts, the cards and the captions. It stays
// in dist/, because it points at a file on your own computer.
//
// Times in the JSON are seconds in the original recording. Cards and captions
// are drawn by Chrome from cards.mjs, so they use Tolk's own fonts and colours.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captionHtml, closingCardHtml, titleCardHtml } from "./cards.mjs";
import { attach, launchChrome, sleep } from "./cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EXTENSION = join(ROOT, "extension");
const spec = JSON.parse(readFileSync(process.argv[2] ?? join(ROOT, "dist/video/edit.json"), "utf8"));
const OUT = join(ROOT, "dist/video");
const WORK = join(OUT, "edit");
const TITLE_SECONDS = 4;
const CLOSING_SECONDS = 6;
const FPS = 30;

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

const ffmpeg = findFfmpeg();
const info = (() => {
  try {
    execFileSync(ffmpeg, ["-hide_banner", "-i", spec.input], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    return String(error.stderr);
  }
  return "";
})();
const size = info.match(/, (\d{3,5})x(\d{3,5})[ ,]/);
const duration = info.match(/Duration: (\d+):(\d+):([\d.]+)/);
if (!size || !duration) throw new Error(`Couldn't read ${spec.input}`);
const width = Number(size[1]);
const height = Number(size[2]);
const sourceSeconds = Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);

// The parts kept, and where a moment in the recording lands in the video.
const cuts = [...spec.cuts].sort((a, b) => a[0] - b[0]);
const keep = [];
let from = 0;
for (const [start, end] of cuts) {
  keep.push([from, start]);
  from = end;
}
keep.push([from, sourceSeconds]);
const place = (t) => {
  let removed = 0;
  for (const [start, end] of cuts) {
    if (t >= end) removed += end - start;
    else if (t > start) return TITLE_SECONDS + start - removed;
  }
  return TITLE_SECONDS + t - removed;
};
const filmSeconds = keep.reduce((sum, [a, b]) => sum + (b - a), 0);
const totalSeconds = TITLE_SECONDS + filmSeconds + CLOSING_SECONDS;

console.log("Drawing the cards and captions");
const images = await renderImages();
const captions = spec.captions.map((caption, i) => ({
  text: caption.text,
  image: images.captions[i],
  // Where the caption's middle sits, as a fraction of the height. Bottom by default.
  y: caption.y,
  start: place(caption.from),
  end: place(caption.to),
}));
writeFileSync(join(OUT, "tolk-intro.srt"), srt(captions));

console.log("Making the music");
const music = spec.music ?? makeMusic(totalSeconds);
console.log("Encoding");
encode();
console.log(`Wrote ${join(OUT, "tolk-intro.mp4")} (${totalSeconds.toFixed(1)} s) and tolk-intro.srt`);

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const venv = join(homedir(), ".local/share/tolk-video/venv/bin/python");
  if (existsSync(venv)) {
    return execFileSync(venv, ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"], { encoding: "utf8" }).trim();
  }
  return "ffmpeg";
}

async function renderImages() {
  const site = join(WORK, "site");
  mkdirSync(site);
  const types = { ".html": "text/html; charset=utf-8", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
    const file = path.startsWith("/fonts/") || path.startsWith("/icons/") ? join(EXTENSION, path) : join(site, path);
    if (!file.startsWith(EXTENSION) && !file.startsWith(site)) return response.writeHead(403).end();
    try {
      const body = readFileSync(file);
      response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const profile = mkdtempSync(join(tmpdir(), "tolk-edit-"));
  const { child, cdp } = launchChrome(profile, ["--headless=new"]);
  try {
    const { targetInfos } = await cdp.send("Target.getTargets");
    const page = await attach(cdp, targetInfos.find((t) => t.type === "page").targetId);
    await page.send("Page.enable");
    // Cards are designed at 1280 wide, so larger videos draw them at a higher scale.
    const scale = width / 1280;
    const shoot = async (name, html, h, transparent = false) => {
      writeFileSync(join(site, `${name}.html`), html);
      await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: Math.round(h / scale), deviceScaleFactor: scale, mobile: false });
      await page.send("Emulation.setDefaultBackgroundColorOverride", transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
      const loaded = cdp.waitFor("Page.loadEventFired", (_, sessionId) => sessionId === page.sessionId);
      await page.send("Page.navigate", { url: `${base}/${name}.html` });
      await loaded;
      await page.evaluate(`document.fonts.ready.then(() => true)`);
      await sleep(100);
      const { data } = await page.send("Page.captureScreenshot", { format: "png" });
      const file = join(WORK, `${name}.png`);
      writeFileSync(file, Buffer.from(data, "base64"));
      return file;
    };
    const result = {
      title: await shoot("title", titleCardHtml(spec.title.heading, spec.title.line), height),
      closing: await shoot("closing", closingCardHtml(spec.closing.heading, spec.closing.line, spec.closing.credit), height),
      captions: [],
    };
    for (const [i, caption] of spec.captions.entries()) {
      result.captions.push(await shoot(`caption-${i}`, captionHtml(caption.text, caption.align), Math.round(110 * scale), true));
    }
    return result;
  } finally {
    child.kill();
    server.close();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

/**
 * A quiet, original piece, so there are no rights to clear: a slow pad over
 * C, A minor, F and G, four seconds a chord, with a soft arpeggio on top.
 */
function makeMusic(seconds) {
  const chords = [
    [130.81, 261.63, 329.63, 392.0],
    [110.0, 220.0, 261.63, 329.63],
    [87.31, 174.61, 220.0, 261.63],
    [98.0, 196.0, 246.94, 293.66],
  ];
  const pick = (note) => chords.reduceRight((rest, chord, i) => `if(eq(ld(0),${i}),${chord[note]},${rest})`, "0");
  // ld(0) is the chord, ld(1) the time into it, ld(2) the arpeggio note.
  const setup = "st(0,mod(floor(t/4),4))+st(1,mod(t,4))+st(2,mod(floor(t*2),4))";
  const swell = "(1-exp(-ld(1)*1.5))*(0.6+0.4*exp(-ld(1)*0.4))";
  const pad = [0, 1, 2, 3].map((n) => `sin(2*PI*${pick(n)}*t)*${n === 0 ? 0.5 : 0.3}`).join("+");
  const arpNote = `if(eq(ld(2),0),${pick(1)},if(eq(ld(2),1),${pick(2)},if(eq(ld(2),2),${pick(3)},${pick(2)})))*2`;
  const arp = `sin(2*PI*${arpNote}*t)*exp(-mod(t,0.5)*5)*0.25`;
  const expression = `(${setup})*0+(${pad})*${swell}*0.18+${arp}`;
  const file = join(WORK, "music.wav");
  execFileSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", `aevalsrc=exprs='${expression}|${expression}':s=48000:d=${seconds.toFixed(3)}`,
    "-af", "lowpass=f=2400,aecho=0.8:0.6:180|340:0.3|0.2,volume=0.7",
    "-ar", "48000", "-ac", "2", file,
  ]);
  return file;
}

function srt(list) {
  const stamp = (s) => {
    const ms = Math.round(s * 1000);
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  return list.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n");
}

function encode() {
  const inputs = [
    "-i", spec.input,
    "-loop", "1", "-t", String(TITLE_SECONDS), "-i", images.title,
    "-loop", "1", "-t", String(CLOSING_SECONDS), "-i", images.closing,
    "-f", "lavfi", "-t", String(TITLE_SECONDS), "-i", "anullsrc=r=48000:cl=stereo",
    "-f", "lavfi", "-t", String(CLOSING_SECONDS), "-i", "anullsrc=r=48000:cl=stereo",
  ];
  const video = `fps=${FPS},scale=${width}:${height},setsar=1,format=yuv420p`;
  const filters = [];
  const parts = [];
  filters.push(`[1:v]${video}[title]`, `[3:a]aformat=sample_rates=48000:channel_layouts=stereo[titlea]`);
  parts.push("[title][titlea]");
  keep.forEach(([a, b], i) => {
    // A short fade at each cut, so the sound doesn't click.
    const fadeIn = i === 0 ? "" : ",afade=t=in:d=0.05";
    const fadeOut = i === keep.length - 1 ? "" : `,afade=t=out:st=${(b - a - 0.05).toFixed(3)}:d=0.05`;
    filters.push(
      `[0:v]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=PTS-STARTPTS,${video}[v${i}]`,
      `[0:a]atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo${fadeIn}${fadeOut}[a${i}]`,
    );
    parts.push(`[v${i}][a${i}]`);
  });
  filters.push(`[2:v]${video}[closing]`, `[4:a]aformat=sample_rates=48000:channel_layouts=stereo[closinga]`);
  parts.push("[closing][closinga]");
  filters.push(`${parts.join("")}concat=n=${parts.length}:v=1:a=1[joined][sound]`);

  let last = "joined";
  captions.forEach((caption, i) => {
    const n = 5 + i;
    const length = caption.end - caption.start;
    inputs.push("-loop", "1", "-t", length.toFixed(3), "-i", caption.image);
    filters.push(
      `[${n}:v]format=rgba,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=${(length - 0.3).toFixed(3)}:d=0.3:alpha=1,setpts=PTS+${caption.start.toFixed(3)}/TB[c${i}]`,
      `[${last}][c${i}]overlay=0:${caption.y === undefined ? `main_h-overlay_h-${Math.round(height * 0.04)}` : `${Math.round(height * caption.y)}-overlay_h/2`}:eof_action=pass[o${i}]`,
    );
    last = `o${i}`;
  });
  filters.push(`[${last}]fade=t=in:st=0:d=0.6,fade=t=out:st=${(totalSeconds - 0.8).toFixed(3)}:d=0.8[out]`);
  // Level the voice to YouTube's usual loudness. The music sits well under it
  // and ducks out whenever the voice speaks, then comes back in the pauses.
  const musicInput = 5 + captions.length;
  inputs.push("-stream_loop", "-1", "-i", music);
  filters.push(
    `[sound]loudnorm=I=-16:TP=-2:LRA=11,asplit=2[voice][key]`,
    `[${musicInput}:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${totalSeconds.toFixed(3)},volume=-1dB,` +
      `afade=t=in:d=1.5,afade=t=out:st=${(totalSeconds - 2.5).toFixed(3)}:d=2.5[bed]`,
    `[bed][key]sidechaincompress=threshold=0.008:ratio=20:attack=60:release=900:makeup=1[ducked]`,
    `[voice][ducked]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.89[audio]`,
  );

  execFileSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-stats", "-y",
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", "[out]", "-map", "[audio]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
    "-t", totalSeconds.toFixed(3),
    "-movflags", "+faststart",
    join(OUT, "tolk-intro.mp4"),
  ], { stdio: ["ignore", "inherit", "inherit"] });
}
