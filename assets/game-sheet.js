// One game's sheet, opened from any page (ES module, no JSX: the hub loads it natively; styles in ui.css).
// Every game outside the profile pages opens here, so the links to RetroAchievements / Steam / Xbox live
// only in the sheet. openGame({ p, id, title?, icon?, … }) mounts it on top of the page; whatever the caller
// passes shows at once, the rest comes from the game's own file (data/{ra,steam,xbox}/games/{id}.json),
// and for an RA want-to-play game with no file, from data/ra/watchlist.json.
// Beaten: RA's Game Beaten award (data/ra/profile.json), Steam / Xbox win conditions ({p}/win-conditions.json).
// The profile pages keep their own, fuller sheets; "Full details" opens the game there (?game=).
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { X, ChevronLeft, Trophy, Medal, ExternalLink } from 'lucide-react';
import { useSheet, useArtSrc, useAnimatedHeight, SheetHead } from './sheet.js';
import { shortAgo } from './game-view.js';
import { raIcon } from './ra-icon.js';

const h = React.createElement;
const ROOT = new URL('../', import.meta.url).href;   // the site root, whichever page imports this
const RA_MEDIA = 'https://media.retroachievements.org';
const PLATFORMS = {
    ra:    { label: 'RA',    name: 'RetroAchievements', out: 'RetroAchievements', icon: `${ROOT}assets/icon-ra.png` },
    steam: { label: 'Steam', name: 'Steam',             out: 'Store page',        icon: `${ROOT}assets/icon-steam.png` },
    xbox:  { label: 'Xbox',  name: 'Xbox',              out: 'Xbox.com',          icon: `${ROOT}assets/icon-xbox.png` },
};
const DONE = { ra: 'Mastered', steam: 'Perfect', xbox: 'Completed' };

const EDS_WIDTHS = [64, 128, 150, 200, 208, 300, 424];
const xboxImg = (url, width) => {
    if (!url) return url;
    if (url.includes('store-images.s-microsoft.com')) return `${url}${url.includes('?') ? '&' : '?'}w=${width}`;
    if (url.includes('images-eds')) return `${url}&w=${EDS_WIDTHS.find(w => w >= width) ?? 424}`;
    return url;
};
const steamHeader = (id, url) => url ?? `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`;
const steamHero = id => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_hero.jpg`;
const baseTitle = t => (t ?? '').replace(/~([^~]+)~\s*/g, '').trim();
const fmtMin = m => m >= 600 ? `${Math.round(m / 60).toLocaleString()}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
const toMs = s => { if (!s) return 0; if (typeof s === 'number') return s < 1e12 ? s * 1000 : s; const t = Date.parse(/^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(' ', 'T') + 'Z' : s); return isNaN(t) ? 0 : t; };
const fmtDay = s => { const t = toMs(s); return t ? new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''; };
const rarityColor = p => p == null ? '#546270' : p < 5 ? '#e5b143' : p < 10 ? '#c8901a' : p < 25 ? '#66c0f4' : p < 50 ? '#8f98a0' : '#546270';
export const outsideUrl = (p, id, title) =>
    p === 'ra' ? `https://retroachievements.org/game/${id}`
    : p === 'steam' ? `https://store.steampowered.com/app/${id}`
    : `https://www.xbox.com/en-US/Search/Results?q=${encodeURIComponent(baseTitle(title))}`;

// Shared files, fetched once per page
const once = {};
const getJson = path => once[path] ??= fetch(ROOT + path).then(r => r.ok ? r.json() : null).catch(() => null);

// Win condition met? (the admin's hand-picked ending achievements; OR: any, AND: all)
const winMet = (cond, achs) => {
    if (!cond) return false;
    const names = Array.isArray(cond) ? cond : cond.achievements || [];
    const hit = n => achs.some(a => a.apiName === n && a.unlocked);
    return (Array.isArray(cond) || cond.mode !== 'and') ? names.some(hit) : names.length > 0 && names.every(hit);
};

// The game's achievements in one shape for all three platforms
const normalize = (p, id, d) => {
    if (p === 'ra') {
        const players = d.numDistinctPlayersCasual || 0;
        return Object.values(d.achievements ?? {}).map(a => ({
            key: a.id, name: a.title, desc: a.description, unlocked: !!a.dateEarned, at: a.dateEarned, hardcore: !!a.dateEarnedHardcore,
            icon: `${RA_MEDIA}/Badge/${a.badgeName}${a.dateEarned ? '' : '_lock'}.png`, value: a.points ? `${a.points} pts` : null, pts: a.points || 0,
            pct: players ? Math.min(100, (a.numAwarded / players) * 100) : null, order: a.displayOrder ?? 0, pixel: true, type: a.type,
        }));
    }
    const steam = p === 'steam';
    const cdn = x => x ? `https://shared.akamai.steamstatic.com/community_assets/images/apps/${id}/${x}` : null;
    return (d.achievements ?? []).map((a, i) => ({
        key: a.apiName ?? i, name: a.displayName, desc: a.description, unlocked: !!a.unlocked, at: a.unlockedAt,
        icon: steam ? (a.unlocked ? cdn(a.iconUrl) : cdn(a.iconGrayUrl) || cdn(a.iconUrl)) : xboxImg(a.iconUrl, 128),
        value: !steam && a.gamerscore ? `${a.gamerscore}G` : null, pct: a.globalPct ?? null, order: i,
    }));
};

// Everything the sheet shows, from the game's file (or the want-to-play list); null fields stay as the caller gave them
async function loadGame(p, id) {
    const d = await getJson(`data/${p}/games/${id}.json`);
    if (p === 'ra') {
        const [art, profile] = await Promise.all([getJson('data/ra/art.json'), getJson('data/ra/profile.json')]);
        const picks = art?.games ?? {};
        const awards = profile?.pageAwards?.visibleUserAwards ?? [];
        const award = type => awards.find(a => String(a.awardData) === String(id) && a.awardType === type);
        if (!d) {
            const w = (await getJson('data/ra/watchlist.json'))?.results?.find(x => String(x.id) === String(id));
            if (!w) return { missing: true };
            return { want: true, title: w.title, console: w.consoleName, icon: raIcon(`${RA_MEDIA}${w.imageIcon}`, w.id, picks),
                total: w.achievementsPublished ?? 0, unlocked: 0, pts: [0, w.pointsTotal ?? 0] };
        }
        const achs = normalize('ra', id, d);
        const isProg = a => a.type === 'progression' || a.type === 'win_condition';
        const pick = picks[id];
        const shot = d.imageIngame && !d.imageIngame.endsWith('/Images/000002.png') ? `${RA_MEDIA}${d.imageIngame}` : null;
        const unlocked = achs.filter(a => a.unlocked).length, total = achs.length || d.numAchievements || 0;
        return {
            title: d.title, console: d.consoleName, icon: raIcon(`${RA_MEDIA}${d.imageIcon}`, id, picks),
            art: pick?.hero?.thumb ?? pick?.grid?.thumb ?? shot, wide: !!(pick?.hero || pick?.grid),
            total, unlocked, achs,
            pts: [achs.reduce((n, a) => n + (a.unlocked ? a.pts : 0), 0), achs.reduce((n, a) => n + a.pts, 0)],
            prog: [achs.filter(a => isProg(a) && a.unlocked).length, achs.filter(isProg).length],
            minutes: d.userTotalPlaytime ? Math.round(d.userTotalPlaytime / 60) : 0,
            lastMs: Math.max(0, ...achs.map(a => toMs(a.at))),
            done: total > 0 && (unlocked >= total || !!award('Mastery/Completion')),
            beaten: !!award('Game Beaten'),
        };
    }
    if (!d) return { missing: true };
    const wc = await getJson(`data/${p}/win-conditions.json`);
    const raw = d.achievements ?? [];
    const achs = normalize(p, id, d);
    const steam = p === 'steam';
    const total = d.total ?? achs.length, unlocked = d.unlocked ?? achs.filter(a => a.unlocked).length;
    return {
        title: d.gameName, console: PLATFORMS[p].name,
        icon: steam ? steamHeader(id, d.headerUrl) : xboxImg(d.iconUrl, 128),
        art: steam ? steamHero(id) : xboxImg(d.heroUrl, 640), artFallback: steam ? steamHeader(id, d.headerUrl) : null, wide: true,
        total, unlocked, achs, hidden: d.partial ? Math.max(0, total - raw.length) : 0,
        pts: !steam && d.totalGamerscore > 0 ? [d.gamerscore ?? 0, d.totalGamerscore] : null,
        minutes: d.playtimeForever ?? 0,
        lastMs: toMs(d.lastPlayedTs) || toMs(d.lastUnlockedAt),
        done: total > 0 && (unlocked >= total || (!steam && d.totalGamerscore > 0 && d.gamerscore >= d.totalGamerscore)),
        beaten: winMet(wc?.[id], raw),
    };
}

const Cover = ({ g }) => g.icon
    ? h('img', { src: g.icon, alt: '', onError: e => { e.target.style.visibility = 'hidden'; },
        className: g.p === 'steam'
            ? 'relative w-32 h-16 rounded-[2px] border border-[#101214] object-cover shrink-0 shadow-[0_6px_18px_rgba(0,0,0,0.55)]'
            : `relative w-16 h-16 rounded-[3px] border-2 border-white/20 object-cover shrink-0 shadow-[0_6px_18px_rgba(0,0,0,0.55)] ${g.p === 'ra' ? 'px' : 'smooth'}` })
    : h('span', { className: g.p === 'steam' ? 'relative w-32 h-16 shrink-0' : 'relative w-16 h-16 shrink-0' });

const Skeleton = () => [...Array(6)].map((_, i) => h('div', { key: i, className: 'flex items-center gap-3 p-2 bg-[#202d39] border border-[#2a475e] rounded-[2px]' },
    h('div', { className: 'shimmer w-10 h-10 rounded-[2px] shrink-0' }),
    h('div', { className: 'flex-1 flex flex-col gap-1.5' },
        h('div', { className: 'shimmer h-2.5 rounded', style: { width: `${40 + (i % 3) * 15}%` } }),
        h('div', { className: 'shimmer h-2 rounded', style: { width: `${60 + (i % 2) * 20}%` } }))));

const Note = ({ children }) => h('div', { className: 'text-center py-8 px-4 text-[#546270] text-[12px]' }, children);

// g: what the caller knows ({ p, id, title, icon, … }); backLabel / onBack: a back pill (the Series page's series)
export function GameSheet({ g: hint, backLabel, onBack, onClose, profileLink = true }) {
    const panelRef = useRef(null), rootRef = useRef(null), dragRef = useRef(null);
    const close = useSheet({ panelRef, dragRef, rootRef, onClose });
    useAnimatedHeight(panelRef);
    const [info, setInfo] = useState(null);
    const [filter, setFilter] = useState('all');
    useEffect(() => { let live = true; loadGame(hint.p, hint.id).then(x => live && setInfo(x)).catch(() => live && setInfo({ missing: true })); return () => { live = false; }; }, [hint.p, hint.id]);
    // The file wins over the caller's values once it's in; until then the caller's show. Steam's cover is
    // the store banner, known from the id alone (callers often have only the small square icon)
    const g = { ...hint, ...(hint.p === 'steam' ? { icon: steamHeader(hint.id) } : {}), ...(info ?? {}) };
    for (const k of Object.keys(hint)) if (g[k] == null) g[k] = hint[k];
    const loading = info == null;
    const art = useArtSrc([g.art, g.artFallback, g.icon]);
    const list = useMemo(() => {
        if (!info?.achs) return [];
        const unl = info.achs.filter(a => a.unlocked).sort((a, b) => toMs(b.at) - toMs(a.at));
        const lck = info.achs.filter(a => !a.unlocked).sort((a, b) => a.order - b.order);
        return filter === 'unlocked' ? unl : filter === 'locked' ? lck : [...unl, ...lck];
    }, [info, filter]);
    const counts = info?.achs ? { all: info.achs.length + (info.hidden || 0), unlocked: info.achs.filter(a => a.unlocked).length, locked: info.achs.filter(a => !a.unlocked).length + (info.hidden || 0) } : null;
    const hasAch = g.total > 0;
    const pct = hasAch ? (g.unlocked / g.total) * 100 : 0;
    const known = v => loading && v == null ? null : v;   // null = shimmer while the file loads
    const P = PLATFORMS[g.p];
    const out = outsideUrl(g.p, g.id, g.title);
    const link = (href, text, ext) => h('a', { href, ...(ext ? { target: '_blank', rel: 'noreferrer' } : {}), className: 'inline-flex items-center gap-1 text-[#66c0f4] hover:text-white transition-colors' }, text, ext && h(ExternalLink, { size: 10 }));
    const tagCls = 'shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded-sm flex items-center gap-1';
    return h('div', { ref: rootRef, className: 'sheet-root', onClick: close },
        h('div', { className: 'sheet-backdrop anim-backdrop' }),
        h('div', { ref: panelRef, className: 'sheet-panel', role: 'dialog', 'aria-label': baseTitle(g.title) || 'Game', onClick: e => e.stopPropagation() },
            h('button', { onClick: close, className: 'sheet-close', 'aria-label': 'Close' }, h(X, { size: 15 })),
            onBack && h('button', { onClick: onBack, className: 'sheet-back', 'aria-label': `Back to ${backLabel}` }, h(ChevronLeft, { size: 14 }), backLabel),
            h(SheetHead, {
                dragRef, back: !!onBack,
                art: art.src && h('div', { className: 'art-bg art-sheet' }, h('img', { src: art.src, alt: '', ref: art.ref, onLoad: art.onLoad, onError: art.onError,
                    className: `${g.p === 'ra' && !g.wide ? 'px' : ''} ${art.src === g.icon ? 'art-icon' : ''} ${art.loaded ? 'loaded' : ''}` })),
                cover: h(Cover, { g }),
                title: baseTitle(g.title) || h('span', { className: 'shimmer inline-block h-4 w-40 rounded' }),
                meta: [
                    h('span', { className: 'inline-flex items-center gap-1.5 text-[#c6d4df]' }, h('img', { src: P.icon, alt: '', className: 'w-3 h-3 object-contain' }), g.console ?? P.label),
                    link(out, P.out, true),
                    profileLink && !g.want && !g.missing && link(`${ROOT}profile/${g.p}/?game=${encodeURIComponent(g.id)}`, 'Full details ›'),
                ],
                tags: [
                    g.done && h('span', { key: 'd', className: `${tagCls} text-[#101214] bg-[#e5b143]` }, h(Trophy, { size: 9 }), ' ', DONE[g.p]),
                    !g.done && g.beaten && h('span', { key: 'b', className: tagCls, style: { background: '#2a3440', color: '#c6d4df', border: '1px solid rgba(184,196,206,0.3)' } }, h(Medal, { size: 9 }), ' Beaten'),
                    g.want && h('span', { key: 'w', className: tagCls, style: { color: '#8f98a0', border: '1px solid #323f4c' } }, 'Want to play'),
                ],
                stats: [
                    (hasAch || loading) && { value: known(g.total != null ? g.unlocked ?? 0 : null), total: g.total, label: 'Achievements', color: '#66c0f4' },
                    g.p !== 'steam' && (g.pts?.[1] > 0 || (loading && g.p === 'ra')) && { value: g.pts ? g.pts[0].toLocaleString() : null, total: g.pts?.[1]?.toLocaleString(), label: g.p === 'ra' ? 'Points' : 'Gamerscore', color: '#e5b143' },
                    g.minutes ? { value: fmtMin(g.minutes), label: 'Played', color: '#66c0f4' }
                        : g.lastMs ? { value: `${shortAgo(g.lastMs)} ago`, label: 'Last played', color: '#c6d4df' } : null,
                ].filter(Boolean),
                bar: hasAch && !g.want ? { pct, color: g.done ? '#e5b143' : '#66c0f4' } : null,
                steps: g.prog?.[1] > 0 ? { done: g.prog[0], total: g.prog[1], icon: h(Trophy, { size: 11 }) } : null,
            }),
            counts && h('div', { className: 'flex items-center gap-2 px-4 py-2 border-b border-[#101214] shrink-0 anim-fade' },
                h('div', { className: 'frow flex-1 min-w-0', role: 'group', 'aria-label': 'Filter achievements' },
                    [['all', 'All'], ['unlocked', 'Unlocked'], ['locked', 'Locked']].map(([v, l]) =>
                        h('button', { key: v, onClick: () => setFilter(v), 'aria-pressed': filter === v, className: `fchip ${filter === v ? 'on' : ''}` }, l, h('span', { className: 'n' }, counts[v]))))),
            h('div', { key: filter, className: 'sheet-scroll overflow-y-auto overscroll-contain flex-1 min-h-0 px-4 pt-3 flex flex-col gap-1.5 anim-fade' },
                loading ? h(Skeleton)
                : info.want ? h(Note, null, 'Not played yet: its achievements show here once you start it.')
                : info.missing ? h(Note, null, 'This game\'s achievements aren\'t in your data.')
                : [
                    ...list.map(a => h('div', { key: a.key, className: `gach ${a.unlocked ? 'on' : ''}` },
                        a.icon ? h('img', { src: a.icon, alt: '', loading: 'lazy', className: a.pixel ? 'px' : '', onError: e => { e.target.style.visibility = 'hidden'; } }) : h('span', { className: 'ph' }),
                        h('div', { className: 'gach-main' },
                            h('span', { className: 'gach-name' }, a.name),
                            a.desc && h('span', { className: 'gach-desc' }, a.desc),
                            h('span', { className: 'gach-meta' },
                                a.value && h('b', null, a.value),
                                a.pct != null && h('span', { style: { color: rarityColor(a.pct) } }, a.pct < 0.1 ? '<0.1' : a.pct.toFixed(1), '%'),
                                a.hardcore && h('span', { className: 'text-[#ff6b6b]' }, 'Hardcore'),
                                a.unlocked && a.at && h('span', { className: 'ml-auto text-[#66c0f4]' }, fmtDay(a.at)))))),
                    filter !== 'unlocked' && info.hidden > 0 && h('div', { key: 'hid', className: 'text-center py-3 text-[#546270] text-[11px]' }, `${info.hidden} locked achievements aren't listed for Xbox 360 games`),
                    list.length === 0 && h(Note, { key: 'none' }, 'No achievements here.'),
                ])));
}

// Open a game's sheet on top of any page: openGame({ p: 'ra' | 'steam' | 'xbox', id, title?, icon?, … })
let host = null, root = null;
export function openGame(g, opts = {}) {
    if (!g?.p || g.id == null) return;
    if (!host) { host = document.createElement('div'); host.id = 'game-sheet'; document.body.appendChild(host); root = createRoot(host); }
    const close = () => { root.render(null); opts.onClose?.(); };
    root.render(h(GameSheet, { key: `${g.p}-${g.id}-${Date.now()}`, g: { ...g, id: String(g.id) }, onClose: close, backLabel: opts.backLabel, onBack: opts.onBack, profileLink: opts.profileLink }));
}

// Pages without React in their own code (the hub): one delegated listener for every [data-game="p:id"]
// element, so markup only names the game. The title and icon attributes show in the header at once.
export function bindGameLinks(scope = document) {
    if (scope.__gameLinks) return;
    scope.__gameLinks = true;
    scope.addEventListener('click', e => {
        const el = e.target.closest?.('[data-game]');
        if (!el || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        const [p, ...rest] = el.dataset.game.split(':');
        openGame({ p, id: rest.join(':'), title: el.dataset.gameTitle || undefined, icon: el.dataset.gameIcon || undefined });
    });
}

// Props for a game's link on a React page: <a {...gameProps('ra', id, { title, icon })}>. The href is the game
// on its profile (new tab, long press); a plain tap opens the sheet here
export const gameProps = (p, id, hint = {}) => ({
    href: `${ROOT}profile/${p}/?game=${encodeURIComponent(id)}`,
    onClick: e => {
        if (e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();
        openGame({ p, id, ...hint });
    },
});

// The same for a profile page, which opens its own sheet: <a {...tapProps('ra', id, openById)}>
export const tapProps = (p, id, open) => ({
    href: `${ROOT}profile/${p}/?game=${encodeURIComponent(id)}`,
    onClick: e => {
        if (e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();
        open(id);
    },
});
