const { app, Menu, Tray, shell, nativeImage } = require("electron");
const archiver = require("archiver");
const { spawn } = require("child_process");
const express = require("express");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const PORT = 43117;
const allowedOrigins = new Set(["https://youtube-frame-capture.vercel.app", "http://localhost:3000"]);
const thresholds = { low: 0.48, normal: 0.34, high: 0.22 };
let tray;

function binary(name) {
  const suffix = process.platform === "win32" ? ".exe" : "";
  return path.join(process.resourcesPath, "bin", `${name}${suffix}`);
}
function run(command, args, onStderr) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true }); let stderr = "";
    child.stderr.on("data", (chunk) => { const text = String(chunk); stderr += text; if (onStderr) onStderr(text); });
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.slice(-4000))));
  });
}
function stamp(seconds) {
  const value = Math.max(0, Math.round(seconds));
  return [Math.floor(value / 3600), Math.floor((value % 3600) / 60), value % 60].map((x) => String(x).padStart(2, "0")).join("-");
}
function safeTitle(value) { return String(value || "youtube-captures").replace(/[<>:"/\\|?*\x00-\x1F]/g, "").trim().slice(0, 80) || "youtube-captures"; }

async function download(url, dir) {
  const output = path.join(dir, "source.%(ext)s"); let json = "";
  await new Promise((resolve, reject) => {
    const child = spawn(binary("yt-dlp"), [url, "--dump-single-json", "--no-simulate", "--no-playlist", "--no-warnings", "-f", "bv*[height<=1080]+ba/b[height<=1080]/best", "--merge-output-format", "mp4", "--ffmpeg-location", binary("ffmpeg"), "-o", output], { windowsHide: true });
    let stderr = ""; child.stdout.on("data", (c) => json += String(c)); child.stderr.on("data", (c) => stderr += String(c)); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(stderr.slice(-4000))));
  });
  const filename = (await fs.readdir(dir)).find((name) => name.startsWith("source."));
  if (!filename) throw new Error("영상 데이터를 찾을 수 없습니다.");
  let info = {}; try { info = JSON.parse(json); } catch {}
  return { video: path.join(dir, filename), title: safeTitle(info.title) };
}
async function frames(request, video, out) {
  const max = 120;
  if (request.mode === "interval") {
    await run(binary("ffmpeg"), ["-hide_banner", "-loglevel", "error", "-i", video, "-vf", `fps=1/${request.intervalSeconds},scale='min(1920,iw)':-2`, "-frames:v", String(max), "-q:v", "2", path.join(out, "capture_%03d.jpg")]);
    const files = (await fs.readdir(out)).filter((name) => name.endsWith(".jpg")).sort(); const result = [];
    for (let i = 0; i < files.length; i++) { const name = `capture_${String(i + 1).padStart(3, "0")}_${stamp(i * request.intervalSeconds)}.jpg`; await fs.rename(path.join(out, files[i]), path.join(out, name)); result.push({ path: path.join(out, name), filename: name, timestampSeconds: i * request.intervalSeconds }); }
    return result;
  }
  let logs = ""; await run(binary("ffmpeg"), ["-hide_banner", "-i", video, "-vf", `select='gt(scene,${thresholds[request.sensitivity] || .34})',showinfo`, "-an", "-f", "null", "-"], (text) => logs += text);
  const times = [0, ...Array.from(logs.matchAll(/pts_time:([0-9.]+)/g), (m) => Number(m[1]) + .35)]; const unique = [...new Set(times.map((t) => Math.round(t * 100) / 100))].slice(0, max); const result = [];
  for (let i = 0; i < unique.length; i++) { const name = `capture_${String(i + 1).padStart(3, "0")}_${stamp(unique[i])}.jpg`; const target = path.join(out, name); await run(binary("ffmpeg"), ["-hide_banner", "-loglevel", "error", "-ss", String(unique[i]), "-i", video, "-frames:v", "1", "-vf", "scale='min(1920,iw)':-2", "-q:v", "2", target]); result.push({ path: target, filename: name, timestampSeconds: unique[i] }); }
  return result;
}

function startServer() {
  const server = express(); server.use(express.json({ limit: "32kb" }));
  server.use((req, res, next) => { const origin = req.headers.origin; if (origin && allowedOrigins.has(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); res.setHeader("Access-Control-Allow-Private-Network", "true"); res.setHeader("Access-Control-Allow-Headers", "content-type"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); } if (req.method === "OPTIONS") return res.sendStatus(204); if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ message: "허용되지 않은 사이트입니다." }); next(); });
  server.get("/health", (_req, res) => res.json({ ok: true, version: app.getVersion() }));
  server.post("/capture", async (req, res) => { const data = req.body || {}; if (!/^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(data.url || "")) return res.status(400).json({ message: "YouTube URL을 확인해 주세요." }); const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ytcapture-")); try { const out = path.join(dir, "captures"); await fs.mkdir(out); const item = await download(data.url, dir); const captures = await frames(data, item.video, out); res.attachment(`${item.title}.zip`); res.type("application/zip"); const zip = archiver("zip", { zlib: { level: 6 } }); zip.pipe(res); captures.forEach((f) => zip.file(f.path, { name: f.filename })); zip.append(JSON.stringify({ source: data.url, captures: captures.map(({ filename, timestampSeconds }) => ({ filename, timestampSeconds })) }, null, 2), { name: "captures.json" }); res.on("close", () => fs.rm(dir, { recursive: true, force: true })); await zip.finalize(); } catch (error) { await fs.rm(dir, { recursive: true, force: true }); if (!res.headersSent) res.status(422).json({ message: error.message || "처리에 실패했습니다." }); } });
  server.listen(PORT, "127.0.0.1");
}

app.whenReady().then(() => { startServer(); const icon = nativeImage.createFromDataURL("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2S8AAAAASUVORK5CYII="); tray = new Tray(icon); tray.setToolTip("YouTube Capture Helper"); tray.setContextMenu(Menu.buildFromTemplate([{ label: "웹사이트 열기", click: () => shell.openExternal("https://youtube-frame-capture.vercel.app") }, { type: "separator" }, { label: "종료", click: () => app.quit() }])); });
app.on("window-all-closed", (event) => event.preventDefault());
