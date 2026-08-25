import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ffmpeg from "ffmpeg-static";

const out = path.join(process.cwd(), "bin");
await mkdir(out, { recursive: true });
const suffix = process.platform === "win32" ? ".exe" : "";
await copyFile(ffmpeg, path.join(out, `ffmpeg${suffix}`));

const asset = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp_macos";
const response = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`);
if (!response.ok) throw new Error(`yt-dlp download failed: ${response.status}`);
const target = path.join(out, `yt-dlp${suffix}`);
await writeFile(target, Buffer.from(await response.arrayBuffer()));
if (process.platform !== "win32") {
  await chmod(path.join(out, "ffmpeg"), 0o755);
  await chmod(target, 0o755);
}
console.log("Prepared ffmpeg and yt-dlp");
