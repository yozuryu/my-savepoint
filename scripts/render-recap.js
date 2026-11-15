#!/usr/bin/env node
// Memory Card share pictures: screenshots each year's page in its card modes with headless Chrome
//   memory-card/share/{YYYY}-link.jpg    1200 × 630, the link preview (og:image)
//   memory-card/share/{YYYY}-story.jpg   1080 × 1920, the picture the page's Share sheet opens with
//   …-{link,story}-{cover,blocks,shelf,title}.jpg   the other styles the Share sheet offers
//   memory-card/share/{YYYY}-slide-{key}.jpg   the story's slides, 1080 × 1920
// Run after build-recap.js (it reads memory-card/years.json). No npm dependency: Chrome is driven over
// --remote-debugging-pipe. Needs the network (fonts, game art).
//   node scripts/render-recap.js [siteRoot] [year …]     (default: the repo, every year; CHROME=/path/to/chrome)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');

const args = process.argv.slice(2);
const ROOT = path.resolve(args.find(a => !/^\d{4}$/.test(a) && !a.startsWith('--')) || path.join(__dirname, '..'));
const only = args.filter(a => /^\d{4}$/.test(a)).map(Number);
const OUT = path.join(ROOT, 'memory-card', 'share');
const STYLES = ['card', 'cover', 'blocks', 'shelf', 'title'];             // 'card' keeps the plain file name: it is the og:image
const CARDS = [{ kind: 'link', w: 1200, h: 630 }, { kind: 'story', w: 1080, h: 1920 }]
    .flatMap(c => STYLES.map(style => ({ ...c, style, query: `card=${c.kind}${style === 'card' ? '' : `&style=${style}`}`, name: `${c.kind}${style === 'card' ? '' : `-${style}`}` })));
const SLIDE = { w: 450, h: 800, scale: 2.4 };            // a story slide at phone size, saved as 1080 × 1920
const READY_TIMEOUT_MS = 25000;

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
