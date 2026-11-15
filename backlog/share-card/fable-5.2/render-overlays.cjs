// Renders overlays.html: the design sheet (overlays/sheet.jpg) and every sticker alone on a transparent
// background at 3× (overlays/{shape}-{game}.webp, or .png without sharp). Needs Playwright and Chrome, and the network for the font:
//   PLAYWRIGHT=/path/to/node_modules/playwright SHARP=/path/to/node_modules/sharp node render-overlays.cjs [shape …]
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs');
let sharp = null; try { sharp = require(process.env.SHARP || 'sharp'); } catch {}
const page = 'file://' + __dirname + '/overlays.html';
const out = __dirname + '/overlays';
const only = process.argv.slice(2);
const settle = async pg => {
  await pg.waitForFunction(() => document.body.dataset.ready === '1');
  await pg.evaluate(() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));
  const bad = await pg.evaluate(() => [...document.images].filter(i => !i.naturalWidth).map(i => i.src));
  if (bad.length) console.log('  missing images:', bad);
  // Text that still overflows its box after fitting is a design bug: report it.
  const cut = await pg.evaluate(() => [...document.querySelectorAll('.ov')].filter(o => o.scrollHeight > o.clientHeight + 1 || o.scrollWidth > o.clientWidth + 1).map(o => o.className));
  if (cut.length) console.log('  overflowing:', cut);
  await pg.waitForTimeout(200);
};
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome', args: ['--allow-file-access-from-files'] });
  const ctx = async (w, h, s) => (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: s })).newPage();
  let pg = await ctx(1648, 1000, 1);
  await pg.goto(page); await settle(pg);
  const designs = await pg.evaluate(() => window.DESIGNS);
  if (!only.length || only.includes('sheet')) await pg.screenshot({ path: out + '/sheet.jpg', type: 'jpeg', quality: 86, fullPage: true });
  await pg.close();
  for (const d of designs) {
    if (only.length && !only.includes(d.shape)) continue;
    pg = await ctx(520, 420, 3);
    await pg.goto(`${page}?shape=${d.shape}&game=${d.game}`); await settle(pg);
    const png = `${out}/${d.shape}-${d.game}.png`;
    await pg.locator('.wrap').screenshot({ path: png, omitBackground: true });
    if (sharp) { await sharp(png).webp({ quality: 88, alphaQuality: 90 }).toFile(png.replace(/png$/, 'webp')); fs.unlinkSync(png); }
    await pg.close();
  }
  console.log(designs.length, 'stickers');
  await b.close();
})();
