#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = __dirname;
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 60;
const TOTAL_FRAMES = 900; // 15.00 seconds
const DURATION = TOTAL_FRAMES / FPS;

const CHROME_CANDIDATES = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  path.join(process.env.HOME || '', '.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell'),
  path.join(process.env.HOME || '', '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome'),
];

function findChrome() {
  for (const p of CHROME_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error('Could not find Chromium/Chrome executable');
}

function startStaticServer(rootDir) {
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
  };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const cleanUrl = (req.url || '/').split('?')[0];
      const rel = cleanUrl === '/' ? 'index.html' : cleanUrl.replace(/^\/+/, '');
      const fullPath = path.resolve(rootDir, rel);
      if (!fullPath.startsWith(rootDir) || !fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(fullPath);
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method && this.listeners.has(msg.method)) {
        for (const fn of this.listeners.get(msg.method)) fn(msg.params);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function launchBrowser() {
  const chromeBin = findChrome();
  const port = 9222 + Math.floor(Math.random() * 1000);
  const profileDir = path.join(PROJECT_DIR, `.tmp_chrome_profile_${process.pid}`);
  fs.mkdirSync(profileDir, { recursive: true });
  const proc = spawn(
    chromeBin,
    [
      '--headless=new',
      `--user-data-dir=${profileDir}`,
      `--remote-debugging-port=${port}`,
      '--remote-allow-origins=*',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-gpu-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${WIDTH},${HEIGHT}`,
      '--hide-scrollbars',
      '--mute-audio',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let stderrBuf = '';
  proc.stderr.on('data', (c) => {
    stderrBuf += c.toString();
  });

  let targetWs = null;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) {
          targetWs = page.webSocketDebuggerUrl;
          break;
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }

  if (!targetWs) {
    proc.kill('SIGKILL');
    fs.rmSync(profileDir, { recursive: true, force: true });
    throw new Error('Failed to connect to headless Chrome CDP endpoint:\n' + stderrBuf.slice(-1200));
  }

  const cdp = new CDPClient(targetWs);
  await cdp.connect();
  return { proc, cdp, profileDir };
}

// Original subtle synthesized stereo ambience (48kHz 16-bit PCM WAV)
// Synced cleanly to the 4 garden moods: Dawn (0-3.5), Noon (3.5-7), Night (7-11), Gust (11-15)
function synthesizeAmbienceWav(outPath, durationSec) {
  const sr = 48000;
  const numSamples = Math.round(sr * durationSec);
  const left = new Float32Array(numSamples);
  const right = new Float32Array(numSamples);

  // Deterministic PRNG for noise & gentle wind chimes
  let seed = 918273645;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const smoothstep = (e0, e1, x) => {
    const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return u * u * (3 - 2 * u);
  };

  // Gentle pink-ish noise filter states (L/R uncorrelated for wide soft breeze)
  let b0L = 0, b1L = 0, b2L = 0, lpL = 0;
  let b0R = 0, b1R = 0, b2R = 0, lpR = 0;

  // Scheduled subtle pentatonic glass/dew shimmer notes
  const chimes = [
    { t: 0.45, f: 523.25, pan: -0.35, amp: 0.042, dec: 1.8 }, // Dawn C5
    { t: 1.45, f: 659.25, pan: 0.25, amp: 0.036, dec: 1.7 },  // Dawn E5
    { t: 2.55, f: 783.99, pan: -0.15, amp: 0.038, dec: 1.8 }, // Dawn G5
    { t: 3.65, f: 880.00, pan: 0.40, amp: 0.044, dec: 1.6 },  // Noon A5
    { t: 4.90, f: 1046.5, pan: -0.40, amp: 0.032, dec: 1.5 }, // Noon C6
    { t: 6.10, f: 783.99, pan: 0.18, amp: 0.036, dec: 1.6 },  // Noon G5
    { t: 7.25, f: 587.33, pan: -0.28, amp: 0.040, dec: 2.2 }, // Night D5
    { t: 8.60, f: 440.00, pan: 0.32, amp: 0.038, dec: 2.3 },  // Night A4
    { t: 9.85, f: 659.25, pan: -0.10, amp: 0.034, dec: 2.1 }, // Night E5
    { t: 11.20, f: 493.88, pan: 0.45, amp: 0.036, dec: 1.9 }, // Gust B4
    { t: 12.60, f: 739.99, pan: -0.45, amp: 0.030, dec: 1.8 },// Gust F#5
  ];

  // Subtle wing-tick air pulses synced with lively motion
  const ticks = [];
  for (let tt = 0.8; tt < durationSec - 0.6; tt += 0.22 + rand() * 0.28) {
    ticks.push({ t: tt, f: 240 + rand() * 180, pan: (rand() - 0.5) * 1.2, amp: 0.012 + rand() * 0.010 });
  }

  for (let i = 0; i < numSamples; i++) {
    const t = i / sr;

    // Smooth global fade-in/out
    const envMaster = smoothstep(0, 0.5, t) * (1 - smoothstep(durationSec - 0.65, durationSec, t));

    // Breeze intensity follows the 4 presets cleanly
    const dawnW = 1 - smoothstep(3.2, 3.8, t);
    const noonW = smoothstep(3.2, 3.8, t) * (1 - smoothstep(6.7, 7.3, t));
    const nightW = smoothstep(6.7, 7.3, t) * (1 - smoothstep(10.7, 11.3, t));
    const gustW = smoothstep(10.7, 11.3, t);

    // Pink noise L/R
    const wL = rand() * 2 - 1;
    const wR = rand() * 2 - 1;
    b0L = 0.997 * b0L + wL * 0.029;
    b1L = 0.985 * b1L + wL * 0.032;
    b2L = 0.950 * b2L + wL * 0.048;
    const pinkL = b0L + b1L + b2L + wL * 0.018;

    b0R = 0.997 * b0R + wR * 0.029;
    b1R = 0.985 * b1R + wR * 0.032;
    b2R = 0.950 * b2R + wR * 0.048;
    const pinkR = b0R + b1R + b2R + wR * 0.018;

    // Dynamic breeze lowpass filter (opens up during Wind Gust for a silky air whoosh)
    const gustSurge = 0.65 + 0.35 * Math.sin(t * 1.85) + 0.2 * Math.sin(t * 3.7);
    const cutoff = 0.035 * dawnW + 0.055 * noonW + 0.024 * nightW + (0.14 * gustSurge) * gustW;
    lpL += cutoff * (pinkL - lpL);
    lpR += cutoff * (pinkR - lpR);

    const breezeAmp = 0.075 * dawnW + 0.095 * noonW + 0.055 * nightW + (0.24 * gustSurge) * gustW;

    // Warm ultra-soft drone pad (quiet harmonic bed)
    const padDawn = (Math.sin(2 * Math.PI * 196.0 * t) * 0.5 + Math.sin(2 * Math.PI * 293.66 * t) * 0.35) * 0.022 * dawnW;
    const padNoon = (Math.sin(2 * Math.PI * 220.0 * t) * 0.5 + Math.sin(2 * Math.PI * 329.63 * t) * 0.35) * 0.020 * noonW;
    const padNight = (Math.sin(2 * Math.PI * 146.83 * t) * 0.55 + Math.sin(2 * Math.PI * 220.0 * t) * 0.3) * 0.026 * nightW;
    const padGust = (Math.sin(2 * Math.PI * 164.81 * t) * 0.45 + Math.sin(2 * Math.PI * 246.94 * t) * 0.3) * 0.018 * gustW;
    const pad = padDawn + padNoon + padNight + padGust;

    // Gentle nocturnal firefly shimmer pulse (only in Night)
    const nightPulse = nightW * Math.sin(2 * Math.PI * 3280 * t) * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * 4.5 * t), 6) * 0.0045;

    let sL = lpL * breezeAmp + pad + nightPulse * 0.7;
    let sR = lpR * breezeAmp + pad + nightPulse * 1.1;

    left[i] = sL * envMaster;
    right[i] = sR * envMaster;
  }

  // Mix in glass-dew chimes
  for (const c of chimes) {
    const startIdx = Math.floor(c.t * sr);
    const len = Math.min(numSamples - startIdx, Math.floor(c.dec * 3.5 * sr));
    const gL = Math.cos(((c.pan + 1) * Math.PI) / 4);
    const gR = Math.sin(((c.pan + 1) * Math.PI) / 4);
    for (let k = 0; k < len; k++) {
      const dt = k / sr;
      const attack = Math.min(1, dt / 0.025);
      const decay = Math.exp(-dt / (c.dec * 0.42));
      const tone = (Math.sin(2 * Math.PI * c.f * dt) + 0.22 * Math.sin(2 * Math.PI * c.f * 2.002 * dt)) * attack * decay * c.amp;
      left[startIdx + k] += tone * gL;
      right[startIdx + k] += tone * gR;
    }
  }

  // Mix in ultra-soft wing-flutter breath ticks
  for (const tk of ticks) {
    const startIdx = Math.floor(tk.t * sr);
    const len = Math.min(numSamples - startIdx, Math.floor(0.055 * sr));
    const gL = Math.cos(((tk.pan + 1) * Math.PI) / 4);
    const gR = Math.sin(((tk.pan + 1) * Math.PI) / 4);
    for (let k = 0; k < len; k++) {
      const dt = k / sr;
      const env = Math.sin((k / len) * Math.PI) * Math.exp(-dt * 42);
      const val = Math.sin(2 * Math.PI * tk.f * dt) * env * tk.amp;
      left[startIdx + k] += val * gL;
      right[startIdx + k] += val * gR;
    }
  }

  // Write 16-bit PCM Stereo WAV
  const dataBytes = numSamples * 4;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // Stereo
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  let off = 44;
  for (let i = 0; i < numSamples; i++) {
    const vL = Math.max(-0.92, Math.min(0.92, left[i]));
    const vR = Math.max(-0.92, Math.min(0.92, right[i]));
    buf.writeInt16LE(Math.round(vL * 32767), off);
    buf.writeInt16LE(Math.round(vR * 32767), off + 2);
    off += 4;
  }
  fs.writeFileSync(outPath, buf);
}

async function evalJs(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error('Page JS error: ' + JSON.stringify(res.exceptionDetails));
  }
  return res.result?.value;
}

async function grabCanvasPng(cdp, frameIndex) {
  const dataUrl = await evalJs(
    cdp,
    `(() => {
      window.__garden.renderFrame(${frameIndex});
      return document.getElementById('garden-canvas').toDataURL('image/png');
    })()`
  );
  const comma = dataUrl.indexOf(',');
  return Buffer.from(dataUrl.slice(comma + 1), 'base64');
}

async function main() {
  const args = process.argv.slice(2);
  const previewOnly = args.includes('--preview-stills');
  const crfArg = args.find((a) => a.startsWith('--crf='));
  const crf = crfArg ? crfArg.split('=')[1] : '18';

  const { server, port } = await startStaticServer(PROJECT_DIR);
  const { proc: chromeProc, cdp, profileDir } = await launchBrowser();

  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const loadDone = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html?capture=1` });
    await loadDone;
    await evalJs(cdp, 'document.fonts ? document.fonts.ready : Promise.resolve()');

    // Quick determinism + live-frame timing check
    const perfInfo = await evalJs(
      cdp,
      `(() => {
        const t0 = performance.now();
        for (let i = 0; i < 60; i++) window.__garden.renderFrame(i);
        const dt60 = performance.now() - t0;
        const p1 = document.getElementById('garden-canvas').toDataURL('image/png');
        window.__garden.renderFrame(59);
        const p2 = document.getElementById('garden-canvas').toDataURL('image/png');
        window.__garden.reset();
        return {
          info: window.__garden.getInfo(),
          msPerFrame: +(dt60 / 60).toFixed(2),
          deterministic: p1 === p2,
        };
      })()`
    );
    console.log('Engine check:', JSON.stringify(perfInfo));
    if (!perfInfo.deterministic) {
      throw new Error('Determinism check failed: identical frame produced different PNG!');
    }

    if (previewOnly) {
      const stillsDir = path.join(PROJECT_DIR, 'stills');
      fs.mkdirSync(stillsDir, { recursive: true });
      const previewFrames = [
        { f: 18, name: 'preview_01_dawn_growth_0.3s.png' },
        { f: 150, name: 'preview_02_dawn_bloom_2.5s.png' },
        { f: 280, name: 'preview_03_noon_flight_4.7s.png' },
        { f: 284, name: 'preview_03b_noon_wingflap_4.73s.png' },
        { f: 540, name: 'preview_04_night_fireflies_9.0s.png' },
        { f: 780, name: 'preview_05_wind_gust_13.0s.png' },
      ];
      for (const item of previewFrames) {
        const png = await grabCanvasPng(cdp, item.f);
        fs.writeFileSync(path.join(stillsDir, item.name), png);
        console.log(`Saved ${item.name} (${png.length} bytes)`);
      }
      return;
    }

    // Full deterministic 1080p60 capture piped directly into ffmpeg
    const wavPath = path.join(PROJECT_DIR, '.tmp_ambience.wav');
    const mp4Path = path.join(PROJECT_DIR, 'ascii-butterfly-garden-1080p60.mp4');
    console.log('Synthesizing 15.0s subtle stereo garden ambience (48 kHz)...');
    synthesizeAmbienceWav(wavPath, DURATION);

    const ffmpegArgs = [
      '-y',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-framerate', String(FPS),
      '-i', 'pipe:0',
      '-i', wavPath,
      '-map', '0:v:0',
      '-map', '1:a:0',
      '-c:v', 'libx264',
      '-profile:v', 'high',
      '-preset', 'slow',
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
      '-c:a', 'aac',
      '-ar', '48000',
      '-ac', '2',
      '-b:a', '128k',
      '-shortest',
      '-movflags', '+faststart',
      mp4Path,
    ];

    console.log(`Starting ffmpeg pipe encode (${TOTAL_FRAMES} frames @ ${WIDTH}x${HEIGHT} ${FPS}fps, CRF ${crf})...`);
    const ff = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'inherit', 'pipe'] });
    let ffStderr = '';
    ff.stderr.on('data', (chunk) => {
      ffStderr += chunk.toString();
    });

    const ffDone = new Promise((resolve, reject) => {
      ff.on('error', reject);
      ff.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}:\n${ffStderr.slice(-1500)}`));
      });
    });

    const tStart = Date.now();
    for (let f = 0; f < TOTAL_FRAMES; f++) {
      const png = await grabCanvasPng(cdp, f);
      if (!ff.stdin.write(png)) {
        await new Promise((r) => ff.stdin.once('drain', r));
      }
      if ((f + 1) % 150 === 0 || f === TOTAL_FRAMES - 1) {
        const elapsed = ((Date.now() - tStart) / 1000).toFixed(1);
        console.log(`Rendered & piped frame ${f + 1}/${TOTAL_FRAMES} (${elapsed}s elapsed)`);
      }
    }
    ff.stdin.end();
    await ffDone;

    // Clean up temporary WAV
    if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);

    const stat = fs.statSync(mp4Path);
    const mb = (stat.size / (1024 * 1024)).toFixed(2);
    console.log(`Done! Wrote ${mp4Path} (${mb} MB, ${stat.size} bytes)`);
  } finally {
    cdp.close();
    chromeProc.kill('SIGTERM');
    await new Promise((r) => {
      const timer = setTimeout(() => {
        chromeProc.kill('SIGKILL');
        r();
      }, 1500);
      chromeProc.once('exit', () => {
        clearTimeout(timer);
        r();
      });
    });
    server.close();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
