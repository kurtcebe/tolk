// Turns what record.mjs captured into dist/video/tolk-intro.mp4 and .srt.
//
//   node tools/video/assemble.mjs
//
// The voice is rendered again with macOS's `say`, using the voice the reader
// used, and each sentence is fitted to when Chrome spoke it during the
// recording, so it lines up with the highlight. Needs ffmpeg: set FFMPEG, or
// install the pip package imageio-ffmpeg as docs/release.md describes.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SHOTS } from "./shots.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "dist/video");
const WORK = join(OUT, "work");
const AUDIO = join(WORK, "audio");
const TITLE_SECONDS = 4;
const CLOSING_SECONDS = 5;
const FPS = 30;
const SAMPLE_RATE = 44100;
/** Roughly how many words a minute macOS voices speak at Chrome's rate 1. */
const SAY_WORDS_PER_MINUTE = 180;

const ffmpeg = findFfmpeg();
const timeline = JSON.parse(readFileSync(join(WORK, "timeline.json"), "utf8"));
const { width, height, frames, shots, speech, images } = timeline;
const filmStart = frames[0].t;
const filmSeconds = timeline.end - filmStart;
const totalSeconds = TITLE_SECONDS + filmSeconds + CLOSING_SECONDS;
const at = (t) => TITLE_SECONDS + (t - filmStart);

rmSync(AUDIO, { recursive: true, force: true });
mkdirSync(AUDIO, { recursive: true });

console.log("Rendering the voice");
const audio = renderVoice();
console.log("Writing captions");
const captions = captionTimes();
writeFileSync(join(OUT, "tolk-intro.srt"), srt(captions));
console.log("Encoding the video");
encode(audio, captions);
console.log(`Wrote ${join(OUT, "tolk-intro.mp4")} (${totalSeconds.toFixed(1)} s) and tolk-intro.srt`);

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const venv = join(homedir(), ".local/share/tolk-video/venv/bin/python");
  if (existsSync(venv)) {
    return execFileSync(venv, ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"], { encoding: "utf8" }).trim();
  }
  return "ffmpeg";
}

function run(args) {
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
}

/** Seconds of audio in a 16-bit mono WAV file written by ffmpeg. */
function wavSeconds(file) {
  const bytes = readFileSync(file);
  let offset = 12;
  while (offset < bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === "data") return size / (SAMPLE_RATE * 2);
    offset += 8 + size + (size % 2);
  }
  throw new Error(`No audio data in ${file}`);
}

/** What was actually spoken: all of it, or up to the end of the last word reached. */
function spokenText(record) {
  if (record.outcome === "end" || record.boundaries.length === 0) return record.text;
  const last = record.boundaries.at(-1)[1];
  const rest = record.text.slice(last).search(/\s/);
  return rest === -1 ? record.text : record.text.slice(0, last + rest);
}

function renderVoice() {
  const spoken = speech.filter((record) => record.start !== null && record.end !== null);
  const sayClip = (record, text, name) => {
    const raw = join(AUDIO, `${name}.aiff`);
    const clip = join(AUDIO, `${name}.wav`);
    const voice = (record.voice ?? "Xander").split(" ")[0];
    execFileSync("say", ["-v", voice, "-r", String(Math.round(SAY_WORDS_PER_MINUTE * record.rate)), "-o", raw, text]);
    // Trim the silence `say` leaves at either end, so the clip starts on its first word.
    const trim = "silenceremove=start_periods=1:start_threshold=-50dB";
    run(["-i", raw, "-af", `${trim},areverse,${trim},areverse`, "-ar", String(SAMPLE_RATE), "-ac", "1", "-c:a", "pcm_s16le", clip]);
    return clip;
  };

  const clips = spoken.map((record, i) => {
    const clip = sayClip(record, spokenText(record), `clip-${i}`);
    // Chrome reported when each word began. Rendering the text up to the last
    // reported word, and matching its length to when Chrome reached that word,
    // gives the pace without counting the pause Chrome leaves after a sentence.
    let tempo = 1;
    const last = record.boundaries.at(-1);
    if (last !== undefined && last[1] > 0) {
      const prefix = sayClip(record, record.text.slice(0, last[1]).trim(), `prefix-${i}`);
      tempo = wavSeconds(prefix) / (last[0] - record.start);
    }
    return { clip, record, tempo: Math.min(1.3, Math.max(0.75, tempo)) };
  });

  const parts = clips.map(({ record, tempo }, i) => {
    // A sentence stops where Chrome stopped it, or where the next one begins.
    const next = clips[i + 1]?.record.start ?? Infinity;
    const stop = record.outcome === "end" ? Math.min(next, record.end + 1.5) : record.end;
    const room = stop - record.start;
    const cut = Number.isFinite(room) ? `,atrim=0:${room.toFixed(3)},afade=t=out:st=${Math.max(0, room - 0.06).toFixed(3)}:d=0.06` : "";
    const delay = Math.round(at(record.start) * 1000);
    console.log(`  ${at(record.start).toFixed(2)} s  tempo ${tempo.toFixed(2)}  ${record.outcome === "end" ? "     " : "cut  "}${record.text.slice(0, 50)}`);
    return `atempo=${tempo.toFixed(4)}${cut},adelay=${delay}:all=1`;
  });

  const out = join(AUDIO, "voice.wav");
  const inputs = clips.flatMap(({ clip }) => ["-i", clip]);
  const filters = parts.map((filter, i) => `[${i}:a]${filter}[a${i}]`);
  const mix = `${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0:dropout_transition=0,apad[voice]`;
  run([...inputs, "-filter_complex", [...filters, mix].join(";"), "-map", "[voice]", "-t", totalSeconds.toFixed(3), "-ar", String(SAMPLE_RATE), "-ac", "2", out]);
  return out;
}

function captionTimes() {
  const result = [];
  shots.forEach((shot, i) => {
    const caption = SHOTS.find((s) => s.name === shot.name)?.caption;
    const image = images.captions[shot.name];
    if (!caption || !image) return;
    const next = shots[i + 1]?.t ?? timeline.end;
    result.push({ text: caption, image, start: at(shot.t) + 0.25, end: at(next) - 0.2 });
  });
  return result;
}

function srt(list) {
  const stamp = (s) => {
    const ms = Math.round(s * 1000);
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  return list.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n");
}

function encode(voice, captionList) {
  // The concat demuxer needs one image format, so the cards become JPEGs too.
  const titleJpg = join(WORK, "title.jpg");
  const closingJpg = join(WORK, "closing.jpg");
  // Chrome's frames are 4:2:0, and a change of format partway through stops the stream.
  run(["-i", images.title, "-pix_fmt", "yuvj420p", "-q:v", "2", titleJpg]);
  run(["-i", images.closing, "-pix_fmt", "yuvj420p", "-q:v", "2", closingJpg]);

  const lines = ["ffconcat version 1.0", `file '${titleJpg}'`, `duration ${TITLE_SECONDS}`];
  frames.forEach((frame, i) => {
    const next = frames[i + 1]?.t ?? timeline.end;
    lines.push(`file '${frame.file}'`, `duration ${Math.max(0.001, next - frame.t).toFixed(4)}`);
  });
  lines.push(`file '${closingJpg}'`, `duration ${CLOSING_SECONDS}`, `file '${closingJpg}'`);
  const list = join(WORK, "frames.ffconcat");
  writeFileSync(list, lines.join("\n") + "\n");

  const inputs = ["-f", "concat", "-safe", "0", "-i", list];
  const filters = [
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0xfbf8f1,fps=${FPS},format=yuv420p,` +
      `fade=t=in:st=0:d=0.6,fade=t=out:st=${(totalSeconds - 0.8).toFixed(3)}:d=0.8[v0]`,
  ];
  captionList.forEach((caption, i) => {
    const duration = caption.end - caption.start;
    inputs.push("-loop", "1", "-t", duration.toFixed(3), "-i", caption.image);
    filters.push(
      `[${i + 1}:v]format=rgba,fade=t=in:st=0:d=0.3:alpha=1,fade=t=out:st=${(duration - 0.3).toFixed(3)}:d=0.3:alpha=1,setpts=PTS+${caption.start.toFixed(3)}/TB[c${i}]`,
      `[v${i}][c${i}]overlay=0:${height - 110 - 30}:eof_action=pass[v${i + 1}]`,
    );
  });
  inputs.push("-i", voice);
  run([
    ...inputs,
    "-filter_complex", filters.join(";"),
    "-map", `[v${captionList.length}]`,
    "-map", `${captionList.length + 1}:a`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "160k",
    "-t", totalSeconds.toFixed(3),
    "-movflags", "+faststart",
    join(OUT, "tolk-intro.mp4"),
  ]);
}
