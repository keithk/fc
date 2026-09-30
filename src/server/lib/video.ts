// ABOUTME: Converts recorded webm clips to mp4 with ffmpeg and reads their dimensions
// ABOUTME: Bluesky and our lexicon both only accept video/mp4

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface Mp4Video {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export async function toMp4(input: Uint8Array): Promise<Mp4Video> {
  const dir = await mkdtemp(join(tmpdir(), "fc-"));
  const inputPath = join(dir, "input");
  const outputPath = join(dir, "output.mp4");

  try {
    await writeFile(inputPath, input);
    await run("ffmpeg", [
      "-y",
      "-i", inputPath,
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "28",
      "-pix_fmt", "yuv420p",
      "-an",
      "-movflags", "+faststart",
      outputPath,
    ]);

    const { stdout } = await run("ffprobe", [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0",
      outputPath,
    ]);
    const [width, height] = stdout.trim().split(",").map(Number);

    return { bytes: await readFile(outputPath), width, height };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
