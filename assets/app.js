import { initLive } from './live.js';

// Any direct link to an audio file works. For the music planet to pulse to the
// beat, the file must live in this repo (e.g. 'assets/lofi.mp3').
const MUSIC_SRC = 'https://drive.usercontent.google.com/download?id=182D-TYmwxlULAklHLEjTMsNYynROXTBn&export=download&confirm=t';

const PLANETS = [
    { id: 'nexustv', label: 'NexusTV', icon: '📺', color: 0x8b5cf6, shape: 'tv' },
    { id: 'discord', label: 'Discord', icon: '💬', color: 0x5865f2, shape: 'torus' },
    { id: 'youtube', label: 'YouTube', icon: '▶️', color: 0xff2d55, shape: 'play' },
    { id: 'github', label: 'GitHub', icon: '🐙', color: 0x22d3ee, shape: 'octa' },
    { id: 'steam', label: 'Steam Switcher', icon: '🛠️', color: 0x38bdf8, shape: 'knot' },
    { id: 'music', label: 'Music', icon: '🎵', color: 0xf472b6, shape: 'ringed' },
];

const $ = (sel) => document.querySelector(sel);
const html = document.documentElement;
const is3d = () => html.dataset.view === '3d';
const mobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};

/* ---------- Toast ---------- */
const toastEl = $('#toast');
let toastTimer;
const toast = (message, ms = 2200) => {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), ms);
};

/* ---------- Panels ---------- */
let world = null;
let openId = null;
let returnFocus = null;

const panelFor = (id) => document.getElementById(`panel-${id}`);
const setDockCurrent = (id) => document.querySelectorAll('.dock__btn').forEach((b) => b.setAttribute('aria-current', String(b.dataset.go === id)));

const openPanel = (id, { from } = {}) => {
    const panel = panelFor(id);
    if (!panel) return;
    if (!is3d()) {
        panel.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        return;
    }
    returnFocus = from || document.activeElement;
    document.querySelectorAll('.panel.is-active').forEach((p) => p.classList.remove('is-active'));
    panel.classList.add('is-active');
    openId = id;
    html.classList.add('sheet-open');
    $('#content').scrollTop = 0;
    setDockCurrent(id);
    if (world) { if (id === 'about') world.reset(); else world.focus(id); }
    const heading = panel.querySelector('h2');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
    hideHint();
};

const closePanel = () => {
    if (!openId) return;
    openId = null;
    html.classList.remove('sheet-open');
    setDockCurrent(null);
    if (world) world.unfocus();
    if (returnFocus && returnFocus.focus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
};

const insetForSheet = () => {
    if (!openId) return { right: 0, bottom: 0 };
    const box = $('#content').getBoundingClientRect();
    if (window.innerWidth <= 760) return { right: 0, bottom: window.innerHeight - box.top };
    return { right: window.innerWidth - box.left, bottom: 0 };
};

$('#close-btn').addEventListener('click', closePanel);
$('#home-btn').addEventListener('click', (e) => openPanel('about', { from: e.currentTarget }));
document.querySelectorAll('[data-go]').forEach((btn) => btn.addEventListener('click', () => openPanel(btn.dataset.go, { from: btn })));

/* ---------- Hint ---------- */
const hint = $('#hint');
let hintTimer;
const hideHint = () => { clearTimeout(hintTimer); hint.classList.add('is-gone'); };
const showHint = () => {
    if (store.get('hinted', false)) return;
    store.set('hinted', true);
    hint.classList.remove('is-gone');
    hintTimer = setTimeout(hideHint, 7000);
};

/* ---------- Star hunt ---------- */
const TOTAL_STARS = 10;
let starsFound = store.get('stars', []).filter((n) => Number.isInteger(n) && n >= 0 && n < TOTAL_STARS);
const renderStars = () => {
    const n = starsFound.length;
    $('#stars-count').textContent = String(n);
    $('#stars-bar').style.setProperty('--p', String(n / TOTAL_STARS));
    $('#stars-text').textContent = n >= TOTAL_STARS
        ? 'All 10 stars found. Legend.'
        : n === 0 ? '10 stars are hidden around the world. Find them all.' : `${n} of 10 stars found. ${TOTAL_STARS - n} to go.`;
    $('#trophy').hidden = n < TOTAL_STARS;
    $('#stars-hud').classList.toggle('is-complete', n >= TOTAL_STARS);
};
renderStars();
const onStar = (index) => {
    if (!starsFound.includes(index)) starsFound.push(index);
    store.set('stars', starsFound);
    renderStars();
    hideHint();
    if (starsFound.length >= TOTAL_STARS) {
        toast('🏆 All 10 stars! The world turns gold. GG!', 4000);
        world && world.setGolden(true, true);
    } else {
        toast(`★ Star ${starsFound.length}/10 found!`);
    }
};

/* ---------- Music ---------- */
const audio = new Audio();
audio.loop = true;
audio.preload = 'none';
audio.volume = 0.6;
const musicPanel = $('#panel-music');
const musicBtn = $('#music-btn');
const playBtn = $('#play');
const musicStatus = $('#music-status');
const viz = $('#viz');
const BARS = 24;
for (let i = 0; i < BARS; i++) viz.append(document.createElement('i'));
const vizBars = [...viz.children];

let musicState = 'idle';
const MUSIC_TEXT = {
    idle: 'Tap play, or press M anywhere',
    loading: 'Loading…',
    playing: 'Now playing',
    paused: 'Paused',
    error: "Couldn't load the music. Tap to retry.",
};
const setMusic = (next) => {
    musicState = next;
    musicPanel.dataset.music = next;
    const on = next === 'playing' || next === 'loading';
    musicBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-label', on ? 'Pause music' : 'Play music');
    musicBtn.setAttribute('aria-label', on ? 'Pause music (M)' : 'Play music (M)');
    musicStatus.textContent = MUSIC_TEXT[next];
};

let analyser = null;
let freq = null;
const sameOrigin = (() => { try { return new URL(MUSIC_SRC, location.href).origin === location.origin; } catch { return false; } })();
const setupAnalyser = () => {
    // A cross-origin file without CORS would play silently through the analyser, so only same-origin files get one.
    if (analyser || !sameOrigin) return;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        const src = ctx.createMediaElementSource(audio);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        freq = new Uint8Array(analyser.frequencyBinCount);
        src.connect(analyser);
        analyser.connect(ctx.destination);
        if (ctx.state === 'suspended') ctx.resume();
    } catch { analyser = null; }
};

const toggleMusic = async () => {
    if (musicState === 'playing' || musicState === 'loading') {
        audio.pause();
        setMusic('paused');
        return;
    }
    if (!audio.src || musicState === 'error') audio.src = MUSIC_SRC;
    setupAnalyser();
    setMusic('loading');
    try {
        await audio.play();
    } catch (err) {
        if (err.name !== 'AbortError') setMusic('error');
    }
};
audio.addEventListener('playing', () => setMusic('playing'));
audio.addEventListener('waiting', () => { if (!audio.paused) setMusic('loading'); });
audio.addEventListener('error', () => { if (musicState !== 'idle') setMusic('error'); });
musicBtn.addEventListener('click', toggleMusic);
playBtn.addEventListener('click', toggleMusic);

// A 0..1 "loudness" that drives the visualiser and the music planet.
let level = 0;
const readLevel = () => {
    if (musicState !== 'playing') { level += (0 - level) * 0.1; return level; }
    if (analyser) {
        analyser.getByteFrequencyData(freq);
        let sum = 0;
        for (let i = 0; i < 12; i++) sum += freq[i];
        level = sum / (12 * 255);
    } else {
        // No analyser (file on another site): a soft beat at ~84 BPM.
        const t = audio.currentTime || performance.now() / 1000;
        const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 1.4)), 6);
        level += (0.25 + beat * 0.6 - level) * 0.3;
    }
    return level;
};
const drawViz = () => {
    const lv = readLevel();
    if (!document.hidden && (!is3d() || openId === 'music')) {
        const t = performance.now() / 1000;
        vizBars.forEach((bar, i) => {
            let v;
            if (analyser && musicState === 'playing') v = freq[i + 2] / 255;
            else if (musicState === 'playing') v = lv * (0.5 + 0.5 * Math.abs(Math.sin(t * 3 + i * 0.7)));
            else v = 0.06 + 0.04 * Math.sin(t * 1.5 + i * 0.5);
            bar.style.setProperty('--v', Math.max(0.05, Math.min(1, v)).toFixed(3));
        });
    }
    requestAnimationFrame(drawViz);
};
requestAnimationFrame(drawViz);

/* ---------- Copy + share ---------- */
const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.cssText = 'position:fixed;opacity:0';
        document.body.append(area);
        area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch { /* ignore */ }
        area.remove();
        return ok;
    }
};
document.querySelectorAll('[data-copy]').forEach((btn) => {
    let timer;
    btn.addEventListener('click', async () => {
        const ok = await copyText(btn.dataset.copy);
        toast(ok ? btn.dataset.toast : "Couldn't copy, open the link instead");
        if (!ok) return;
        btn.classList.add('is-done');
        clearTimeout(timer);
        timer = setTimeout(() => btn.classList.remove('is-done'), 1600);
    });
});
$('#share').addEventListener('click', async () => {
    const url = location.origin + location.pathname;
    if (navigator.share) {
        try { await navigator.share({ title: document.title, text: "Explore Gabytzu's 3D world", url }); } catch { /* closed */ }
        return;
    }
    toast(await copyText(url) ? 'Link copied 🔗' : "Couldn't copy the link");
});

/* ---------- View switch ---------- */
const viewBtn = $('#view-btn');
const syncViewBtn = () => {
    viewBtn.textContent = is3d() ? '2D' : '3D';
    viewBtn.setAttribute('aria-label', is3d() ? 'Switch to classic view' : 'Switch to 3D world');
    viewBtn.title = viewBtn.getAttribute('aria-label');
};
syncViewBtn();
const switchView = (view, message) => {
    // Stored as a plain string: the inline script in <head> reads it before first paint.
    try { localStorage.setItem('view', view); } catch { /* ignore */ }
    const url = new URL(location.href);
    url.searchParams.delete('view');
    if (message) sessionStorage.setItem('toast', message);
    location.replace(url.href);
};
viewBtn.addEventListener('click', () => switchView(is3d() ? 'classic' : '3d'));
const pendingToast = sessionStorage.getItem('toast');
if (pendingToast) { sessionStorage.removeItem('toast'); setTimeout(() => toast(pendingToast, 3500), 400); }

/* ---------- Keyboard ---------- */
document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest('input, textarea, [contenteditable]')) return;
    const key = (e.key || '').toLowerCase();
    if (key === 'escape' && openId) { e.preventDefault(); closePanel(); return; }
    if (e.repeat) return;
    if (key === 'm') { toggleMusic(); return; }
    if (key === 'r' && is3d()) { closePanel(); world && world.reset(); return; }
    const n = Number(key);
    if (n >= 1 && n <= PLANETS.length) openPanel(PLANETS[n - 1].id);
});

/* ---------- Live data ---------- */
let lastStatus = null;
initLive({ onPresence: ({ status }) => { lastStatus = status; if (world) world.setStatus(status); } });

/* ---------- 3D world ---------- */
const loader = $('#loader');
const finishLoading = () => loader.classList.add('is-done');

const fallBackToClassic = (message) => {
    html.dataset.view = 'classic';
    html.classList.remove('sheet-open');
    finishLoading();
    syncViewBtn();
    if (message) toast(message, 3500);
};

if (is3d()) {
    const safety = setTimeout(() => fallBackToClassic("The 3D world didn't load, showing the classic view."), 15000);
    import('./world.js')
        .then(({ createWorld }) => {
            const container = $('#world');
            container.addEventListener('world:frame', () => { clearTimeout(safety); finishLoading(); }, { once: true });
            world = createWorld({
                canvas: $('#scene'),
                container,
                planets: PLANETS,
                starsFound,
                golden: starsFound.length >= TOTAL_STARS,
                mobile,
                trail: finePointer,
                onSelect: (id) => openPanel(id),
                onStar,
                onCore: (taps) => {
                    hideHint();
                    if (taps === 1) toast(['GG! 🎮', '+100 XP ⚡', 'Combo x2 🔥', 'Nice click 😎'][Math.floor(Math.random() * 4)]);
                    if (taps === 0) toast('💥 Core overload!');
                },
                onReady: showHint,
                onSlow: (fps) => {
                    if (html.dataset.forced) return;
                    switchView('classic', `Your device ran the 3D world at ${Math.round(fps)} fps, so here's the classic view. You can switch back with the 3D button.`);
                },
                getLevel: () => level,
                getInset: insetForSheet,
            });
            if (lastStatus) world.setStatus(lastStatus);
            window.__world = world;
        })
        .catch((err) => {
            console.error('3D world failed:', err);
            clearTimeout(safety);
            fallBackToClassic("The 3D world didn't load, showing the classic view.");
        });
} else {
    finishLoading();
}
