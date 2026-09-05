/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");
const { chromium } = require("playwright");

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, "output", "social-launch");
const TEMP = path.join(OUTPUT, "capture");
const PAGE = pathToFileURL(path.join(ROOT, "social-launch.html")).href;
const AUDIO = path.join(ROOT, "output", "audio", "Estudiemos-original-tech.wav");
const FFMPEG = "C:/ffmpeg/bin/ffmpeg.exe";
fs.mkdirSync(TEMP, { recursive: true });

function ffmpeg(args) {
  const result = spawnSync(FFMPEG, args, { stdio: "inherit", windowsHide: true });
  if (result.status !== 0) throw new Error("No se pudo exportar el video social.");
}

async function capture(name, viewport) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    args: ["--font-render-hinting=none", "--allow-file-access-from-files"]
  });
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "dark",
    recordVideo: { dir: TEMP, size: viewport }
  });
  const page = await context.newPage();
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.waitForTimeout(15300);
  const video = page.video();
  await page.close();
  const raw = path.join(TEMP, `${name}.webm`);
  await video.saveAs(raw);
  await context.close();
  await browser.close();
  return raw;
}

function encode(raw, name, width, height) {
  const output = path.join(OUTPUT, `${name}.mp4`);
  ffmpeg([
    "-y", "-i", raw, "-stream_loop", "-1", "-i", AUDIO,
    "-filter_complex", `[0:v]fps=60,scale=${width}:${height}:flags=lanczos,format=yuv420p[v];[1:a]atrim=0:15.2,asetpts=PTS-STARTPTS,volume=1.25,afade=t=out:st=14.2:d=1[a]`,
    "-map", "[v]", "-map", "[a]", "-t", "15.2",
    "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-profile:v", "high",
    "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", output
  ]);
  return output;
}

async function main() {
  if (!fs.existsSync(AUDIO)) throw new Error("Falta la pista de audio de Estudiemos.");
  const verticalRaw = await capture("launch-vertical", { width: 1080, height: 1920 });
  const horizontalRaw = await capture("launch-horizontal", { width: 1920, height: 1080 });
  const vertical = encode(verticalRaw, "Estudiemos-Lanzamiento-15s-9x16", 1080, 1920);
  const horizontal = encode(horizontalRaw, "Estudiemos-Lanzamiento-15s-16x9", 1920, 1080);
  for (const platform of ["Instagram-Reels", "TikTok", "YouTube-Shorts"]) {
    fs.copyFileSync(vertical, path.join(OUTPUT, `Estudiemos-${platform}-Lanzamiento-15s.mp4`));
  }
  console.log(JSON.stringify({ vertical, horizontal }, null, 2));
}

main().catch((error) => { console.error(error.stack || error); process.exit(1); });
