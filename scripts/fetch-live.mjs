// Refreshes data/github.json and data/youtube.json for the site.
// Runs in GitHub Actions (see .github/workflows/live-data.yml); Node 20+, no dependencies.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const GITHUB_USER = 'adi839';
const YOUTUBE_HANDLE = 'VTEAM2';
// Optional: set the YT_CHANNEL_ID repository variable if the handle lookup ever fails.
const YOUTUBE_CHANNEL_ID = process.env.YT_CHANNEL_ID || '';
const HIDDEN = ['asdasd', 'MyMusicFiles', 'Game_Data_JSON', 'Game_Data_JSON2', 'adi839', 'adi839.github.io', 'dasdsada', 'movie-verse-ai-hub', 'Temp-Spoofer', 'MyGameFixes'];
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const github = async (path) => {
    const headers = { accept: 'application/vnd.github+json', 'user-agent': `${GITHUB_USER}-site` };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const res = await fetch(`https://api.github.com${path}`, { headers });
    if (!res.ok) throw new Error(`GitHub ${res.status} ${path}`);
    return res.json();
};

const describeEvent = (e) => {
    const repo = String(e.repo?.name || '').replace(`${GITHUB_USER}/`, '');
    const p = e.payload || {};
    switch (e.type) {
        case 'PushEvent': {
            const n = Number(p.size) || (Array.isArray(p.commits) ? p.commits.length : 0) || 1;
            return `Pushed ${n} commit${n === 1 ? '' : 's'} to ${repo}`;
        }
        case 'CreateEvent': return p.ref_type === 'repository' ? `Created ${repo}` : `Created ${p.ref_type || 'branch'} ${p.ref || ''} in ${repo}`.replace(/\s+/g, ' ');
        case 'PullRequestEvent': return `${p.action === 'closed' && p.pull_request?.merged ? 'Merged' : 'Opened'} a pull request in ${repo}`;
        case 'IssuesEvent': return `${p.action === 'closed' ? 'Closed' : 'Opened'} an issue in ${repo}`;
        case 'WatchEvent': return `Starred ${repo}`;
        case 'ForkEvent': return `Forked ${repo}`;
        case 'ReleaseEvent': return `Released a new version of ${repo}`;
        case 'PublicEvent': return `Made ${repo} public`;
        default: return null;
    }
};

const fetchGithub = async () => {
    const [repos, events, profile] = await Promise.all([
        github(`/users/${GITHUB_USER}/repos?per_page=100&sort=pushed`),
        github(`/users/${GITHUB_USER}/events/public?per_page=50`).catch(() => []),
        github(`/users/${GITHUB_USER}`).catch(() => null),
    ]);
    return {
        followers: profile ? profile.followers : null,
        repos: repos
            .filter((r) => !r.fork && !r.private && !HIDDEN.includes(r.name))
            .map((r) => ({
                name: r.name,
                description: r.description || '',
                language: r.language || '',
                stars: r.stargazers_count || 0,
                url: r.html_url,
                homepage: r.homepage || '',
                updated: r.pushed_at || r.updated_at,
                size: r.size,
            })),
        events: events
            .filter((e) => !HIDDEN.some((name) => e.repo?.name === `${GITHUB_USER}/${name}`))
            .map((e) => ({ text: describeEvent(e), date: e.created_at, repo: e.repo?.name || '' }))
            .filter((e) => e.text)
            .slice(0, 12),
    };
};

const decode = (s) => String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .trim();
const first = (text, re) => (text.match(re) || [])[1] || '';

const findChannelId = async () => {
    if (/^UC[\w-]{22}$/.test(YOUTUBE_CHANNEL_ID)) return YOUTUBE_CHANNEL_ID;
    const res = await fetch(`https://www.youtube.com/@${YOUTUBE_HANDLE}`, { headers: { 'user-agent': BROWSER_UA, 'accept-language': 'en-US,en;q=0.9' } });
    if (!res.ok) throw new Error(`YouTube page ${res.status}`);
    const html = await res.text();
    const id = first(html, /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)
        || first(html, /"externalId":"(UC[\w-]{22})"/)
        || first(html, /"channelId":"(UC[\w-]{22})"/);
    if (!id) throw new Error('Channel id not found on the YouTube page');
    return id;
};

export const parseFeed = (xml) => {
    const [head, ...entries] = xml.split('<entry>');
    return {
        channel: { title: decode(first(head, /<title>([\s\S]*?)<\/title>/)), url: `https://www.youtube.com/@${YOUTUBE_HANDLE}` },
        videos: entries.map((entry) => ({
            id: first(entry, /<yt:videoId>([\w-]{11})<\/yt:videoId>/),
            title: decode(first(entry, /<title>([\s\S]*?)<\/title>/)),
            published: first(entry, /<published>([^<]+)<\/published>/),
            views: Number(first(entry, /<media:statistics views="(\d+)"/)) || null,
        })).filter((v) => v.id).slice(0, 8),
    };
};

const fetchYoutube = async () => {
    const id = await findChannelId();
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`, { headers: { 'user-agent': BROWSER_UA } });
    if (!res.ok) throw new Error(`YouTube feed ${res.status}`);
    const data = parseFeed(await res.text());
    data.channel.id = id;
    return data;
};

// Write only when the content changed, so the repo doesn't get a commit every run.
const save = async (file, payload) => {
    let previous = null;
    try { previous = JSON.parse(await readFile(file, 'utf8')); } catch { /* first run */ }
    const strip = (o) => { if (!o) return o; const { generated_at: _, ...rest } = o; return rest; };
    if (previous && JSON.stringify(strip(previous)) === JSON.stringify(payload)) {
        console.log(`${file}: unchanged`);
        return;
    }
    await writeFile(file, `${JSON.stringify({ generated_at: new Date().toISOString(), ...payload }, null, 2)}\n`);
    console.log(`${file}: updated`);
};

const main = async () => {
    await mkdir('data', { recursive: true });
    let failed = 0;
    await fetchGithub().then((d) => save('data/github.json', d)).catch((e) => { failed++; console.error('GitHub:', e.message); });
    await fetchYoutube().then((d) => save('data/youtube.json', d)).catch((e) => { failed++; console.error('YouTube:', e.message); });
    if (failed === 2) process.exitCode = 1;
};

if (import.meta.url === `file://${process.argv[1]}`) main();
