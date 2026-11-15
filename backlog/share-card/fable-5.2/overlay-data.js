// Game data for overlays.html: the GAMES array of ../overlay/stickers.html (card data shape, real numbers), copied 2026-11-15.
// Images are the stickers' own, in ../overlay/img/.
const I = '../overlay/img/';
const PLAT = {
  steam: { name: 'Steam', icon: '<svg class="pf" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-9.96 9.04l5.35 2.21a2.83 2.83 0 0 1 1.6-.49h.15l2.38-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.42v.13a2.83 2.83 0 0 1-5.62.5L2.4 14.6A10 10 0 1 0 12 2Zm-4.72 15.22-1.22-.5a2.13 2.13 0 1 0 1.17-2.9l1.27.52a1.57 1.57 0 1 1-1.22 2.88Zm9.6-7.49a2.51 2.51 0 1 0-2.5 2.51 2.51 2.51 0 0 0 2.5-2.5Zm-4.39 0a1.89 1.89 0 1 1 1.89 1.89 1.89 1.89 0 0 1-1.89-1.89Z"/></svg>' },
  ra:    { name: 'RA', icon: `<img class="pf" src="${I}icon-ra.webp" alt="">` },
  xbox:  { name: 'Xbox', icon: `<img class="pf round" src="${I}icon-xbox.png" alt="">` },
};
const RGB = { steam: '102,192,244', ra: '229,177,67', xbox: '82,176,67', gold: '229,177,67', silver: '184,196,206' };
const E = 'st-1658290-', R = 'st-2238900-';

// Card data (share-card.md § Card data), trimmed to what a sticker shows. Real numbers from the site's data files.
const GAMES = [
  { key: 'lego2k', platform: 'steam', title: 'LEGO® 2K Drive', status: 'progress', unlocked: 3, total: 38, played: '1h',
    art: { hero: 'library_hero.jpg', cover: 'library_600x900_2x.jpg' },
    unlock: { name: 'Higher Orbit', pct: 5.1, img: 'ach.jpg', label: 'Latest unlock' }, note: 'Steam · in progress' },
  { key: 'so2', platform: 'steam', title: 'STAR OCEAN THE SECOND STORY R', status: 'perfect', unlocked: 51, total: 51, played: '53h 45m', days: '83 days', finish: 'Perfect 25 Sep 2024',
    art: { hero: 'st-hero-2238900.jpg', cover: 'st-cover-2238900.jpg' },
    unlock: { name: 'Master of the Star Ocean', pct: 3.4, img: R + 'e80700cb571478dff436fb13e210d0668068bad0.jpg', label: 'Rarest achievement' }, note: 'Steam · perfect' },
  { key: 'legocity', platform: 'steam', title: 'LEGO City Undercover', status: 'beaten', unlocked: 20, total: 48, played: '73h',
    art: { hero: 'st-hero-578330.jpg', cover: 'st-cover-578330.jpg' },
    unlock: { name: 'Steel Surfer', pct: 13.9, img: 'st-578330-c1d6c4b44c19159f5c23da52638733b09caf4c95.jpg', label: 'Rarest achievement' }, note: 'Steam · beaten, still playing' },
  { key: 'd7', platform: 'ra', console: 'PSP', mode: 'hc', title: '7th Dragon 2020', status: 'mastered', unlocked: 80, total: 80, played: '22h 49m', days: '5 days', finish: 'Mastered 8 Apr 2026',
    art: { icon: 'ra-icon-16452.png', shot: 'ra-shot-16452.png' },
    unlock: { name: 'The Dragoner', pct: 14.1, img: 'ra-649934.png', px: true, label: 'Rarest achievement' },
    recent: ['ra-649924.png', 'ra-649925.png', 'ra-649927.png', 'ra-649928.png', 'ra-649929.png', 'ra-649930.png', 'ra-649933.png', 'ra-649934.png'], recentPx: true,
    note: 'RA · mastered, hardcore' },
  { key: 'd7sc', platform: 'ra', console: 'PSP', mode: 'sc', title: '7th Dragon 2020', status: 'completed', unlocked: 80, total: 80, played: '22h 49m', days: '5 days', finish: 'Completed 8 Apr 2026',
    art: { icon: 'ra-icon-16452.png', shot: 'ra-shot-16452.png' },
    unlock: { name: 'The Dragoner', pct: 14.1, img: 'ra-649934.png', px: true, label: 'Rarest achievement' }, note: 'RA · completed, softcore (example: 7th Dragon as if softcore)' },
  { key: 'rof', platform: 'ra', console: 'DS', mode: 'hc', title: 'Final Fantasy Crystal Chronicles: Ring of Fates', status: 'progress', unlocked: 1, total: 76, played: '47m',
    art: { icon: 'ra-icon-16244.png', shot: 'ra-shot-16244.png' },
    unlock: { name: 'The Monster Next Door', pct: 78.2, img: 'ra-614928.png', px: true, label: 'First achievement' }, note: 'RA · just started: long title, portrait DS screenshot, 1 unlock' },
  { key: 'poring', platform: 'ra', console: 'Standalone', mode: 'hc', title: 'Poring Clicker', status: 'progress', unlocked: 61, total: 156, played: '41h 33m',
    art: { icon: 'ra-icon-45053.png', shot: null },
    unlock: { name: 'Splash of Color', pct: 61, img: 'ra-734622.png', px: true, label: 'Latest unlock' }, note: 'RA · no screenshot: the icon, zoomed and blurred' },
  { key: 'sh2', platform: 'xbox', title: 'Soul Hackers 2', status: 'progress', unlocked: 40, total: 47, gs: 660, gsTotal: 1000,
    art: { hero: 'xb-hero-2116209805.jpg', cover: 'xb-poster-2116209805.jpg' },
    unlock: { name: 'A Mitama Masquerade', pct: 1.3, img: 'xb-ach-39.png', label: 'Latest unlock' }, note: 'Xbox · no playtime, so gamerscore instead' },
  // Data branch, 2026-11-14
  { key: 'eiyuden', platform: 'steam', title: 'Eiyuden Chronicle: Rising', status: 'progress', unlocked: 6, total: 50, played: '2h 30m',
    art: { hero: E + 'library_hero.jpg', cover: E + 'library_600x900_2x.jpg' },
    unlock: { name: 'Partners?', pct: 60.8, img: E + 'f11f05dd5563baa760d0451753feeb410a70dd9d.jpg', label: 'Latest unlock' },
    session: { date: '7 Nov', gained: 4, imgs: [E + '9d1799fe36b7ad45fe0fbe04093903db4f8a7bb3.jpg', E + '95601da0358307b95831f856f7a4bf0ffbcbf425.jpg', E + '698113d14201052b0919e671e6e7a7b5f48cb717.jpg', E + 'f11f05dd5563baa760d0451753feeb410a70dd9d.jpg'] },
    recent: [E + 'e795de25f1ee60903ebcc66b28a3a79bdbb0fc84.jpg', E + '924d1737b63a1f77822da49a85c47189ecb963b5.jpg', E + '9d1799fe36b7ad45fe0fbe04093903db4f8a7bb3.jpg', E + '95601da0358307b95831f856f7a4bf0ffbcbf425.jpg', E + '698113d14201052b0919e671e6e7a7b5f48cb717.jpg', E + 'f11f05dd5563baa760d0451753feeb410a70dd9d.jpg'],
    note: 'Steam · in progress (download set)' },
  { key: 'rof9', platform: 'ra', console: 'DS', mode: 'hc', title: 'Final Fantasy Crystal Chronicles: Ring of Fates', status: 'progress', unlocked: 9, total: 76, played: '4h 18m',
    art: { icon: 'ra-icon-16244.png', shot: 'ra-shot-16244.png' },
    unlock: { name: 'Corrupted Companion Freed', pct: 35.8, img: 'ra-614934.png', px: true, label: 'Latest unlock' },
    session: { date: '8 Nov', gained: 5, px: true, imgs: ['ra-614931.png', 'ra-614932.png', 'ra-614933.png', 'ra-614954.png', 'ra-614934.png'] },
    recent: ['ra-614928.png', 'ra-614929.png', 'ra-614953.png', 'ra-614930.png', 'ra-614931.png', 'ra-614932.png', 'ra-614933.png', 'ra-614954.png', 'ra-614934.png'], recentPx: true,
    note: 'RA · in progress, hardcore (download set)' },
];
