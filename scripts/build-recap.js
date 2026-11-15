#!/usr/bin/env node
// Builds Memory Card, the yearly recap showcase (memory-card/):
//   memory-card/{YYYY}/index.html   memory-card/page.html with that year's recap embedded and its link preview
//                                   tags (crawlers don't run JS); computed once here, so every visitor and the
//                                   share images show the same numbers
//   memory-card/index.html          the latest year; memory-card/years.json lists the years for render-recap.js
//   node scripts/build-recap.js [siteRoot]     (default: the repo; deploy.yml passes _site)
// Years and days are the owner's (config.json `timezone`, an IANA name, default UTC), not the viewer's: a recap is
// a fixed record, unlike the app's pages. The share images are rendered afterwards by render-recap.js.
// Rules shared with Analytics (keep in step with analytics/app.js): farms and hidden games are left out,
// idle games only lose their play time.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const read = (rel, fallback = null) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch { return fallback; } };
const RA_MEDIA = 'https://media.retroachievements.org';
const STEAM_CDN = 'https://cdn.akamai.steamstatic.com/steam/apps';
const STEAM_ICONS = 'https://shared.akamai.steamstatic.com/community_assets/images/apps';
const FARM_PER_HOUR = 15, FARM_MIN_UNLOCKS = 10;
const TOP = 5, RAREST = 5;

const config = read('data/hub/config.json', {});
const TZ = (tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch { return 'UTC'; } })(config.timezone || 'UTC');
// The live site, for the link preview tags: SITE_URL, else GitHub Pages' address for the repository
// (GITHUB_REPOSITORY in Actions, else the origin remote)
const SITE = (() => {
    if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
    let repo = process.env.GITHUB_REPOSITORY;
    if (!repo) try {
        const m = require('child_process').execSync('git remote get-url origin', { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'ignore'] })
            .toString().trim().match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
        if (m) repo = `${m[1]}/${m[2]}`;
    } catch {}
    if (!repo) return '';
    const [owner, name] = repo.split('/');
    return name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${name}` : `https://${owner}.github.io/${name}`;
})();

// RA dates are "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker
const ms = s => !s ? 0 : typeof s === 'number' ? s : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z').getTime();
const partsFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short' });
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const local = t => {
    const p = Object.fromEntries(partsFmt.formatToParts(new Date(t)).map(x => [x.type, x.value]));
    return { year: +p.year, month: +p.month, day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, weekday: WEEKDAYS.indexOf(p.weekday) };
};
const parseTitle = title => {
    const tags = [];
    const base = String(title ?? '').replace(/~([^~]+)~\s*/g, (_, tag) => { tags.push(tag); return ''; }).trim();
    const sub = base.match(/^(.+?)\s*\[Subset\s*[-–]\s*(.+?)\]$/);
    return sub ? { name: sub[1].trim(), subset: sub[2].trim(), tags } : { name: base, tags };
};

// ── Games: name, art and lifetime numbers per platform ───────────────────────
const raIndex = read('data/ra/games/index.json', {}).games ?? {};
const raArt = read('data/ra/art.json', {}).games ?? {};
const steamIndex = read('data/steam/games/index.json', {}).achievementProgress ?? {};
const xboxIndex = read('data/xbox/games/index.json', {}).achievementProgress ?? {};
const raProfile = read('data/ra/profile.json', {});
const steamProfile = read('data/steam/profile.json', {});
const xboxProfile = read('data/xbox/profile.json', {});

const games = {};
for (const g of Object.values(raIndex)) {
    const t = parseTitle(g.title), pick = raArt[g.id] ?? {};
    const shot = [g.imageIngame, g.imageTitle].find(x => x && !x.endsWith('/000002.png'));
    const noIcon = !g.imageIcon || g.imageIcon === '/Images/000001.png';
    games[`ra:${g.id}`] = {
        platform: 'ra', id: g.id, name: t.name, subset: t.subset, console: g.consoleName,
        icon: noIcon && pick.icon ? pick.icon.thumb : g.imageIcon ? RA_MEDIA + g.imageIcon : null,
        cover: pick.grid?.thumb ?? null,                       // wide banner, when picked in the admin
        hero: pick.hero?.url ?? pick.grid?.url ?? null,        // big art behind things
        heroThumb: pick.hero?.thumb ?? pick.grid?.thumb ?? null, // the same, small (the originals run to megabytes)
        shot: shot ? RA_MEDIA + shot : null,                   // pixel screenshot: the fallback
        total: g.numAchievements ?? 0, unlocked: g.numAwardedToUser ?? 0,
        url: `https://retroachievements.org/game/${g.id}`,
    };
}
for (const g of Object.values(steamIndex)) {
    games[`steam:${g.appId}`] = {
        platform: 'steam', id: g.appId, name: g.gameName,
        icon: g.iconUrl ? (/^https?:/.test(g.iconUrl) ? g.iconUrl : `${STEAM_ICONS}/${g.appId}/${g.iconUrl}`) : null,
        cover: g.headerUrl ?? `${STEAM_CDN}/${g.appId}/header.jpg`,
        hero: `${STEAM_CDN}/${g.appId}/library_hero.jpg`,
        total: g.total ?? 0, unlocked: g.unlocked ?? 0, lifetimeMinutes: g.playtimeForever ?? 0,
        url: `https://store.steampowered.com/app/${g.appId}`,
    };
}
for (const g of Object.values(xboxIndex)) {
    games[`xbox:${g.titleId}`] = {
        platform: 'xbox', id: g.titleId, name: g.gameName,
        icon: g.iconUrl ?? null, cover: g.posterUrl ?? g.iconUrl ?? null, hero: g.heroUrl ?? null,
        total: g.total ?? 0, unlocked: g.unlocked ?? 0,
        url: `https://www.xbox.com/en-US/Search/Results?q=${encodeURIComponent(g.gameName ?? '')}`,
    };
}

// ── Left out: farms and hidden games, and idle games' play time (as in Analytics)
const marks = read('data/hub/farm-games.json', {});
const notFarm = new Set(marks.notFarms ?? []);
const farms = new Set([
    ...Object.entries(steamIndex)
        .filter(([, g]) => g.unlocked >= FARM_MIN_UNLOCKS && g.unlocked / Math.max((g.playtimeForever ?? 0) / 60, 0.1) > FARM_PER_HOUR)
        .map(([id]) => `steam:${id}`).filter(k => !notFarm.has(k)),
    ...(marks.farms ?? []),
]);
const idle = new Set(read('data/hub/idle-games.json', {}).games ?? []);
// Hidden by hand in the admin (General → Hidden Games): left out of everything, like farms
const hiddenGames = new Set(read('data/hub/hidden-games.json', {}).games ?? []);

// ── Everything that happened, with its local time ───────────────────────────
const unlocks = [];   // { key, t (ms), a, n, p, r, hc, ...local }
for (const platform of ['ra', 'steam', 'xbox']) {
    const years = Object.keys(read(`data/${platform}/history/index.json`, {}).years ?? {});
    for (const y of years) {
        for (const u of read(`data/${platform}/history/${y}.json`, {}).unlocks ?? []) {
            const t = ms(u.t);
            unlocks.push({ key: `${platform}:${u.g}`, platform, t, a: u.a, n: u.n, p: u.p ?? 0, r: u.r, hc: u.hc, ...local(t) });
        }
    }
}
unlocks.sort((a, b) => a.t - b.t);

const sessions = [];  // { key, t (end ms), minutes, ...local }
let trackedFrom = Infinity;
for (const platform of ['steam', 'ra']) {
    const dir = path.join(ROOT, `data/${platform}/playtime`);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^\d{4}\.json$/.test(f)) : [];
    for (const f of files) {
        const file = read(`data/${platform}/playtime/${f}`, {});
        for (const s of file.sessions ?? []) {
            const key = `${platform}:${s.gameId}`, t = ms(s.end);
            trackedFrom = Math.min(trackedFrom, ms(s.start));
            // Games only seen in the play log (no achievements, Steam Family): name and icon from the log
            if (!games[key] && file.games?.[s.gameId]) {
                const g = file.games[s.gameId];
                games[key] = { platform, id: s.gameId, name: parseTitle(g.name).name, console: g.console,
                    icon: !g.icon ? null : /^https?:/.test(g.icon) ? g.icon : platform === 'ra' ? RA_MEDIA + g.icon : `${STEAM_ICONS}/${s.gameId}/${g.icon}`,
                    cover: platform === 'steam' ? `${STEAM_CDN}/${s.gameId}/header.jpg` : null,
                    hero: platform === 'steam' ? `${STEAM_CDN}/${s.gameId}/library_hero.jpg` : null, total: 0, unlocked: 0 };
            }
            sessions.push({ key, platform, t, minutes: s.minutes, ...local(t) });
        }
    }
}

// ── Completions: Completed (RA mastered, Steam perfect, Xbox completed) and Beaten ──
const completions = [];   // { key, tier: 'completed' | 'beaten', t, fact? }
for (const a of raProfile.pageAwards?.visibleUserAwards ?? []) {
    if (a.awardType !== 'Game Beaten' && a.awardType !== 'Mastery/Completion') continue;
    const tier = a.awardType === 'Game Beaten' ? 'beaten' : 'completed';
    const fact = tier === 'completed' ? a.rarest && { name: a.rarest.name, pct: a.rarest.pct } : a.winCondition && { name: a.winCondition.name, pct: a.winCondition.pct };
    completions.push({ key: `ra:${a.awardData}`, tier, t: ms(a.awardedAt), fact: fact || undefined, label: tier === 'completed' ? 'Mastered' : 'Beaten' });
}
for (const g of steamProfile.perfectGames ?? []) {
    completions.push({ key: `steam:${g.appId}`, tier: 'completed', t: ms(g.completedAt), label: 'Perfect',
        fact: g.lastAchName ? { name: g.lastAchName, pct: g.lastAchGlobalPct } : undefined });
}
for (const g of xboxProfile.perfectGames ?? []) {
    completions.push({ key: `xbox:${g.titleId}`, tier: 'completed', t: ms(g.completedAt), label: 'Completed' });
}
// Steam / Xbox beaten: the win condition marked in the admin, dated by the unlock that met it
for (const platform of ['steam', 'xbox']) {
    for (const [id, rule] of Object.entries(read(`data/${platform}/win-conditions.json`, {}))) {
        const file = read(`data/${platform}/games/${id}.json`);
        if (!file || !rule?.achievements?.length) continue;
        const at = rule.achievements.map(n => (file.achievements ?? []).find(a => a.apiName === n)).map(a => a?.unlocked ? ms(a.unlockedAt) : 0);
        const hit = at.filter(Boolean);
        const t = rule.mode === 'or' ? (hit.length ? Math.min(...hit) : 0) : (hit.length === at.length ? Math.max(...hit) : 0);
        if (t) completions.push({ key: `${platform}:${id}`, tier: 'beaten', t, label: 'Beaten' });
    }
}
for (const c of completions) Object.assign(c, { year: local(c.t).year, day: local(c.t).day });

// ── Achievement art, looked up only for the few unlocks a recap names ───────
const gameFiles = {};
const achievement = u => {
    const [platform, id] = u.key.split(':');
    const file = gameFiles[u.key] ??= read(`data/${platform}/games/${id}.json`, {});
    if (platform === 'ra') {
        const a = file.achievements?.[u.a] ?? Object.values(file.achievements ?? {}).find(x => String(x.id) === String(u.a));
        return { icon: a?.badgeName ? `${RA_MEDIA}/Badge/${a.badgeName}.png` : null, desc: a?.description };
    }
    const a = (file.achievements ?? []).find(x => String(x.apiName) === String(u.a));
    const icon = !a?.iconUrl ? null : /^https?:/.test(a.iconUrl) ? a.iconUrl : `${STEAM_ICONS}/${id}/${a.iconUrl}`;
    return { icon, desc: a?.description };
};

const gameCard = key => {
    const g = games[key] ?? { platform: key.split(':')[0], id: key.split(':')[1], name: 'Unknown game' };
    return { key, platform: g.platform, name: g.name, subset: g.subset, console: g.console, icon: g.icon, cover: g.cover, hero: g.hero, heroThumb: g.heroThumb, shot: g.shot, url: g.url };
};
const round1 = n => Math.round(n * 10) / 10;
const addDay = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const sharedSeries = (x => Array.isArray(x) ? x : x.series ?? [])(read('data/hub/series.json', [])).map(sr => ({ name: sr.name, keys: new Set(sr.gameIds ?? []) }));

// ── One year ────────────────────────────────────────────────────────────────
const now = Date.now(), thisYear = local(now).year;
function buildYear(year) {
    // Farms and hidden games are left out of everything; idle games only lose their play time
    const hidden = k => farms.has(k) || hiddenGames.has(k);
    const us = unlocks.filter(u => u.year === year && !hidden(u.key));
    const ss = sessions.filter(s => s.year === year && !hidden(s.key) && !idle.has(s.key));
    if (!us.length && !ss.length) return null;
    const farmUnlocks = unlocks.filter(u => u.year === year && farms.has(u.key));

    // Per game
    const per = {};
    const slot = k => per[k] ??= { key: k, unlocks: 0, minutes: 0, sessions: 0, first: Infinity, last: 0 };
    for (const u of us) { const g = slot(u.key); g.unlocks++; g.first = Math.min(g.first, u.t); g.last = Math.max(g.last, u.t); }
    for (const s of ss) { const g = slot(s.key); g.minutes += s.minutes; g.sessions++; g.first = Math.min(g.first, s.t); g.last = Math.max(g.last, s.t); }
    const minutes = ss.reduce((n, s) => n + s.minutes, 0);

    // Play time exists from the first logged session (2026-03-25). A year with it ranks by time, others by unlocks
    const byTime = minutes > 0;
    const done = completions.filter(c => c.year === year && !hidden(c.key));
    // A game both beaten and completed in the same year counts once, as completed (like the Completions page)
    const yearDone = done.filter(c => c.tier === 'completed' || !done.some(o => o.key === c.key && o.tier === 'completed'))
        .sort((a, b) => b.t - a.t);
    const tierOf = k => yearDone.find(c => c.key === k)?.tier ?? null;

    const ranked = Object.values(per).sort((a, b) => byTime ? (b.minutes - a.minutes || b.unlocks - a.unlocks) : (b.unlocks - a.unlocks || b.last - a.last));
    const top = ranked.slice(0, TOP).map(g => ({
        ...gameCard(g.key), unlocks: g.unlocks, minutes: g.minutes || undefined, sessions: g.sessions || undefined,
        share: round1(100 * (byTime ? g.minutes / minutes : g.unlocks / us.length)),
        total: games[g.key]?.total || undefined, unlockedAll: games[g.key]?.unlocked || undefined, tier: tierOf(g.key) ?? undefined,
    }));

    // Calendar: months, weekdays, hours of the day, days
    const months = Array.from({ length: 12 }, () => ({ ra: 0, steam: 0, xbox: 0, minutes: 0 }));
    const hours = Array(24).fill(0), weekdays = Array(7).fill(0), days = {};
    for (const u of us) {
        months[u.month - 1][u.platform]++; hours[u.hour]++; weekdays[u.weekday]++;
        (days[u.day] ??= { unlocks: 0, minutes: 0, games: {} }).unlocks++;
        days[u.day].games[u.key] = (days[u.day].games[u.key] ?? 0) + 1;
    }
    for (const s of ss) {
        months[s.month - 1].minutes += s.minutes;
        (days[s.day] ??= { unlocks: 0, minutes: 0, games: {} }).minutes += s.minutes;
    }
    const dayKeys = Object.keys(days).sort();
    let streak = { days: 0 }, run = 0, start = null;
    dayKeys.forEach((d, i) => {
        if (i && addDay(dayKeys[i - 1], 1) === d) run++; else { run = 1; start = d; }
        if (run > streak.days) streak = { days: run, from: start, to: d };
    });
    const best = dayKeys.filter(d => days[d].unlocks).sort((a, b) => days[b].unlocks - days[a].unlocks || a.localeCompare(b))[0];
    const bestGame = best && Object.entries(days[best].games).sort((a, b) => b[1] - a[1])[0];
    const monthTotals = months.map(m => m.ra + m.steam + m.xbox);
    const peakMonth = monthTotals.indexOf(Math.max(...monthTotals));
    // Year heatmap: one number per day of the year (unlocks; the page draws it), from 1 Jan
    const yearDays = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 864e5;
    const heat = Array.from({ length: yearDays }, (_, i) => days[addDay(`${year}-01-01`, i)]?.unlocks ?? 0);
    const played = byTime ? Array.from({ length: yearDays }, (_, i) => days[addDay(`${year}-01-01`, i)]?.minutes ?? 0) : undefined;

    const PARTS = [['morning', 'Morning', '05–12', [5, 6, 7, 8, 9, 10, 11]], ['afternoon', 'Afternoon', '12–17', [12, 13, 14, 15, 16]],
        ['evening', 'Evening', '17–22', [17, 18, 19, 20, 21]], ['night', 'Night', '22–05', [22, 23, 0, 1, 2, 3, 4]]];
    const parts = PARTS.map(([id, label, range, hs]) => ({ id, label, range, pct: us.length ? Math.round(100 * hs.reduce((n, h) => n + hours[h], 0) / us.length) : 0 }));
    const dayPart = [...parts].sort((a, b) => b.pct - a.pct)[0];

    // Rarest unlocks: one per game so a single hard game doesn't fill the list
    const rarest = [];
    for (const u of us.filter(u => u.r != null && u.r > 0).sort((a, b) => a.r - b.r || a.t - b.t)) {
        if (rarest.some(r => r.key === u.key)) continue;
        rarest.push(u);
        if (rarest.length === RAREST) break;
    }
    const named = u => u && { name: u.n, pct: u.r, t: new Date(u.t).toISOString(), day: u.day, game: gameCard(u.key), ...achievement(u) };

    const firstEver = {};
    for (const u of unlocks) firstEver[u.key] ??= u.year;
    const gameKeys = Object.keys(per);
    const byPlatform = { ra: 0, steam: 0, xbox: 0 };
    for (const u of us) byPlatform[u.platform]++;
    const gamesBy = { ra: 0, steam: 0, xbox: 0 };
    for (const k of gameKeys) gamesBy[k.split(':')[0]]++;

    const totals = {
        unlocks: us.length, byPlatform, games: gameKeys.length, gamesBy,
        newGames: gameKeys.filter(k => firstEver[k] === year).length,
        completed: yearDone.filter(c => c.tier === 'completed').length, beaten: yearDone.filter(c => c.tier === 'beaten').length,
        minutes: byTime ? minutes : undefined, sessions: byTime ? ss.length : undefined,
        points: us.filter(u => u.platform === 'ra').reduce((n, u) => n + u.p, 0) || undefined,
        gamerscore: us.filter(u => u.platform === 'xbox').reduce((n, u) => n + u.p, 0) || undefined,
        activeDays: dayKeys.length, rare: us.filter(u => u.r != null && u.r < 10).length,
    };

    // What the year's title is picked from (pickTitles, once every year is known)
    const share = (n, of = us.length) => of ? n / of : 0;
    const lastBefore = unlocks.filter(u => u.year < year && !hidden(u.key)).pop();
    const active = [...(lastBefore ? [lastBefore.day] : []), ...dayKeys];
    let gap = { days: 0 };
    active.forEach((d, i) => {
        const n = i ? Math.round((Date.parse(d) - Date.parse(active[i - 1])) / 864e5) : 0;
        if (n > gap.days) gap = { days: n, after: us.filter(u => u.day >= d).length };
    });
    const inSeries = sharedSeries.map(sr => ({ name: sr.name, unlocks: us.filter(u => sr.keys.has(u.key)).length, games: gameKeys.filter(k => sr.keys.has(k)).length }))
        .filter(x => x.games >= 2).sort((a, b) => b.unlocks - a.unlocks)[0];
    const raUs = us.filter(u => u.platform === 'ra');
    const traits = {
        unlocks: us.length, games: gameKeys.length, activeDays: dayKeys.length,
        completed: totals.completed, beaten: totals.beaten, rare: totals.rare, rareShare: share(totals.rare),
        streak: streak.days, topShare: gameKeys.length > 1 ? top[0]?.share ?? 0 : 0, topName: top[0]?.name,
        night: us.length ? parts.find(p => p.id === 'night').pct : 0, morning: us.length ? parts.find(p => p.id === 'morning').pct : 0,
        weekend: Math.round(100 * share(weekdays[WEEKDAYS.indexOf('Sat')] + weekdays[WEEKDAYS.indexOf('Sun')])),
        peakMonth, peakShare: Math.round(100 * share(monthTotals[peakMonth])),
        gap: gap.days, gapAfter: gap.after ?? 0, newGames: totals.newGames,
        spread: Math.round(100 * Math.min(...Object.values(byPlatform).map(n => share(n)))),
        backlog: yearDone.filter(c => firstEver[c.key] < year).length,
        series: inSeries ? Math.round(100 * share(inSeries.unlocks)) : 0, seriesName: inSeries?.name,
        hardcore: raUs.length >= 20 ? Math.round(100 * share(raUs.filter(u => u.hc).length, raUs.length)) : 0, raUnlocks: raUs.length,
        retro: Math.round(100 * share(byPlatform.ra)),
        longest: ss.reduce((n, x) => Math.max(n, x.minutes), 0),
        bestDay: best ? days[best].unlocks : 0,
    };

    return {
        year, tz: TZ, partial: year === thisYear || undefined, asOf: year === thisYear ? local(now).day : undefined,
        // avatar: a picture URL or a path in the repo, like the hub header (assets/avatar.png when empty)
        user: { name: config.username ?? 'Player', motto: config.motto, avatar: config.avatar || undefined },
        traits,
        rankBy: byTime ? 'time' : 'unlocks',
        // Play time is logged from this day on: a year that starts before it only has part of its hours
        trackedFrom: byTime && local(trackedFrom).year === year && local(trackedFrom).day > `${year}-01-01` ? local(trackedFrom).day : undefined,
        totals, top,
        completions: yearDone.map(c => ({ ...gameCard(c.key), tier: c.tier, label: c.label, day: c.day, fact: c.fact })),
        rarest: rarest.map(named),
        first: named(us[0]), last: named(us[us.length - 1]),
        months, peakMonth: us.length ? peakMonth : undefined, hours, weekdays, parts, dayPart: us.length ? dayPart : undefined,
        streak, bestDay: best ? { day: best, unlocks: days[best].unlocks, game: gameCard(bestGame[0]), gameUnlocks: bestGame[1] } : undefined,
        heat, played,
        farms: farmUnlocks.length ? { games: new Set(farmUnlocks.map(u => u.key)).size, unlocks: farmUnlocks.length } : undefined,
    };
}

// ── Write ───────────────────────────────────────────────────────────────────
const allYears = [...new Set([...unlocks.map(u => u.year), ...sessions.map(s => s.year)])].sort();
const recaps = allYears.map(buildYear).filter(Boolean);

// ── A name for each year ────────────────────────────────────────────────────
// Every title has a measure, a bar the year must clear (`min`, plus `ok`) and a value where it is unmistakable (`max`).
// A year takes the title it stands out in most: partly how far past the bar it is, partly how it compares with
// the owner's other years, so a habit that holds every year (late nights) only names the year it peaked.
// No title two years in a row while another one fits.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const hm = m => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
const TITLES = [
    { name: 'The Completionist', of: t => t.completed, min: 4, max: 10, why: t => `${t.completed} games finished to 100%` },
    { name: 'The Finisher', of: t => t.beaten, min: 3, max: 8, why: t => `${t.beaten} games beaten` },
    { name: 'Backlog Slayer', of: t => t.backlog, min: 3, max: 8, why: t => `${t.backlog} older games finally finished` },
    { name: 'Rare Hunter', of: t => t.rareShare * 100, min: 15, max: 40, ok: t => t.unlocks >= 20, why: t => `${t.rare} unlocks under 10% rarity` },
    { name: 'Daily Driver', of: t => t.streak, min: 10, max: 30, why: t => `${t.streak} days in a row` },
    { name: 'One True Game', of: t => t.topShare, min: 45, max: 80, why: t => `${Math.round(t.topShare)}% of the year in ${t.topName}` },
    { name: 'Series Devotee', of: t => t.series, min: 40, max: 80, ok: t => t.unlocks >= 20, why: t => `${t.series}% of unlocks in ${t.seriesName}` },
    { name: 'Night Owl', of: t => t.night, min: 40, max: 75, ok: t => t.unlocks >= 20, why: t => `${t.night}% of unlocks after 22:00` },
    { name: 'Early Bird', of: t => t.morning, min: 30, max: 60, ok: t => t.unlocks >= 20, why: t => `${t.morning}% of unlocks before noon` },
    { name: 'Weekend Warrior', of: t => t.weekend, min: 55, max: 80, ok: t => t.unlocks >= 20, why: t => `${t.weekend}% of unlocks on weekends` },
    { name: 'The Sprinter', of: t => t.peakShare, min: 40, max: 75, ok: t => t.unlocks >= 40, why: t => `${t.peakShare}% of the year in ${MONTH_NAMES[t.peakMonth]}` },
    { name: 'The Comeback', of: t => t.gap, min: 120, max: 365, ok: t => t.gapAfter >= 20, why: t => `Back after ${t.gap} days away` },
    { name: 'The Explorer', of: t => t.newGames, min: 12, max: 35, why: t => `${t.newGames} new games started` },
    { name: 'Platform Hopper', of: t => t.spread, min: 15, max: 30, why: () => 'Unlocks on all three platforms' },
    { name: 'Retro Soul', of: t => t.retro, min: 60, max: 95, ok: t => t.unlocks >= 20, why: t => `${t.retro}% of unlocks on classic systems` },
    { name: 'No Safety Net', of: t => t.hardcore, min: 90, max: 100, ok: t => t.raUnlocks >= 40, why: t => `${t.hardcore}% of retro unlocks in hardcore` },
    { name: 'Marathoner', of: t => t.longest, min: 240, max: 480, why: t => `One session of ${hm(t.longest)}` },
    { name: 'Trophy Storm', of: t => t.bestDay, min: 25, max: 60, why: t => `${t.bestDay} unlocks in a single day` },
    { name: 'Banner Year', of: (t, all) => { const o = all.filter(x => x !== t).map(x => x.unlocks).sort((a, b) => a - b); return o.length >= 3 ? t.unlocks / Math.max(o[o.length >> 1], 1) : 0; },
        min: 1.75, max: 4, why: t => `${t.unlocks.toLocaleString('en-US')} unlocks, a personal high` , ok: (t, all) => all.every(x => x.unlocks <= t.unlocks) },
];
function pickTitles(recaps) {
    const all = recaps.map(r => r.traits);
    let prev = null;
    for (const r of recaps) {
        const t = r.traits;
        const fits = TITLES.map(T => {
            const v = T.of(t, all);
            if (!(v >= T.min) || (T.ok && !T.ok(t, all))) return null;
            const others = all.filter(x => x !== t).map(x => T.of(x, all));
            const rank = others.length >= 3 ? others.filter(o => o < v).length / others.length : 0.5;
            return { name: T.name, why: T.why(t), score: 0.5 * rank + 0.5 * Math.min(1, (v - T.min) / (T.max - T.min)) };
        }).filter(Boolean).sort((a, b) => b.score - a.score);
        fits.push(t.unlocks < 40
            ? { name: 'Quiet Year', why: `${t.unlocks} unlocks, ${t.games} ${t.games === 1 ? 'game' : 'games'}`, score: 0 }
            : { name: 'Steady Hand', why: `${t.activeDays} days played`, score: 0 });
        const pick = fits.find(f => f.name !== prev) ?? fits[0];
        r.title = { name: pick.name, why: pick.why };
        r.titleFits = fits;
        prev = pick.name;
    }
}
pickTitles(recaps);
const index = recaps.map(r => ({ year: r.year, partial: r.partial, title: r.title.name, unlocks: r.totals.unlocks, games: r.totals.games,
    minutes: r.totals.minutes, top: r.top[0] && { name: r.top[0].name, icon: r.top[0].icon, cover: r.top[0].cover } }));

// One static page per year from memory-card/page.html, so a shared link carries that year's title, text and
// image, and the page needs no fetch: its recap is embedded. memory-card/index.html is the latest year.
const pageDir = path.join(ROOT, 'memory-card');
const template = fs.existsSync(path.join(pageDir, 'page.html')) ? fs.readFileSync(path.join(pageDir, 'page.html'), 'utf8') : null;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const hoursText = m => `${Math.round(m / 60).toLocaleString('en-US')} hours`;
let bytes = 0;
if (template) {
    for (const name of fs.readdirSync(pageDir)) if (/^\d{4}$/.test(name)) fs.rmSync(path.join(pageDir, name), { recursive: true, force: true });
    const page = (r, base) => {
        const t = r.totals, name = r.user.name;
        const title = `${name}'s Memory Card ${r.year}`;
        const facts = [t.minutes ? hoursText(t.minutes) : null, `${t.unlocks.toLocaleString('en-US')} unlocks`, `${t.games} games`,
            t.completed + t.beaten ? `${t.completed + t.beaten} finished` : null].filter(Boolean).join(' · ');
        const desc = `${facts}${r.top[0] ? `. ${r.rankBy === 'time' ? 'Most played' : 'Most unlocked'}: ${r.top[0].name}` : ''}. ${r.title.name}.`;
        const url = `${SITE}/memory-card/${r.year}/`, image = `${SITE}/memory-card/share/${r.year}-link.jpg`;
        const meta = [
            `<title>${esc(title)}</title>`,
            `<meta name="description" content="${esc(desc)}">`,
            `<link rel="canonical" href="${url}">`,
            `<meta property="og:type" content="website">`,
            `<meta property="og:site_name" content="Savepoint">`,
            `<meta property="og:title" content="${esc(title)}">`,
            `<meta property="og:description" content="${esc(desc)}">`,
            `<meta property="og:url" content="${url}">`,
            `<meta property="og:image" content="${image}">`,
            `<meta property="og:image:width" content="1200">`,
            `<meta property="og:image:height" content="630">`,
            `<meta name="twitter:card" content="summary_large_image">`,
            `<meta name="twitter:title" content="${esc(title)}">`,
            `<meta name="twitter:description" content="${esc(desc)}">`,
            `<meta name="twitter:image" content="${image}">`,
        ].join('\n    ');
        const data = JSON.stringify({ recap: { ...r, traits: undefined, titleFits: undefined }, years: index, base, site: SITE }).replace(/</g, '\\u003c');
        return template.replace(/<!--meta-->[\s\S]*?<!--\/meta-->/, () => meta).replaceAll('{{base}}', base)
            .replace('<!--data-->', () => `<script type="application/json" id="recap">${data}</script>`);
    };
    for (const r of recaps) {
        const html = page(r, '../../');
        bytes += html.length;
        fs.mkdirSync(path.join(pageDir, String(r.year)), { recursive: true });
        fs.writeFileSync(path.join(pageDir, String(r.year), 'index.html'), html);
    }
    if (recaps.length) fs.writeFileSync(path.join(pageDir, 'index.html'), page(recaps[recaps.length - 1], '../'));
    fs.writeFileSync(path.join(pageDir, 'years.json'), JSON.stringify({ years: recaps.map(r => r.year), latest: recaps.length ? (r => ({ year: r.year, title: r.title.name, partial: !!r.partial }))(recaps[recaps.length - 1]) : null }));
}
console.log(`recap: ${recaps.length} years (${recaps.map(r => r.year).join(', ')})${template ? `, pages ${(bytes / 1024).toFixed(0)} KB` : ', no memory-card/page.html: nothing written'}`);
if (process.argv.includes('--titles')) for (const r of recaps) console.log(`${r.year}  ${r.titleFits.map(f => `${f.name === r.title.name ? '>' : ' '}${f.name} ${f.score.toFixed(2)} (${f.why})`).join('  |  ')}`);
if (process.argv.includes('--print')) for (const r of recaps) {
    console.log(`\n${r.year}  ${r.title.name} (${r.title.why})  unlocks ${r.totals.unlocks} games ${r.totals.games} new ${r.totals.newGames} done ${r.totals.completed}+${r.totals.beaten} min ${r.totals.minutes ?? '-'} days ${r.totals.activeDays} streak ${r.streak.days} rare ${r.totals.rare} farms ${JSON.stringify(r.farms ?? null)}`);
    for (const g of r.top) console.log(`   ${g.platform} ${g.name}  ${g.unlocks}u ${g.minutes ?? '-'}m ${g.share}% ${g.tier ?? ''}`);
    console.log('   rarest:', r.rarest.map(x => `${x.name} ${x.pct}% [${x.game.name}]${x.icon ? '' : ' NOICON'}`).join(' | '));
    console.log('   best day:', r.bestDay?.day, r.bestDay?.unlocks, r.bestDay?.game.name, '· part', r.dayPart?.label, r.dayPart?.pct);
}
