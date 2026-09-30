import { initLive } from './live.js';
import * as sfx from './sfx.js';

// The song: upload an mp3 to the repo as assets/music.mp3 (GitHub → assets →
// Add file → Upload files). Being on this site, the room can also pulse to its beat.
const MUSIC_SRC = 'assets/music.mp3';
const TOTAL_STARS = 10;
const AURORA = '#7cffcb';   // the neon colour Skylight unlocks

const $ = (sel) => document.querySelector(sel);
const html = document.documentElement;
const is3d = () => html.dataset.view === '3d';
const touch = matchMedia('(pointer: coarse)').matches;

const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};

/* ---------- Toast ---------- */
const toastEl = $('#toast');
let toastTimer;
const toast = (message, ms = 2400) => {
    toastEl.textContent = message;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), ms);
};

/* ---------- Panels: in the room they move into windows, the phone and pop-ups ---------- */
const content = $('#content');
const panelOrder = [...content.querySelectorAll(':scope > .panel')].map((p) => p.id);
const hosts = new Map();
const panelEl = (id) => document.getElementById(`panel-${id}`);
const mountPanel = (id, container, onEvict) => {
    const panel = panelEl(id);
    if (!panel) return;
    const prev = hosts.get(id);
    hosts.set(id, { container, onEvict });
    if (prev && prev.container !== container && prev.onEvict) prev.onEvict();
    container.append(panel);
};
const unmountPanel = (id) => {
    const panel = panelEl(id);
    if (!panel) return;
    hosts.delete(id);
    const after = panelOrder.slice(panelOrder.indexOf(panel.id) + 1).map((pid) => document.getElementById(pid)).find((p) => p && p.parentNode === content);
    content.insertBefore(panel, after || null);
};

/* ---------- Star hunt ---------- */
let starsFound = store.get('stars', []).filter((n) => Number.isInteger(n) && n >= 0 && n < TOTAL_STARS);
const renderStars = () => {
    const n = starsFound.length;
    $('#stars-count').textContent = String(n);
    $('#stars-bar').style.setProperty('--p', String(n / TOTAL_STARS));
    $('#stars-text').textContent = n >= TOTAL_STARS
        ? 'All 10 stars found. Legend.'
        : n === 0 ? '10 stars are hidden around the room. Find them all.' : `${n} of 10 stars found. ${TOTAL_STARS - n} to go.`;
    $('#trophy').hidden = n < TOTAL_STARS;
    $('#stars-hud').classList.toggle('is-complete', n >= TOTAL_STARS);
    $('#menu-stars').textContent = `Stars ${n}/10`;
};
renderStars();

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
for (let i = 0; i < 24; i++) viz.append(document.createElement('i'));
const vizBars = [...viz.children];

let musicState = 'idle';
const MUSIC_TEXT = {
    idle: 'Tap play, or press M anywhere',
    loading: 'Loading…',
    playing: 'Now playing',
    paused: 'Paused',
    error: "Couldn't load the music. Tap to retry.",
    missing: 'No song yet: add assets/music.mp3 to the site',
};
const musicListeners = [];
const setMusic = (next) => {
    musicState = next;
    musicPanel.dataset.music = next;
    const on = next === 'playing' || next === 'loading';
    musicBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-pressed', String(on));
    playBtn.setAttribute('aria-label', on ? 'Pause music' : 'Play music');
    musicBtn.setAttribute('aria-label', on ? 'Pause music (M)' : 'Play music (M)');
    musicStatus.textContent = MUSIC_TEXT[next];
    if (next === 'missing') toast('🎵 No song yet: add assets/music.mp3 to the site', 4000);
    musicListeners.forEach((fn) => fn(next));
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
    sfx.unlock();
    if (musicState === 'playing' || musicState === 'loading') {
        audio.pause();
        setMusic('paused');
        return;
    }
    if (!audio.src || musicState === 'error' || musicState === 'missing') audio.src = MUSIC_SRC;
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
audio.addEventListener('error', async () => {
    if (musicState === 'idle') return;
    // tell "there is no song yet" apart from a real loading problem
    let missing = false;
    try { missing = (await fetch(MUSIC_SRC, { method: 'HEAD', cache: 'no-store' })).status === 404; } catch { /* offline */ }
    setMusic(missing ? 'missing' : 'error');
});
musicBtn.addEventListener('click', toggleMusic);
playBtn.addEventListener('click', toggleMusic);

// A 0..1 "loudness" that drives the visualiser, the boombox and the lights.
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
let vizResting = false;
const drawViz = () => {
    const lv = readLevel();
    const playing = musicState === 'playing';
    // In the room the panel is only on screen while it sits in a window or pop-up.
    const shown = !document.hidden && (!is3d() || musicPanel.parentNode !== content);
    if (shown && (playing || !vizResting)) {
        const t = performance.now() / 1000;
        vizBars.forEach((bar, i) => {
            let v = 0.08;
            if (playing && analyser) v = freq[i + 2] / 255;
            else if (playing) v = lv * (0.5 + 0.5 * Math.abs(Math.sin(t * 3 + i * 0.7)));
            bar.style.setProperty('--v', Math.max(0.05, Math.min(1, v)).toFixed(3));
        });
        vizResting = !playing;
    }
    if (playing) vizResting = false;
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
const share = async () => {
    const url = location.origin + location.pathname;
    if (navigator.share) {
        try { await navigator.share({ title: document.title, text: "Come see Gabytzu's room in 3D", url }); } catch { /* closed */ }
        return;
    }
    toast(await copyText(url) ? 'Link copied 🔗' : "Couldn't copy the link");
};
$('#share').addEventListener('click', share);

/* ---------- View switch ---------- */
const viewBtn = $('#view-btn');
const syncViewBtn = () => {
    viewBtn.textContent = is3d() ? '2D' : '3D';
    viewBtn.setAttribute('aria-label', is3d() ? 'Switch to the classic page' : 'Switch to the 3D room');
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

/* ---------- Live data ---------- */
let repos = [];
let screens = null;       // GabyOS, the dashboard and the TV (room only)
let room = null;
let phoneNote = '';
// The latest of each, so the room's screens can catch up when they are built.
const latest = { presence: null, github: null, youtube: null, server: null };
const setPhoneNote = (text) => { phoneNote = text; if (room) room.setPhoneNote(text); };
const show = {
    presence(p) {
        screens.dash.setPresence(p);
        screens.os.setStatus(p.status === 'offline' ? 'Offline' : 'Online', p.status);
        setPhoneNote(p.playing ? `Playing ${p.playing}` : `Gabytzu is ${p.status}`);
    },
    github(data) { screens.dash.setEvents(data.events); },
    youtube({ channel, videos }) {
        screens.tv.setChannel(channel);
        if (room && channel) room.setChannel(channel.title);
        screens.tv.setVideos(videos);
        screens.dash.setVideo(videos[0]);
    },
    server({ name, online, members }) {
        screens.dash.setServer({ name, online, members });
        if (!latest.presence && online) {
            screens.os.setStatus(`${online} online`, 'online');
            setPhoneNote(`${online} online in ${name || 'the server'}`);
        }
    },
};
const receive = (kind) => (data) => {
    latest[kind] = data;
    if (kind === 'github') repos = data.repos;
    if (screens) show[kind](data);
};
initLive({ onPresence: receive('presence'), onGithub: receive('github'), onYoutube: receive('youtube'), onServer: receive('server') });

/* ======================================================================= the room */
const start = $('#start');
const startGo = $('#start-go');
const startBar = $('#start-bar');
const startStatus = $('#start-status');
const menu = $('#menu');
const modal = $('#modal');
const modalBody = $('#modal-body');
const prompt = $('#prompt');
const promptText = $('#prompt-text');
const promptKey = prompt.querySelector('.prompt__key');
const usebar = $('#usebar');
const usebarText = $('#usebar-text');
const walkHint = $('#walk-hint');
const joystick = $('#joystick');
const flatBox = $('#flat');
// Phones and small windows use the PC and the TV full screen instead of on the 3D screen.
const wantFlat = () => touch || window.innerWidth < 900 || window.innerHeight < 520;

let menuOpenedAt = 0;
let everLocked = false;
let hintTimer;
const showHint = (text, ms = 0) => {
    clearTimeout(hintTimer);
    walkHint.textContent = text;
    walkHint.hidden = !text;
    if (ms) hintTimer = setTimeout(() => { walkHint.hidden = true; }, ms);
};

// Draw less when the room is covered: nothing behind a full-screen PC/TV,
// a third of the frames behind the docked screen, a quarter behind menus.
const syncRenderRate = () => {
    if (!room) return;
    let every = 1;
    if (presented) every = presented.where === 'flat' ? 0 : 3;
    else if (!menu.hidden || !modal.hidden) every = 4;
    room.setRenderRate(every);
};

// Keep the HUD bits (crosshair, prompt, hints) in step with what the player is doing.
const syncWalkUi = () => {
    if (!room) return;
    syncRenderRate();
    const walking = (room.mode === 'walk' || room.mode === 'armchair') && menu.hidden && modal.hidden;
    const locked = room.isLocked();
    html.classList.toggle('is-walking', walking && (locked || touch));
    html.classList.toggle('is-dragmode', walking && !touch && room.dragMode);
    joystick.hidden = !(walking && touch && room.mode === 'walk');
    if (!walking) { prompt.hidden = true; showHint(''); return; }
    if (!touch && !room.dragMode && !locked) showHint('Click to look around · Esc for the menu');
    else if (walkHint.textContent.startsWith('Click')) showHint('');
    promptKey.textContent = locked ? 'E' : 'Click';
    const target = room.target;
    if (target) promptText.textContent = target.label;
    prompt.hidden = !target || !(locked || touch || room.dragMode);
};

const openMenu = () => {
    if (!room || !menu.hidden || !start.classList.contains('is-gone')) return;
    closeModal({ quiet: true });
    menu.hidden = false;
    menuOpenedAt = performance.now();
    room.pause(true);
    room.unlock();
    syncWalkUi();
    $('#menu-resume').focus({ preventScroll: true });
};
const closeMenu = ({ relock = true } = {}) => {
    if (menu.hidden) return;
    menu.hidden = true;
    room.pause(false);
    if (relock && !touch && !room.dragMode) room.lock();
    syncWalkUi();
};

let modalPanel = null;
const openModal = (panelId, kind = 'card') => {
    closeModal({ quiet: true });
    modal.dataset.kind = kind;
    modalPanel = panelId;
    mountPanel(panelId, modalBody, () => { if (modalPanel === panelId) closeModal({ quiet: true, keep: true }); });
    modal.hidden = false;
    if (kind === 'phone') $('#phone-time').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (room) { room.pause(true); room.unlock(); }
    modalBody.scrollTop = 0;
    $('#modal-close').focus({ preventScroll: true });
    syncWalkUi();
};
function closeModal({ quiet = false, keep = false, relock = false } = {}) {
    if (modal.hidden) return;
    modal.hidden = true;
    if (modalPanel && !keep) unmountPanel(modalPanel);
    modalPanel = null;
    if (room) {
        room.pause(false);
        syncRenderRate();
        if (relock && !touch && !room.dragMode) room.lock();
    }
    if (!quiet) syncWalkUi();
}
$('#modal-close').addEventListener('click', () => closeModal({ relock: true }));
$('.phone-dock').addEventListener('click', (e) => {
    const app = e.target.closest('[data-phone]');
    if (!app) return;
    if (app.dataset.phone === 'music') { toggleMusic(); return; }
    closeModal({ quiet: true });
    act(app.dataset.phone);
    syncWalkUi();
});
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal({ relock: true }); });

// While sitting at the PC or the TV, its page leaves the 3D screen: on phones it
// fills the display, elsewhere it is laid flat exactly over the 3D screen (sharp
// text, and clicks work the same in every browser).
const dockBox = $('#dock-screen');
let presented = null;
const screenApi = (key) => (key === 'pc' ? screens.os : screens.tv);
const layoutDock = () => {
    if (!presented || presented.where !== 'dock') return;
    const r = room.screenRect(presented.key);
    const [pw, ph] = r.px;
    Object.assign(dockBox.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${pw}px`,
        height: `${ph}px`,
        transform: `scale(${r.width / pw}, ${r.height / ph})`,
    });
};
const present = (key) => {
    const flat = wantFlat();
    const box = flat ? flatBox : dockBox;
    box.replaceChildren(screenApi(key).root);
    presented = { key, where: flat ? 'flat' : 'dock' };
    if (flat) {
        html.classList.toggle('flat-os', key === 'pc');
        screenApi(key).setFlat(true);
    } else {
        layoutDock();
    }
    box.hidden = false;
    syncRenderRate();
};
const unpresent = () => {
    if (!presented) return;
    const { key, where } = presented;
    presented = null;
    // an iframe restarts when it moves, so a playing video stops with you
    if (key === 'tv') screens.tv.stop();
    if (where === 'flat') {
        screenApi(key).setFlat(false);
        flatBox.hidden = true;
        html.classList.remove('flat-os');
    } else {
        dockBox.hidden = true;
    }
    room.screen(key).append(screenApi(key).root);
    syncRenderRate();
};
window.addEventListener('resize', () => {
    if (!presented) return;
    const { key, where } = presented;
    if ((where === 'flat') !== wantFlat()) { unpresent(); present(key); } else requestAnimationFrame(layoutDock);
});

const standUp = (gesture) => {
    if (!room || !['pc', 'tv', 'armchair'].includes(room.mode)) return;
    screens.os.pauseApps();
    unpresent();
    room.standUp();
    if (gesture && !touch && !room.dragMode) room.lock();
};
$('#usebar-exit').addEventListener('click', () => standUp(true));

const takePhoto = () => {
    const flash = $('#flash');
    flash.classList.remove('is-on');
    void flash.offsetWidth;
    flash.classList.add('is-on');
    try {
        const url = room.snapshot();
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gabytzu-room.jpg';
        document.body.append(a);
        a.click();
        a.remove();
        toast('📸 Photo saved');
    } catch {
        toast('📸 Say cheese!');
    }
};

const FUN = {
    plant: '🌿 The plant says hi',
    bottle: '💧 Stay hydrated!',
    car: '🏎️ Vroom vroom',
    pouf: 'So soft ☁️',
    neon: '✨ New neon colour',
    trophy: '🏆 Star Collector: all 10 stars found!',
};
const onInteract = (id) => {
    switch (id) {
        case 'phone': openModal('discord', 'phone'); break;
        case 'boombox': {
            const wasOn = musicState === 'playing' || musicState === 'loading';
            toggleMusic();
            toast(wasOn ? '⏸ Music paused' : '🎵 Music on');
            break;
        }
        case 'door': openModal('about'); toast('🚪 Knock knock! Come find me online'); break;
        case 'poster-nexustv': openModal('nexustv'); break;
        case 'poster-steam': openModal('steam'); break;
        case 'camera': takePhoto(); break;
        case 'window': toast(room.isNight() ? '🌙 Night falls' : '☀️ Good morning'); break;
        default: if (FUN[id]) toast(FUN[id]);
    }
};

const act = (name) => {
    if (!room) return;
    switch (name) {
        case 'pc': case 'tv':
            if (room.mode === 'pc' || room.mode === 'tv') { if (room.mode !== name) { unpresent(); room.standUp().then(() => room.use(name)); } return; }
            room.use(name);
            break;
        case 'phone': openModal('discord', 'phone'); break;
        case 'about': openModal('about'); break;
        case 'boombox': room.use('boombox'); break;
        case 'switch': case 'window': room.use(name); break;
        case 'stars': toast(starsFound.length >= TOTAL_STARS ? '🏆 All 10 stars found!' : `★ ${starsFound.length}/10. Look on shelves, under things and up high`, 3200); break;
        default:
    }
};

menu.addEventListener('click', (e) => {
    const go = e.target.closest('[data-act]');
    if (!go) return;
    const name = go.dataset.act;
    // seats and pop-ups keep the mouse free; quick toggles go straight back to walking
    closeMenu({ relock: ['boombox', 'switch', 'window', 'stars'].includes(name) });
    act(name);
});
$('#menu-resume').addEventListener('click', () => closeMenu());
$('#menu-classic').addEventListener('click', () => switchView('classic'));
$('#menu-share').addEventListener('click', share);
$('#menu-btn').addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu({ relock: false })));
$('#home-btn').addEventListener('click', () => { if (is3d() && room) openModal('about'); else panelEl('about').scrollIntoView({ behavior: 'smooth' }); });
prompt.addEventListener('click', () => { if (room) room.useTarget(); });
// Clicking the room grabs the mouse again (browsers only allow that on a click).
$('#scene').addEventListener('click', () => {
    if (!room || touch || room.dragMode || room.isLocked() || !start.classList.contains('is-gone')) return;
    if ((room.mode === 'walk' || room.mode === 'armchair') && menu.hidden && modal.hidden) room.lock();
});
// Focus moving inside a 3D screen must never scroll it out of line with the room.
['#css3d', '#os', '#dash', '#tvui'].forEach((sel) => {
    const node = $(sel);
    node.addEventListener('scroll', () => { if (node.scrollTop || node.scrollLeft) { node.scrollTop = 0; node.scrollLeft = 0; } });
});

/* settings */
const qualitySel = $('#set-quality');
const sensInput = $('#set-sens');
const sfxInput = $('#set-sfx');
const dragInput = $('#set-drag');
const savedQuality = store.get('quality', 'auto');
qualitySel.value = savedQuality;
sensInput.value = String(store.get('sens', 1));
sfxInput.checked = sfx.isEnabled();
dragInput.checked = store.get('drag', false);
qualitySel.addEventListener('change', () => {
    store.set('quality', qualitySel.value);
    sessionStorage.setItem('toast', 'Graphics updated');
    location.reload();
});
sensInput.addEventListener('input', () => { store.set('sens', Number(sensInput.value)); if (room) room.setSensitivity(Number(sensInput.value)); });
sfxInput.addEventListener('change', () => sfx.setEnabled(sfxInput.checked));
dragInput.addEventListener('change', () => {
    store.set('drag', dragInput.checked);
    if (room) room.dragMode = dragInput.checked;
});

/* keyboard */
document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = (e.key || '').toLowerCase();
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    if (key === 'escape') {
        if (!modal.hidden) { e.preventDefault(); closeModal(); return; }
        if (room && (room.mode === 'pc' || room.mode === 'tv')) { e.preventDefault(); standUp(false); return; }
        if (!menu.hidden) { if (performance.now() - menuOpenedAt > 450) closeMenu({ relock: false }); return; }
        if (room && start.classList.contains('is-gone') && (room.mode === 'walk' || room.mode === 'armchair') && !room.isLocked()) openMenu();
        return;
    }
    if (typing || e.repeat) return;
    if (key === 'm') { toggleMusic(); return; }
    if (!room || !start.classList.contains('is-gone') || !menu.hidden || !modal.hidden) return;
    if (room.mode !== 'walk' && room.mode !== 'armchair') return;
    if (key === 'e' || key === 'f') {
        if (room.target) room.useTarget();
        else if (room.mode === 'armchair') standUp(true);
        return;
    }
    const quick = { 1: 'pc', 2: 'tv', 3: 'phone', 4: 'boombox', 5: 'switch', 6: 'window' }[key];
    if (quick) act(quick);
});

/* ---------- Start the room ---------- */
const fallBackToClassic = (message) => {
    html.dataset.view = 'classic';
    [...hosts.keys()].forEach(unmountPanel);
    closeModal({ quiet: true });
    menu.hidden = true;
    usebar.hidden = true;
    prompt.hidden = true;
    joystick.hidden = true;
    walkHint.hidden = true;
    flatBox.hidden = true;
    dockBox.hidden = true;
    html.classList.remove('is-walking', 'has-target', 'is-dragmode', 'flat-os');
    syncViewBtn();
    if (message) toast(message, 4000);
};

// "Auto" graphics: phones, built-in (integrated) and software graphics get Low,
// everything else Medium. High only when picked in the menu.
const gpuName = () => {
    try {
        const gl = document.createElement('canvas').getContext('webgl');
        const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
        const name = gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : '';
        const lose = gl && gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        return name;
    } catch { return ''; }
};
const pickQuality = () => {
    const q = store.get('quality', 'auto');
    if (q === 'low' || q === 'medium' || q === 'high') return q;
    if (touch) return 'low';
    const gpu = gpuName();
    const weak = /swiftshader|llvmpipe|software|basic render|intel|mali|adreno|powervr|radeon\(tm\) graphics|vega \d+ graphics|radeon graphics/i;
    return weak.test(gpu) ? 'low' : 'medium';
};

const bootRoom = async () => {
    const [{ createRoom }, { createOS, createDash, createTV }] = await Promise.all([import('./room/index.js'), import('./os.js')]);
    screens = {
        os: createOS($('#os'), {
            mount: mountPanel,
            unmount: unmountPanel,
            actions: {
                standUp: () => standUp(true),
                lights: (on) => { if (room.lightsOn() !== on) room.use('switch'); },
                night: (on) => { if (room.isNight() !== on) room.use('window'); },
                neon: () => room.cycleNeon(),
                music: toggleMusic,
                tv: () => act('tv'),
                disco: () => room.disco(),
            },
            info: { repos: () => repos, stars: () => starsFound.length },
            game: {
                quality: () => room ? room.quality : pickQuality(),
                onBest: (best) => screens.dash.setGame(best),
                onMilestone: (name) => { if (name === 'aurora') room.unlockNeon(AURORA, { show: true }); },
                copy: async (text) => { const ok = await copyText(text); toast(ok ? 'Result copied 📋' : "Couldn't copy the result"); return ok; },
            },
        }),
        dash: createDash($('#dash')),
        tv: createTV($('#tvui')),
    };
    musicListeners.push((state) => {
        screens.os.setMusic(state === 'playing');
        screens.dash.setMusic(state);
    });
    screens.dash.setMusic(musicState);
    try { screens.dash.setGame(JSON.parse(localStorage.getItem('skylight') || '{}')); } catch { /* no scores yet */ }
    Object.entries(latest).forEach(([kind, data]) => { if (data) show[kind](data); });

    const hour = new Date().getHours();
    room = await createRoom({
        canvas: $('#scene'),
        cssLayer: $('#css3d'),
        screens: { pc: $('#os'), side: $('#dash'), tv: $('#tvui') },
        joystick,
        touch,
        quality: pickQuality(),
        night: hour < 7 || hour >= 20,
        collected: starsFound,
        onProgress: (p) => {
            startBar.style.setProperty('--p', p.toFixed(3));
            startStatus.textContent = `Loading the room… ${Math.round(p * 100)}%`;
        },
        onTarget: (t) => {
            html.classList.toggle('has-target', !!t);
            if (t) promptText.textContent = t.label;
            prompt.hidden = !t || !html.classList.contains('is-walking') && !html.classList.contains('is-dragmode');
        },
        onInteract,
        onMode: (mode, next) => {
            usebar.hidden = true;
            if (mode === 'pc' || mode === 'tv') {
                usebarText.textContent = mode === 'pc' ? 'Using the PC' : 'Watching TV';
                usebar.hidden = false;
                present(mode);
                if (mode === 'pc') {
                    screens.os.wake();
                    screens.os.root.focus({ preventScroll: true });
                }
            } else if (mode === 'armchair') {
                usebarText.textContent = 'Sitting in the armchair';
                usebar.hidden = false;
            }
            if (mode === 'flying' && next === 'pc' && !wantFlat()) showHint('');
            syncWalkUi();
        },
        onLock: (locked, info = {}) => {
            if (locked) {
                everLocked = true;
                if (!menu.hidden) closeMenu({ relock: false });
            } else if (info.error) {
                // Refused right after Esc is normal; refused from the start means
                // this browser (or an embed) doesn't allow it, so drag instead.
                if (!everLocked) {
                    room.dragMode = true;
                    toast('Drag with the mouse to look around', 3000);
                }
            } else if (!info.expected && modal.hidden && (room.mode === 'walk' || room.mode === 'armchair')) {
                openMenu();
            }
            syncWalkUi();
        },
        onStar: (index) => {
            if (!starsFound.includes(index)) starsFound.push(index);
            store.set('stars', starsFound);
            renderStars();
            if (starsFound.length >= TOTAL_STARS) {
                toast('🏆 All 10 stars! A trophy appeared on the shelf. GG!', 4500);
                room.setGolden(true);
                sfx.fanfare();
            } else {
                toast(`★ Star ${starsFound.length}/10 found!`);
            }
        },
        onSlow: () => {
            if (room.quality !== 'low') toast('Still lagging? Esc → Graphics → Low (fast)', 6000);
        },
        isMusicOn: () => musicState === 'playing' || musicState === 'loading',
        getLevel: () => level,
    });
    room.setSensitivity(Number(sensInput.value));
    room.dragMode = dragInput.checked;
    if (phoneNote) room.setPhoneNote(phoneNote);
    try { if (JSON.parse(localStorage.getItem('skylight') || '{}').aurora) room.unlockNeon(AURORA); } catch { /* no scores yet */ }
    if (latest.youtube && latest.youtube.channel) room.setChannel(latest.youtube.channel.title);
    window.__room = room;

    $('#scene').addEventListener('room:lost', () => fallBackToClassic('The 3D room stopped (graphics reset), here is the classic page.'));
    startGo.disabled = false;
    startStatus.textContent = touch ? 'Ready! Tap to enter.' : 'Ready! Click to enter.';
    start.classList.add('is-loaded');
    startGo.focus({ preventScroll: true });
};

if (is3d()) {
    startGo.addEventListener('click', () => {
        if (!room) return;
        sfx.unlock();
        start.classList.add('is-gone');
        room.enter().then(() => {
            syncWalkUi();
            if (touch) showHint('Drag to look · use the stick to walk · tap things to use them', 6500);
        });
        if (!touch && !room.dragMode) room.lock();
    });
    bootRoom().catch((err) => {
        console.error('3D room failed:', err);
        fallBackToClassic("The 3D room didn't load, here is the classic page.");
    });
}
