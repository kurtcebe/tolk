// Cuts the store screenshots, 1280 × 800, out of the hand-made recording.
//
//   node tools/video/screenshots.mjs [dist/video/edit.json]
//
// They come from the raw recording named in edit.json, which has no captions.
// Its "screenshots" list gives each one's name, the moment in seconds, and the
// part of the frame to keep as [x, y, width, height]. A part with the store's
// 16:10 shape is scaled to 1280 × 800; a part exactly that size is kept as it is.
// They're written to dist/store/.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const spec = JSON.parse(readFileSync(process.argv[2] ?? join(ROOT, "dist/video/edit.json"), "utf8"));
const OUT = join(ROOT, "dist/store");
mkdirSync(OUT, { recursive: true });
const ffmpeg = findFfmpeg();

for (const shot of spec.screenshots ?? []) {
  const [x, y, width, height] = shot.crop;
  if (Math.abs(width / height - 1.6) > 0.001) throw new Error(`${shot.name}: the crop must be 16:10`);
  const file = join(OUT, `${shot.name}.png`);
  execFileSync(ffmpeg, [
    "-v", "error", "-y", "-ss", String(shot.at), "-i", spec.input, "-frames:v", "1",
    "-vf", `crop=${width}:${height}:${x}:${y},scale=1280:800:flags=lanczos`,
    file,
  ]);
  console.log(`Wrote ${file}`);
}

function findFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const venv = join(homedir(), ".local/share/tolk-video/venv/bin/python");
  try {
    return execFileSync(venv, ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"], { encoding: "utf8" }).trim();
  } catch {
    return "ffmpeg";
  }
}
