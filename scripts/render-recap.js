#!/usr/bin/env node
// Memory Card share pictures: screenshots each year's page in its card modes with headless Chrome
//   memory-card/share/{YYYY}-link.jpg    1200 × 630, the link preview (og:image)
//   memory-card/share/{YYYY}-story.jpg   1080 × 1920, the picture the page's Share sheet opens with
//   …-{link,story}-{cover,blocks,shelf,title}.jpg   the other styles the Share sheet offers
//   memory-card/share/{YYYY}-slide-{key}.jpg   the story's slides, 1080 × 1920; …-slide-{key}-wide.jpg the same slides wide, 1200 × 630
//   memory-card/share/{YYYY}-video-{key}.mp4   the latest year only: each story section filmed, 1080 × 1920, 30 fps, H.264
//   memory-card/share/video.json   { year, hash, keys }: which year the videos are of, and of which version of its page
// Videos: the page's film mode (?card=film&s=<key>) steps every animation itself; each frame is a screenshot piped to ffmpeg.
// If the live site already has videos of the same page (same hash), they're downloaded instead. RECAP_VIDEO_RENDER=0 takes the live
// ones even when the page changed since (same year and sections): the deploys after data runs do, the midnight run and pushes to
// main render. No live copy (first run, a new year) always renders. RECAP_VIDEO_CACHE=0 renders anyway; --no-video skips them;
// no ffmpeg = no videos, with a warning.
// Run after build-recap.js (it reads memory-card/years.json). No npm dependency: Chrome is driven over
// --remote-debugging-pipe. Needs the network (fonts, game art).
//   node scripts/render-recap.js [siteRoot] [year …]     (default: the repo, every year; CHROME=/path/to/chrome)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const args = process.argv.slice(2);
const ROOT = path.resolve(args.find(a => !/^\d{4}$/.test(a) && !a.startsWith('--')) || path.join(__dirname, '..'));
const only = args.filter(a => /^\d{4}$/.test(a)).map(Number);
const OUT = path.join(ROOT, 'memory-card', 'share');
const STYLES = ['card', 'cover', 'blocks', 'shelf', 'title'];             // 'card' keeps the plain file name: it is the og:image
const CARDS = [{ kind: 'link', w: 1200, h: 630 }, { kind: 'story', w: 1080, h: 1920 }]
    .flatMap(c => STYLES.map(style => ({ ...c, style, query: `card=${c.kind}${style === 'card' ? '' : `&style=${style}`}`, name: `${c.kind}${style === 'card' ? '' : `-${style}`}` })));
const SLIDE = { w: 450, h: 800, scale: 2.4 };            // a story slide at phone size, saved as 1080 × 1920
const SLIDE_WIDE = { w: 800, h: 420, scale: 1.5 };       // the same slide in the story's desktop shape, saved as 1200 × 630
const READY_TIMEOUT_MS = 25000;
const FPS = 30, MAX_FILM_S = 16, TAIL_FRAMES = 12;       // a section runs ~10 s (cover + slide); a short hold after its bar fills
const hasFfmpeg = () => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } };

function findChrome() {
    const candidates = [process.env.CHROME, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
    for (const c of candidates) {
        if (c.includes('/')) { if (fs.existsSync(c)) return c; continue; }
        try { return execFileSync('which', [c]).toString().trim(); } catch {}
    }
    throw new Error('Chrome not found (set CHROME=/path/to/chrome)');
}

// Static files from the site root, only for this run
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});

(async () => {
    const years = JSON.parse(fs.readFileSync(path.join(ROOT, 'memory-card', 'years.json'), 'utf8')).years.filter(y => !only.length || only.includes(y));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'recap-chrome-'));
    const chrome = spawn(findChrome(), ['--headless=new', '--remote-debugging-pipe', `--user-data-dir=${profile}`, '--no-sandbox',
        '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--force-color-profile=srgb', 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

    // DevTools protocol over the pipe: JSON messages ended by a NUL byte
    let seq = 0, buf = '';
    const waiting = new Map();
    chrome.stdio[4].on('data', d => {
        buf += d;
        for (let i; (i = buf.indexOf('\0')) >= 0; buf = buf.slice(i + 1)) {
            const m = JSON.parse(buf.slice(0, i)), w = waiting.get(m.id);
            if (!w) continue;
            waiting.delete(m.id);
            m.error ? w.reject(new Error(m.error.message)) : w.resolve(m.result);
        }
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
        const id = ++seq;
        waiting.set(id, { resolve, reject });
        chrome.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });

    let failed = 0;
    try {
        fs.mkdirSync(OUT, { recursive: true });
        const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
        const tab = (method, params) => send(method, params, sessionId);
        await tab('Page.enable');
        let made = 0;
        const shoot = async (year, { w, h, scale = 1, query, name }) => {
            made++;
            await tab('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: false });
            await tab('Page.navigate', { url: `${origin}/memory-card/${year}/?${query}` });
            // The page sets body[data-ready] once its fonts and images have settled
            const start = Date.now();
            let ready = false;
            while (!ready && Date.now() - start < READY_TIMEOUT_MS) {
                await new Promise(r => setTimeout(r, 150));
                const r = await tab('Runtime.evaluate', { expression: `location.search === '?${query}' && document.body?.dataset.ready === '1'` }).catch(() => null);
                ready = r?.result?.value === true;
            }
            if (!ready) { failed++; console.log(`  ${year} ${name}: not ready after ${READY_TIMEOUT_MS / 1000}s, rendered as is`); }
            await new Promise(r => setTimeout(r, 150));
            const shot = await tab('Page.captureScreenshot', { format: 'jpeg', quality: 86, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
            fs.writeFileSync(path.join(OUT, `${year}-${name}.jpg`), Buffer.from(shot.data, 'base64'));
        };
        for (const year of years) {
            for (const card of CARDS) await shoot(year, card);
            // The story's slides: the first load also tells which slides this year has
            await shoot(year, { ...SLIDE, query: 'card=slide', name: 'slide-year' });
            const keys = (await tab('Runtime.evaluate', { expression: `document.body?.dataset.slides ?? ''` })).result?.value ?? '';
            for (const key of keys.split(',').filter(k => k && k !== 'year')) await shoot(year, { ...SLIDE, query: `card=slide&s=${key}`, name: `slide-${key}` });
            for (const key of keys.split(',').filter(Boolean)) await shoot(year, { ...SLIDE_WIDE, query: `card=slide&wide&s=${key}`, name: `slide-${key}-wide` });
        }
        // ── Story videos of the latest year ──
        const latest = JSON.parse(fs.readFileSync(path.join(ROOT, 'memory-card', 'years.json'), 'utf8')).latest?.year;
        if (latest && years.includes(latest) && !args.includes('--no-video')) {
            const page = fs.readFileSync(path.join(ROOT, 'memory-card', String(latest), 'index.html'), 'utf8');
            const hash = crypto.createHash('sha1').update(page).digest('hex').slice(0, 12);
            const site = (page.match(/"site":"([^"]+)"/) || [])[1];
            await tab('Emulation.setDeviceMetricsOverride', { width: SLIDE.w, height: SLIDE.h, deviceScaleFactor: SLIDE.scale, mobile: false });
            await tab('Page.navigate', { url: `${origin}/memory-card/${latest}/?card=film` });
            await new Promise(r => setTimeout(r, 1500));
            const keys = ((await tab('Runtime.evaluate', { expression: `document.body?.dataset.slides ?? ''` })).result?.value ?? '').split(',').filter(Boolean);
            const fresh = async () => {        // the live copy, when it is of this same page
                if (process.env.RECAP_VIDEO_CACHE === '0' || !site) return false;
                try {
                    const live = await (await fetch(`${site}/memory-card/share/video.json`, { cache: 'no-store' })).json();
                    const stale = live.hash !== hash && process.env.RECAP_VIDEO_RENDER !== '0';
                    if (live.year !== latest || stale || keys.some(k => !live.keys.includes(k))) return false;
                    liveHash = live.hash;
                    for (const k of keys) {
                        const res = await fetch(`${site}/memory-card/share/${latest}-video-${k}.mp4`);
                        if (!res.ok) return false;
                        fs.writeFileSync(path.join(OUT, `${latest}-video-${k}.mp4`), Buffer.from(await res.arrayBuffer()));
                    }
                    return true;
                } catch { return false; }
            };
            let liveHash = null;
            if (await fresh()) console.log(`recap videos: ${keys.length} for ${latest}, taken from the live site`);
            else if (!hasFfmpeg()) console.log('recap videos: skipped, ffmpeg not found');
            else {
                const t0 = Date.now();
                for (const key of keys) {
                    await tab('Page.navigate', { url: `${origin}/memory-card/${latest}/?card=film&s=${key}` });
                    const start = Date.now();
                    let ready = false;
                    while (!ready && Date.now() - start < READY_TIMEOUT_MS) {
                        await new Promise(r => setTimeout(r, 150));
                        const r = await tab('Runtime.evaluate', { expression: `location.search.endsWith('s=${key}') && document.body?.dataset.ready === '1' && typeof __filmStep === 'function'` }).catch(() => null);
                        ready = r?.result?.value === true;
                    }
                    if (!ready) { failed++; console.log(`  ${latest} video ${key}: not ready, skipped`); continue; }
                    const file = path.join(OUT, `${latest}-video-${key}.mp4`);
                    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '22', '-movflags', '+faststart', file], { stdio: ['pipe', 'ignore', 'inherit'] });
                    const closed = new Promise(r => ff.on('close', r));
                    let frames = 0, tail = -1;
                    await tab('Runtime.evaluate', { expression: '__filmStep(0)', awaitPromise: true });
                    while (frames < MAX_FILM_S * FPS && tail !== 0) {
                        const shot = await tab('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: SLIDE.w, height: SLIDE.h, scale: 1 } });
                        if (!ff.stdin.write(Buffer.from(shot.data, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
                        frames++;
                        const over = (await tab('Runtime.evaluate', { expression: `__filmStep(${1000 / FPS})`, awaitPromise: true })).result?.value === true;
                        if (tail > 0) tail--; else if (over && tail < 0) tail = TAIL_FRAMES;
                    }
                    ff.stdin.end();
                    await closed;
                    console.log(`  ${latest} video ${key}: ${(frames / FPS).toFixed(1)} s, ${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
                }
                console.log(`recap videos: ${keys.length} for ${latest} in ${Math.round((Date.now() - t0) / 1000)} s`);
            }
            // Videos of other years are left behind by an earlier latest year: remove them
            for (const f of fs.readdirSync(OUT)) if (/-video-/.test(f) && !f.startsWith(`${latest}-`)) fs.rmSync(path.join(OUT, f));
            const made = keys.filter(k => fs.existsSync(path.join(OUT, `${latest}-video-${k}.mp4`)));
            fs.writeFileSync(path.join(OUT, 'video.json'), JSON.stringify({ year: latest, hash: liveHash ?? hash, keys: made }));
        }
        const kb = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0) / 1024;
        console.log(`recap pictures: ${made} for ${years.length} years, share/ ${(kb / 1024).toFixed(1)} MB${failed ? `, ${failed} not settled` : ''}`);
    } finally {
        server.close();
        // Chrome still writes to its profile until it has exited
        await new Promise(r => { chrome.once('exit', r); chrome.kill(); });
        try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
    }
})().catch(e => { console.error(`recap pictures failed: ${e.message}`); process.exit(1); });
