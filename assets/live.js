// Live data for the panels: GitHub, YouTube and Discord.
// Everything from outside is written with textContent, never as HTML.

export const CONFIG = {
    githubUser: 'adi839',
    // Repos that never show up on the site (tests, file dumps, this site itself).
    hiddenRepos: ['asdasd', 'MyMusicFiles', 'Game_Data_JSON', 'Game_Data_JSON2', 'adi839', 'adi839.github.io', 'dasdsada', 'movie-verse-ai-hub', 'Temp-Spoofer', 'MyGameFixes'],
    // To show your live Discord status, activity and Spotify:
    //   1. Join https://discord.gg/lanyard with your Discord account.
    //   2. Discord → Settings → Advanced → turn on Developer Mode,
    //      then right-click your name → Copy User ID, and paste it here.
    discordUserId: '',
    discordInvite: 'tUcEZ6kp5a',
    // Shown when a repo has no description on GitHub.
    descriptions: {
        'Steam-switcher': 'Windows app to switch between Steam accounts in one click, with ban status and top games.',
    },
};

const $ = (sel) => document.querySelector(sel);
const SNOWFLAKE = /^\d{15,21}$/;

export const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
};

const image = (src, alt, className, onFail) => {
    const img = el('img', className);
    img.alt = alt || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.onerror = onFail || (() => img.remove());
    img.src = src;
    return img;
};

const safeHttpUrl = (value) => {
    try {
        const url = new URL(String(value));
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch { return null; }
};

const ago = (date) => {
    const seconds = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
    if (!Number.isFinite(seconds)) return '';
    const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
    let value = seconds;
    for (const [size, unit] of steps) {
        if (value < size) {
            const n = Math.max(1, Math.floor(value));
            return unit === 'second' ? 'just now' : `${n} ${unit}${n === 1 ? '' : 's'} ago`;
        }
        value /= size;
    }
    return '';
};

const clock = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = String(total % 60).padStart(2, '0');
    return hours ? `${hours}:${String(mins).padStart(2, '0')}:${secs}` : `${mins}:${secs}`;
};

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

const getJson = async (url, { timeout = 8000 } = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
        const res = await fetch(url, { signal: ctrl.signal, cache: 'no-cache' });
        if (!res.ok) throw new Error(`${res.status} ${url}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
};

const stat = (value, label) => {
    const box = el('div', 'stat');
    box.append(el('b', null, String(value)), el('span', null, label));
    return box;
};

const ARROW = '<svg class="row__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
const CODE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/></svg>';
const GAMEPAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.32 5H6.68a4 4 0 0 0-3.98 3.59l-.9 8.1A2.4 2.4 0 0 0 4.18 19.4c.83 0 1.6-.43 2.03-1.14L7.5 16h9l1.29 2.26c.43.71 1.2 1.14 2.03 1.14a2.4 2.4 0 0 0 2.38-2.71l-.9-8.1A4 4 0 0 0 17.32 5Z"/></svg>';
const LANG_COLORS = { Python: '#3572A5', JavaScript: '#f1e05a', TypeScript: '#3178c6', HTML: '#e34c26', CSS: '#563d7c', 'C#': '#178600', 'C++': '#f34b7d', Java: '#b07219', Lua: '#000080', Go: '#00ADD8', Rust: '#dea584' };

/* ---------------- GitHub ---------------- */

// Accept both the saved snapshot (data/github.json) and raw GitHub API objects.
const normRepo = (r) => ({
    name: String(r.name || ''),
    description: r.description ? String(r.description) : '',
    language: r.language ? String(r.language) : '',
    stars: Number(r.stars ?? r.stargazers_count ?? 0) || 0,
    url: safeHttpUrl(r.url && String(r.url).startsWith('https://github.com/') ? r.url : r.html_url) || `https://github.com/${CONFIG.githubUser}/${r.name}`,
    homepage: safeHttpUrl(r.homepage || ''),
    updated: r.updated || r.pushed_at || r.updated_at || '',
    fork: Boolean(r.fork),
    empty: Number(r.size ?? 1) === 0,
});

const describeEvent = (e) => {
    const repo = String((e.repo && e.repo.name) || e.repo || '').replace(`${CONFIG.githubUser}/`, '');
    const p = e.payload || {};
    switch (e.type) {
        case 'PushEvent': {
            const n = Number(p.size) || (Array.isArray(p.commits) ? p.commits.length : 0) || 1;
            return `Pushed ${n} commit${n === 1 ? '' : 's'} to ${repo}`;
        }
        case 'CreateEvent': return p.ref_type === 'repository' ? `Created ${repo}` : `Created ${p.ref_type || 'branch'} ${p.ref || ''} in ${repo}`.trim();
        case 'DeleteEvent': return `Deleted ${p.ref_type || 'branch'} in ${repo}`;
        case 'PullRequestEvent': return `${p.action === 'closed' && (p.merged || (p.pull_request && p.pull_request.merged)) ? 'Merged' : 'Opened'} a pull request in ${repo}`;
        case 'IssuesEvent': return `${p.action === 'closed' ? 'Closed' : 'Opened'} an issue in ${repo}`;
        case 'WatchEvent': return `Starred ${repo}`;
        case 'ForkEvent': return `Forked ${repo}`;
        case 'ReleaseEvent': return `Released a new version of ${repo}`;
        case 'PublicEvent': return `Made ${repo} public`;
        default: return null;
    }
};

const normEvents = (list) => (Array.isArray(list) ? list : [])
    .map((e) => ({ text: e.text || describeEvent(e), date: e.date || e.created_at, repo: String((e.repo && e.repo.name) || e.repo || '') }))
    .filter((e) => e.text && e.date && !CONFIG.hiddenRepos.some((name) => e.repo.endsWith(`/${name}`) || e.repo === name))
    .slice(0, 8);

let repoCache = [];
export const getRepo = (name) => repoCache.find((r) => r.name.toLowerCase() === name.toLowerCase());

const renderGithub = ({ repos, events, followers }) => {
    const visible = repos
        .map(normRepo)
        .filter((r) => r.name && !r.fork && !CONFIG.hiddenRepos.includes(r.name))
        .sort((a, b) => new Date(b.updated) - new Date(a.updated));
    repoCache = visible;

    const stats = $('#gh-stats');
    stats.replaceChildren(
        stat(visible.length, 'Projects'),
        stat(visible.reduce((sum, r) => sum + r.stars, 0), 'Stars'),
        ...(followers != null ? [stat(followers, 'Followers')] : []),
    );

    const list = $('#gh-repos');
    list.replaceChildren();
    visible.forEach((repo) => {
        const li = el('li');
        const a = el('a', 'row');
        a.href = repo.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        const icon = el('span', 'row__icon');
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = CODE;
        const body = el('span', 'row__body');
        body.append(el('span', 'row__title', repo.name));
        body.append(el('span', 'row__sub', repo.description || CONFIG.descriptions[repo.name] || (repo.empty ? 'Just started, code coming soon.' : 'No description yet.')));
        const meta = el('span', 'row__meta');
        if (repo.language) {
            const lang = el('span', null, repo.language);
            const dot = el('span', 'lang-dot');
            dot.style.setProperty('--lc', LANG_COLORS[repo.language] || '#a78bfa');
            lang.prepend(dot);
            meta.append(lang);
        }
        if (repo.stars) meta.append(el('span', null, `★ ${repo.stars}`));
        if (repo.updated) meta.append(el('span', null, `updated ${ago(repo.updated)}`));
        if (meta.childNodes.length) body.append(meta);
        a.append(icon, body);
        a.insertAdjacentHTML('beforeend', ARROW);
        li.append(a);
        list.append(li);
    });
    if (!visible.length) list.append(el('li', 'empty', 'No public projects yet.'));

    const feed = $('#gh-activity');
    feed.replaceChildren();
    normEvents(events).forEach((event) => {
        const li = el('li', null, event.text);
        const time = el('time', null, ago(event.date));
        time.dateTime = new Date(event.date).toISOString();
        li.append(time);
        feed.append(li);
    });
    if (!feed.childNodes.length) feed.append(el('li', 'empty', 'No recent public activity.'));

    // Live numbers on the project planets
    const put = (id, repoName) => {
        const repo = getRepo(repoName);
        const box = $(id);
        if (!repo || !box) return;
        box.replaceChildren(stat(repo.stars, 'Stars'), stat(repo.updated ? ago(repo.updated) : '–', 'Last update'), ...(repo.language ? [stat(repo.language, 'Language')] : []));
        box.hidden = false;
    };
    put('#steam-stats', 'Steam-switcher');
    put('#nexus-stats', 'nexustv-app');
};

const loadGithub = async () => {
    // 1. The snapshot saved by the GitHub Action (fast, no rate limit)
    let rendered = false;
    try {
        const snap = await getJson('data/github.json');
        if (Array.isArray(snap.repos)) {
            renderGithub({ repos: snap.repos, events: snap.events, followers: snap.followers });
            rendered = true;
        }
    } catch { /* no snapshot yet */ }

    // 2. Straight from GitHub for up-to-the-minute data (60 requests/hour per visitor)
    try {
        const user = CONFIG.githubUser;
        const [repos, events, profile] = await Promise.all([
            getJson(`https://api.github.com/users/${user}/repos?per_page=100&sort=pushed`),
            getJson(`https://api.github.com/users/${user}/events/public?per_page=30`).catch(() => null),
            getJson(`https://api.github.com/users/${user}`).catch(() => null),
        ]);
        if (Array.isArray(repos)) {
            renderGithub({ repos, events: events || [], followers: profile ? profile.followers : null });
            rendered = true;
        }
    } catch { /* rate limited or offline: keep the snapshot */ }

    if (!rendered) {
        $('#gh-repos').replaceChildren(el('li', 'empty', "Couldn't load projects right now."));
        $('#gh-activity').replaceChildren(el('li', 'empty', "Couldn't load activity right now."));
    }
};

/* ---------------- YouTube ---------------- */

const playVideo = (id, title) => {
    const holder = $('#yt-player');
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
    frame.title = title || 'YouTube video';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    holder.replaceChildren(frame);
    holder.hidden = false;
    holder.scrollIntoView({ block: 'nearest' });
};

const loadYoutube = async () => {
    let data;
    try { data = await getJson('data/youtube.json'); } catch { return; }
    const videos = (Array.isArray(data.videos) ? data.videos : []).filter((v) => /^[\w-]{11}$/.test(v.id || '')).slice(0, 6);
    const list = $('#yt-list');
    list.replaceChildren();
    videos.forEach((video) => {
        const li = el('li');
        const card = el('button', 'video-card');
        card.type = 'button';
        card.setAttribute('aria-label', `Play: ${video.title || 'video'}`);
        card.append(image(`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`, ''));
        const text = el('span');
        text.append(el('b', null, video.title || 'Untitled video'));
        if (video.published) {
            const time = el('time', null, ago(video.published));
            time.dateTime = video.published;
            text.append(time);
        }
        card.append(text);
        card.addEventListener('click', () => playVideo(video.id, video.title));
        li.append(card);
        list.append(li);
    });
    if (videos.length) $('#yt-intro').textContent = 'My YouTube channel. Newest uploads, updated automatically:';
    if (data.channel && data.channel.title) $('#youtube-h').textContent = String(data.channel.title);
};

/* ---------------- Discord ---------------- */

const STATUS_TEXT = { online: 'Online', idle: 'Idle', dnd: 'Do not disturb', offline: 'Offline' };
const IDLE_LINE = { online: 'Online, come say hi 👋', idle: 'Away for a bit 🌙', dnd: 'Busy right now ⛔', offline: 'Offline right now 💤' };
const VERBS = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 5: 'Competing in' };

const fallbackArt = () => {
    const box = el('div', 'act__fallback');
    box.innerHTML = GAMEPAD;
    return box;
};
const assetUrl = (appId, key) => {
    if (!key) return null;
    if (key.startsWith('mp:external/')) return `https://media.discordapp.net/external/${key.slice(12)}`;
    if (key.startsWith('mp:')) return `https://media.discordapp.net/${key.slice(3)}`;
    if (key.startsWith('spotify:')) return `https://i.scdn.co/image/${key.slice(8)}`;
    return appId ? `https://cdn.discordapp.com/app-assets/${appId}/${key}.png?size=160` : null;
};
const avatarUrl = (user) => /^(a_)?[0-9a-f]{20,40}$/.test(user.avatar || '')
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;

const activityRow = (activity) => {
    const row = el('div', 'act');
    const art = el('div', 'act__art');
    const appId = SNOWFLAKE.test(activity.application_id || '') ? activity.application_id : null;
    const assets = activity.assets || {};
    const large = assetUrl(appId, assets.large_image);
    art.append(large ? image(large, assets.large_text || activity.name, 'act__img', function () { this.replaceWith(fallbackArt()); }) : fallbackArt());
    const small = assetUrl(appId, assets.small_image);
    if (small) art.append(image(small, assets.small_text, 'act__small'));
    const body = el('div', 'act__body');
    body.append(el('span', 'act__label', VERBS[activity.type] || 'Activity'), el('span', 'act__title', activity.name));
    if (activity.details) body.append(el('span', 'act__line', activity.details));
    if (activity.state) body.append(el('span', 'act__line', activity.state));
    const { start, end } = activity.timestamps || {};
    if (start || end) {
        const time = el('span', 'act__time');
        if (start) time.dataset.start = start; else time.dataset.end = end;
        body.append(time);
    }
    row.append(art, body);
    return row;
};

const spotifyRow = (spotify) => {
    const row = el('div', 'act act--spotify');
    const art = el('div', 'act__art');
    const cover = /^https:\/\/i\.scdn\.co\//.test(spotify.album_art_url || '') ? spotify.album_art_url : null;
    art.append(cover ? image(cover, spotify.album, 'act__img', function () { this.replaceWith(fallbackArt()); }) : fallbackArt());
    const body = el('div', 'act__body');
    const title = el(spotify.track_id ? 'a' : 'span', 'act__title', spotify.song);
    if (spotify.track_id) {
        title.href = `https://open.spotify.com/track/${encodeURIComponent(spotify.track_id)}`;
        title.target = '_blank';
        title.rel = 'noopener noreferrer';
    }
    const artists = (spotify.artist || '').split(';').map((n) => n.trim()).join(', ');
    body.append(el('span', 'act__label', 'Listening to Spotify'), title, el('span', 'act__line', `by ${artists}`));
    const { start, end } = spotify.timestamps || {};
    if (start && end) {
        const bar = el('div', 'bar');
        bar.dataset.start = start;
        bar.dataset.end = end;
        bar.append(el('div', 'bar__fill'));
        const times = el('div', 'bar__times');
        times.append(el('span', null, '0:00'), el('span', null, clock(end - start)));
        body.append(bar, times);
    }
    row.append(art, body);
    return row;
};

const tickPresence = () => {
    const box = $('#presence');
    if (box.hidden) return;
    const now = Date.now();
    box.querySelectorAll('.act__time').forEach((t) => {
        t.textContent = t.dataset.start ? `${clock(now - Number(t.dataset.start))} elapsed` : `${clock(Number(t.dataset.end) - now)} left`;
    });
    box.querySelectorAll('.bar').forEach((bar) => {
        const start = Number(bar.dataset.start);
        const end = Number(bar.dataset.end);
        bar.firstChild.style.setProperty('--p', Math.min(1, Math.max(0, (now - start) / (end - start))).toFixed(4));
        bar.nextSibling.firstChild.textContent = clock(Math.min(now, end) - start);
    });
};

const renderPresence = (data, onPresence) => {
    const user = data && data.discord_user;
    if (!user || !SNOWFLAKE.test(user.id || '')) return;
    const status = STATUS_TEXT[data.discord_status] ? data.discord_status : 'offline';
    const activities = Array.isArray(data.activities) ? data.activities : [];

    const avatar = $('#dc-avatar');
    const src = avatarUrl(user);
    if (avatar.getAttribute('src') !== src) avatar.src = src;
    $('#dc-dot').dataset.status = status;
    $('#dc-name').textContent = user.global_name || user.display_name || user.username;
    $('#dc-handle').textContent = `@${user.username}`;
    $('#dc-profile').href = `https://discord.com/users/${user.id}`;

    const chip = $('#dc-chip');
    const mobileOnly = data.active_on_discord_mobile && !data.active_on_discord_desktop && !data.active_on_discord_web;
    chip.dataset.status = status;
    $('#dc-chip-text').textContent = STATUS_TEXT[status] + (status !== 'offline' && mobileOnly ? ' on mobile' : '');
    chip.hidden = false;

    const custom = activities.find((a) => a.type === 4);
    const customEl = $('#dc-custom');
    customEl.replaceChildren();
    if (custom && (custom.state || (custom.emoji && custom.emoji.name))) {
        const emoji = custom.emoji || {};
        if (SNOWFLAKE.test(emoji.id || '')) customEl.append(image(`https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}?size=48`, emoji.name));
        else if (emoji.name) customEl.append(document.createTextNode(`${emoji.name} `));
        if (custom.state) customEl.append(document.createTextNode(custom.state));
    }
    customEl.hidden = !customEl.hasChildNodes();

    const rows = [];
    if (data.listening_to_spotify && data.spotify) rows.push(spotifyRow(data.spotify));
    for (const activity of activities) {
        if (rows.length >= 3) break;
        if (activity.type === 4 || (data.listening_to_spotify && activity.id === 'spotify:1')) continue;
        rows.push(activityRow(activity));
    }
    $('#dc-acts').replaceChildren(...rows);
    const idle = $('#dc-idle');
    idle.textContent = IDLE_LINE[status];
    idle.hidden = rows.length > 0 || !customEl.hidden;

    $('#presence').hidden = false;
    tickPresence();
    const playing = activities.find((a) => a.type === 0);
    onPresence({ status, playing: playing ? playing.name : null, spotify: data.listening_to_spotify ? data.spotify && data.spotify.song : null });
};

const startLanyard = (onPresence) => {
    const id = CONFIG.discordUserId;
    if (!SNOWFLAKE.test(id)) return;
    let socket;
    let heartbeat;
    let attempts = 0;
    const connect = () => {
        if (attempts > 8) return;
        socket = new WebSocket('wss://api.lanyard.rest/socket');
        socket.addEventListener('message', (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch { return; }
            if (msg.op === 1) {
                clearInterval(heartbeat);
                heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ op: 3 })); }, (msg.d && msg.d.heartbeat_interval) || 30000);
                socket.send(JSON.stringify({ op: 2, d: { subscribe_to_id: id } }));
            } else if (msg.op === 0 && (msg.t === 'INIT_STATE' || msg.t === 'PRESENCE_UPDATE')) {
                attempts = 0;
                renderPresence(msg.d, onPresence);
            }
        });
        socket.addEventListener('close', () => {
            clearInterval(heartbeat);
            setTimeout(connect, Math.min(30000, 1000 * 2 ** attempts++));
        });
    };
    getJson(`https://api.lanyard.rest/v1/users/${id}`)
        .then((json) => {
            if (json.success) { renderPresence(json.data, onPresence); connect(); }
            else console.warn('Lanyard:', (json.error && json.error.message) || json.error, '(join https://discord.gg/lanyard)');
        })
        .catch(connect);
    setInterval(tickPresence, 1000);
};

const loadServerStats = () => {
    if (!/^[\w-]+$/.test(CONFIG.discordInvite)) return;
    getJson(`https://discord.com/api/v10/invites/${CONFIG.discordInvite}?with_counts=true`)
        .then((invite) => {
            if (invite.guild && invite.guild.name) $('#dc-server-name').textContent = invite.guild.name;
            if (typeof invite.approximate_presence_count === 'number') {
                $('#dc-server-sub').replaceChildren(el('span', 'live-dot'), `${compact.format(invite.approximate_presence_count)} online · ${compact.format(invite.approximate_member_count)} members`);
            }
        })
        .catch(() => { /* keep the static text */ });
};

export function initLive({ onPresence = () => {} } = {}) {
    loadGithub();
    loadYoutube();
    loadServerStats();
    startLanyard(onPresence);
}
