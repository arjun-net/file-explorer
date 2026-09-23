import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegPathImport from "ffmpeg-static";

const ffmpegPath = ffmpegPathImport as unknown as string;

const execFileAsync = promisify(execFile);

const FRAME_INTERVAL_SECONDS = 8;
const MAX_FRAMES_PER_VIDEO = 8;

export interface ExtractedFrame {
  path: string;
  timeSeconds: number;
}

/**
 * Samples up to MAX_FRAMES_PER_VIDEO frames from a video, one every
 * FRAME_INTERVAL_SECONDS, into a temp directory the caller must clean up
 * (see cleanupFrames). Uses a single ffmpeg invocation (the fps filter)
 * rather than probing duration first — simpler, and ffmpeg just produces
 * fewer frames for short videos.
 */
export async function extractKeyframes(videoPath: string): Promise<ExtractedFrame[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "files-keyframes-"));
  const pattern = path.join(dir, "frame_%03d.jpg");
  try {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      videoPath,
      "-vf",
      `fps=1/${FRAME_INTERVAL_SECONDS}`,
      "-frames:v",
      String(MAX_FRAMES_PER_VIDEO),
      "-q:v",
      "4",
      pattern,
    ]);
  } catch {
    // Unreadable/corrupt/unsupported codec — not fatal to the rest of indexing.
    await fs.rm(dir, { recursive: true, force: true });
    return [];
  }

  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
  return files.map((name, i) => ({
    path: path.join(dir, name),
    timeSeconds: i * FRAME_INTERVAL_SECONDS,
  }));
}

export async function cleanupFrames(frames: ExtractedFrame[]): Promise<void> {
  if (frames.length === 0) return;
  await fs.rm(path.dirname(frames[0].path), { recursive: true, force: true });
}
