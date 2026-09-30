// Skylight: glide through the sky, catch the light, light the lanterns.
// Drawing, input and screens; the rules live in skylight-core.js.
import * as C from './skylight-core.js';
import * as sfx from '../sfx.js';

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
};
const btn = (className, text, label) => {
    const b = el('button', className, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
};

/* ---------------------------------------------------------------- saved progress */

const KEY = 'skylight';
export const loadProgress = () => {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) || '{}');
        return { free: Number(v.free) || 0, daily: v.daily && v.daily.key ? { key: String(v.daily.key), score: Number(v.daily.score) || 0 } : null, aurora: !!v.aurora, played: Number(v.played) || 0, orbs: Number(v.orbs) || 0 };
    } catch { return { free: 0, daily: null, aurora: false, played: 0, orbs: 0 }; }
};
const saveProgress = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ } };

/* ---------------------------------------------------------------- colours */

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// dawn, day, dusk, night
const SKY = [
    { top: hex('#34366b'), bottom: hex('#f7b38a'), sun: 0.66 },
    { top: hex('#3f95f0'), bottom: hex('#bfe6ff'), sun: 0.2 },
    { top: hex('#35275f'), bottom: hex('#ff8a5c'), sun: 0.62 },
    { top: hex('#070a24'), bottom: hex('#22306e'), sun: 0.22 },
];
const CYCLE = 24000;   // world units for a whole day

const skyAt = (x) => {
    const pos = (((x / CYCLE) % 1) + 1) % 1 * 4;
    const i = Math.floor(pos) % 4;
    const f = smooth(pos - Math.floor(pos));
    const a = SKY[i], b = SKY[(i + 1) % 4];
    return {
        top: mix(a.top, b.top, f),
        bottom: mix(a.bottom, b.bottom, f),
        sun: a.sun + (b.sun - a.sun) * f,
        stars: i === 2 ? f : i === 3 ? 1 - f : 0,
        moon: i === 3 ? 1 - f * 0.4 : i === 2 ? f : 0,
    };
};

/* ---------------------------------------------------------------- glow sprites (cheap light) */

const sprites = new Map();
const glow = (color) => {
    if (sprites.has(color)) return sprites.get(color);
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${color},1)`);
    grad.addColorStop(0.25, `rgba(${color},0.55)`);
    grad.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    sprites.set(color, c);
    return c;
};
const WHITE = '255,255,255', GOLD = '255,214,110', CYAN = '110,226,255', PINK = '255,140,190';

/* ---------------------------------------------------------------- the game screen */

export function mountSkylight(container, { quality = 'medium', onBest = () => {}, onMilestone = () => {}, copy = null, label = 'Skylight' } = {}) {
    container.replaceChildren();
    const root = el('div', 'sky');
    root.tabIndex = 0;
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', 'Skylight, a flying game. Hold Space or press the screen to glide, tap to flap your wings.');
    const canvas = el('canvas', 'sky__canvas');
    const ui = el('div', 'sky__ui');
    const pauseBtn = btn('sky__pause', '⏸', 'Pause');
    pauseBtn.hidden = true;
    root.append(canvas, ui, pauseBtn);
    container.append(root);
    const ctx = canvas.getContext('2d');
    const low = quality === 'low';
    const rrect = (x, y, w, h, r) => {
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    };

    const progress = loadProgress();
    const stars = Array.from({ length: low ? 45 : 90 }, (_, i) => ({ x: (i * 0.618034) % 1, y: ((i * 0.381966 * 7) % 1) * 0.7, s: 0.6 + ((i * 13) % 10) / 10 * 1.4, p: i }));
    const clouds = Array.from({ length: low ? 2 : 3 }, (_, layer) => Array.from({ length: 12 }, (_, i) => ({
        x: ((i * 211 + layer * 97) % 1000) / 1000,
        y: ((i * 137 + layer * 53) % 1000) / 1000,
        s: 0.7 + ((i * 7 + layer) % 6) / 6,
    })));

    let view = { w: 640, h: 360, dpr: 1, scale: 1, logicalW: 640, logicalH: 540, offY: 0 };
    let raf = 0;
    let destroyed = false;
    let mode = 'menu';            // menu | playing | paused | over
    let game = null;
    let acc = 0;
    let last = performance.now();
    let hold = false;
    let pressed = false;
    const holders = new Set();
    let shake = 0;
    let flapT = 0;
    let banner = null;
    let hintT = 0;
    let bannerQueue = [];
    let seedName = 'free';
    let overInfo = null;
    const particles = [];
    const trail = [];
    let trailT = 0;
    let idle = 0;

    /* ---------- size ---------- */
    const resize = () => {
        const w = root.clientWidth, h = root.clientHeight;
        if (!w || !h) return;
        const dpr = Math.min(window.devicePixelRatio || 1, low ? 1 : 1.75);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        // the world is always 540 tall and at least 640 wide on screen
        const scale = Math.min(w / 640, h / C.VIEW_H);
        // on tall screens the extra room goes above: the sea of clouds stays at the bottom
        view = { w, h, dpr, scale, logicalW: w / scale, logicalH: h / scale, offY: Math.max(0, h / scale - C.VIEW_H) };
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(root);
    resize();

    /* ---------- screens ---------- */
    const clearUi = () => ui.replaceChildren();
    const card = (...kids) => { const c = el('div', 'sky__card'); c.append(...kids); ui.replaceChildren(c); return c; };

    const showMenu = () => {
        if (game) { idle = game.state.x; game = null; }
        mode = 'menu';
        pauseBtn.hidden = true;
        const today = C.dailyKey();
        const dailyBest = progress.daily && progress.daily.key === today ? progress.daily.score : 0;
        const title = el('h2', 'sky__title', 'Skylight');
        const sub = el('p', 'sky__sub', 'Glide through the sky. Catch the light.');
        const free = btn('btn btn--primary sky__go', 'Free flight');
        const daily = btn('btn sky__go', 'Daily flight');
        free.append(el('small', null, progress.free ? `best ${progress.free.toLocaleString('en')}` : 'endless'));
        daily.append(el('small', null, dailyBest ? `today's best ${dailyBest.toLocaleString('en')}` : `same course for everyone · ${today}`));
        free.addEventListener('click', () => start('free'));
        daily.addEventListener('click', () => start('daily'));
        const how = el('ul', 'sky__how');
        ['Hold Space or the screen to glide', 'Tap to flap your wings (costs light)', 'Catch orbs, ride the updrafts, light the lanterns', 'Avoid the storms and the rocks'].forEach((t) => how.append(el('li', null, t)));
        const tall = view.h > view.w * 1.15;
        card(title, sub, free, daily, how, ...(tall ? [el('p', 'sky__note', 'Turn your phone sideways for a wider view')] : []));
        setTimeout(() => free.focus({ preventScroll: true }), 30);
    };

    const showPaused = () => {
        mode = 'paused';
        const resume = btn('btn btn--primary sky__go', 'Resume');
        const quit = btn('btn sky__go', 'Quit to menu');
        resume.addEventListener('click', resumeGame);
        quit.addEventListener('click', showMenu);
        card(el('h2', 'sky__title sky__title--small', 'Paused'), resume, quit);
        resume.focus({ preventScroll: true });
    };

    const showOver = (result) => {
        mode = 'over';
        pauseBtn.hidden = true;
        const daily = result.mode === 'daily';
        let record = false;
        if (daily) {
            const key = C.dailyKey();
            const before = progress.daily && progress.daily.key === key ? progress.daily.score : 0;
            if (result.score > before) {
                record = true;
                progress.daily = { key, score: result.score };
            }
        } else if (result.score > progress.free) {
            record = true;
            progress.free = result.score;
        }
        progress.played += 1;
        progress.orbs += result.orbs;
        saveProgress(progress);
        onBest({ free: progress.free, daily: progress.daily });
        overInfo = result;
        const rows = el('dl', 'sky__stats');
        [['Score', result.score.toLocaleString('en')], ['Distance', `${result.meters.toLocaleString('en')} m`], ['Light caught', String(result.orbs)], ['Lanterns lit', String(result.lanterns)]].forEach(([k, v]) => {
            const row = el('div');
            row.append(el('dt', null, k), el('dd', null, v));
            rows.append(row);
        });
        const again = btn('btn btn--primary sky__go', 'Fly again');
        const share = btn('btn sky__go', 'Copy result');
        const menu = btn('btn sky__go sky__go--quiet', 'Menu');
        again.addEventListener('click', () => start(result.mode));
        menu.addEventListener('click', showMenu);
        share.addEventListener('click', async () => {
            const text = C.shareText(result);
            let ok = false;
            if (copy) ok = await copy(text);
            else { try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = false; } }
            share.textContent = ok ? 'Copied ✓' : 'Could not copy';
            setTimeout(() => { share.textContent = 'Copy result'; }, 1800);
        });
        card(
            el('h2', 'sky__title sky__title--small', record ? '✦ New best!' : 'The light fades…'),
            el('p', 'sky__sub', daily ? `Daily flight · ${C.dailyKey()}` : 'Free flight'),
            rows, again, share, menu,
        );
        setTimeout(() => again.focus({ preventScroll: true }), 30);
    };

    /* ---------- run ---------- */
    const start = (m) => {
        sfx.unlock();
        seedName = m;
        const seed = m === 'daily' ? C.dailySeed() : (Math.random() * 4294967296) >>> 0;
        game = C.createGame({ seed, mode: m });
        mode = 'playing';
        acc = 0;
        last = performance.now();
        hold = false;
        pressed = false;
        holders.clear();
        particles.length = 0;
        trail.length = 0;
        bannerQueue = [];
        banner = null;
        shake = 0;
        hintT = progress.played < 3 ? 7 : 3;
        clearUi();
        pauseBtn.hidden = false;
        root.focus({ preventScroll: true });
    };
    const pauseGame = () => { if (mode === 'playing') { hold = false; holders.clear(); showPaused(); } };
    const resumeGame = () => {
        if (mode !== 'paused') return;
        mode = 'playing';
        clearUi();
        acc = 0;
        last = performance.now();
        root.focus({ preventScroll: true });
    };
    pauseBtn.addEventListener('click', (e) => { e.stopPropagation(); pauseGame(); });

    /* ---------- input ---------- */
    const press = () => { if (mode !== 'playing') return; pressed = true; hold = true; hintT = Math.min(hintT, 1.2); };
    const release = () => { hold = holders.size > 0 || keyDown.size > 0; };
    const keyDown = new Set();
    const isKey = (e) => e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
    const onKeyDown = (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (isKey(e) && mode === 'playing') {
            e.preventDefault();
            e.stopPropagation();
            if (e.repeat || keyDown.has(e.code)) return;
            keyDown.add(e.code);
            press();
        } else if (e.code === 'KeyP') {
            e.preventDefault();
            if (mode === 'playing') pauseGame(); else if (mode === 'paused') resumeGame();
        }
    };
    const onKeyUp = (e) => { if (isKey(e)) { keyDown.delete(e.code); release(); } };
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', () => { keyDown.clear(); holders.clear(); hold = false; });

    canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        root.focus({ preventScroll: true });
        sfx.unlock();
        holders.add(e.pointerId);
        try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        press();
    });
    const up = (e) => { holders.delete(e.pointerId); release(); };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const onVisibility = () => { if (document.hidden) pauseGame(); };
    document.addEventListener('visibilitychange', onVisibility);

    /* ---------- events from the rules ---------- */
    const sparkle = (x, y, n, color, speed = 90) => {
        const room = (low ? 80 : 170) - particles.length;
        for (let i = 0; i < Math.min(n, room); i++) {
            const a = Math.random() * 6.283, v = speed * (0.3 + Math.random());
            particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.5, max: 1.1, size: 5 + Math.random() * 9, color });
        }
    };
    const say = (text, color = '#fff') => { bannerQueue.push({ text, color }); };
    const handle = (ev) => {
        const g = game.state;
        switch (ev.type) {
            case 'orb': sparkle(ev.x, ev.y, 10, GOLD); sfx.orb(ev.combo); break;
            case 'lantern': sparkle(ev.x, ev.y - 30, 24, GOLD, 140); sfx.lantern(); say('Lantern lit  +100', '#ffd66e'); break;
            case 'life': say('Extra light!', '#ff9cc4'); sfx.star(); break;
            case 'flap': flapT = 0.28; sparkle(g.x, g.y + 8, 5, CYAN, 60); sfx.flap(); break;
            case 'land': sfx.step(0.8); break;
            case 'crash': shake = 1; sparkle(g.x, g.y, 14, PINK, 160); sfx.crash(); say('Ouch!', '#ff8a9c'); break;
            case 'sea': shake = 0.8; sfx.crash(); say('Caught by the light', '#ff9cc4'); break;
            case 'storm': say('Storm! Fly around it', '#c9b8ff'); sfx.stormy(); break;
            case 'noenergy': say('Out of light: glide to catch orbs', '#9fd8ff'); break;
            case 'gameover': showOver(ev.result); break;
            default:
        }
    };

    /* ---------- drawing ---------- */
    const puff = (x, y, s) => {
        ctx.moveTo(x + 34 * s, y);
        ctx.arc(x, y, 34 * s, 0, 6.283);
        ctx.moveTo(x + 30 * s + 28 * s, y - 8 * s);
        ctx.arc(x + 30 * s, y - 8 * s, 28 * s, 0, 6.283);
        ctx.moveTo(x - 30 * s + 26 * s, y - 4 * s);
        ctx.arc(x - 30 * s, y - 4 * s, 26 * s, 0, 6.283);
        ctx.moveTo(x + 8 * s + 24 * s, y - 24 * s);
        ctx.arc(x + 8 * s, y - 24 * s, 24 * s, 0, 6.283);
    };

    const shapes = new Map();
    const shapeOf = (is) => {
        if (shapes.has(is.id)) return shapes.get(is.id);
        let h = 0;
        for (let i = 0; i < is.id.length; i++) h = (Math.imul(h, 31) + is.id.charCodeAt(i)) | 0;
        const rand = C.mulberry32(h >>> 0);
        const depth = 46 + is.w * 0.28 + rand() * 24;
        const pts = [];
        const n = 6;
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            const inset = Math.sin(t * Math.PI);
            pts.push([is.w * (0.04 + 0.92 * t) + (rand() - 0.5) * 8, 10 + depth * Math.pow(inset, 0.9) * (0.75 + rand() * 0.35)]);
        }
        const shape = { pts, depth };
        shapes.set(is.id, shape);
        return shape;
    };

    const render = (dt, t) => {
        const { w, h, dpr, scale, logicalW, logicalH, offY } = view;
        if (!w) return;
        const g = game ? game.state : null;
        // camera: when nothing is running the sky just drifts past
        const camFocus = g ? g.x : idle;
        const camX = camFocus - logicalW * 0.3;
        const sky = skyAt(camFocus);
        ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);

        // sky
        const grad = ctx.createLinearGradient(0, 0, 0, logicalH);
        grad.addColorStop(0, rgb(sky.top));
        grad.addColorStop(1, rgb(sky.bottom));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, logicalW, logicalH);

        // stars, sun / moon
        if (sky.stars > 0.02) {
            ctx.fillStyle = '#fff';
            for (const s of stars) {
                ctx.globalAlpha = sky.stars * (0.5 + 0.5 * Math.sin(t * 2 + s.p * 3));
                ctx.fillRect(s.x * logicalW, s.y * logicalH, s.s, s.s);
            }
            ctx.globalAlpha = 1;
        }
        const sunX = logicalW * 0.74, sunY = logicalH * sky.sun;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = sky.moon > 0.5 ? 0.8 : 0.5;
        const bright = sky.moon > 0.5 ? '235,240,255' : '255,236,180';
        const glowS = glow(bright);
        const sz = sky.moon > 0.5 ? 110 : 150;
        ctx.drawImage(glowS, sunX - sz / 2, sunY - sz / 2, sz, sz);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        // far islands + cloud layers (parallax)
        const span = logicalW + 600;
        ctx.fillStyle = rgb(mix(sky.bottom, [20, 20, 50], 0.55), 0.55);
        for (let i = 0; i < 7; i++) {
            const px = (((i * 331 - camX * 0.18) % (span + 200)) + span + 200) % (span + 200) - 150;
            const py = logicalH * (0.42 + ((i * 37) % 30) / 100);
            ctx.beginPath();
            ctx.ellipse(px, py, 70 + (i % 3) * 22, 9, 0, 0, 6.283);
            ctx.moveTo(px - 60, py);
            ctx.lineTo(px + 60, py);
            ctx.lineTo(px + 8, py + 60 + (i % 3) * 18);
            ctx.lineTo(px - 10, py + 20);
            ctx.closePath();
            ctx.fill();
        }
        const day = 1 - sky.stars * 0.85;
        clouds.forEach((layer, li) => {
            const par = 0.22 + li * 0.2;
            ctx.beginPath();
            for (const c of layer) {
                const px = (((c.x * span - camX * par) % span) + span) % span - 200;
                puff(px, logicalH * (0.08 + c.y * 0.66), c.s * (0.5 + li * 0.22));
            }
            ctx.fillStyle = rgb(mix(sky.bottom, [255, 255, 255], 0.5 * day + 0.1), 0.12 + li * 0.06);
            ctx.fill();
        });

        // the world
        let sx = 0, sy = 0;
        if (shake > 0) { sx = (Math.random() - 0.5) * 9 * shake; sy = (Math.random() - 0.5) * 9 * shake; }
        ctx.save();
        ctx.translate(-camX + sx, offY + sy);
        const nearWorld = g ? game.world.near(camX - 200, camX + logicalW + 200) : (idleWorld.near(camX - 200, camX + logicalW + 200));
        const t0 = camX - 160, t1 = camX + logicalW + 160;
        const lit = g ? g.lit : new Set();
        const taken = g ? g.taken : new Set();
        const nightGlow = sky.stars;

        // updrafts
        for (const wnd of nearWorld.winds) {
            if (wnd.x > t1 || wnd.x + wnd.w < t0) continue;
            const gr = ctx.createLinearGradient(0, wnd.y1, 0, wnd.y0);
            gr.addColorStop(0, 'rgba(255,255,255,0)');
            gr.addColorStop(1, 'rgba(255,255,255,0.18)');
            ctx.fillStyle = gr;
            ctx.fillRect(wnd.x, wnd.y0, wnd.w, wnd.y1 - wnd.y0);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let k = 0; k < 5; k++) {
                const off = (t * 90 + k * 60) % (wnd.y1 - wnd.y0);
                const y = wnd.y1 - off;
                const x = wnd.x + wnd.w * (0.12 + 0.19 * k);
                ctx.moveTo(x, y);
                ctx.quadraticCurveTo(x + 8 * Math.sin(t * 3 + k), y - 22, x, y - 44);
            }
            ctx.stroke();
        }

        // islands and lanterns
        for (const is of nearWorld.islands) {
            if (is.x > t1 || is.x + is.w < t0) continue;
            const { pts } = shapeOf(is);
            ctx.save();
            ctx.translate(is.x, is.y);
            ctx.fillStyle = rgb(mix([98, 84, 120], sky.bottom, 0.16 * (1 - nightGlow)));
            ctx.beginPath();
            ctx.moveTo(0, 2);
            pts.forEach(([px, py]) => ctx.lineTo(px, py));
            ctx.lineTo(is.w, 2);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = rgb(mix([120, 205, 130], [40, 70, 90], nightGlow * 0.6));
            ctx.beginPath();
            rrect(-4, -5, is.w + 8, 14, 7);
            ctx.fill();
            ctx.restore();
            if (is.lantern) {
                const cx = is.x + is.w / 2;
                const on = lit.has(is.id);
                ctx.strokeStyle = '#43384f';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(cx, is.y - 4);
                ctx.lineTo(cx, is.y - 44);
                ctx.stroke();
                ctx.fillStyle = on ? '#ffe08a' : '#8d7f9a';
                ctx.beginPath();
                rrect(cx - 8, is.y - 62, 16, 20, 5);
                ctx.fill();
                if (on) {
                    const f = 0.85 + 0.15 * Math.sin(t * 9 + cx);
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.globalAlpha = f;
                    ctx.drawImage(glow(GOLD), cx - 60, is.y - 112, 120, 120);
                    ctx.globalAlpha = 1;
                    ctx.globalCompositeOperation = 'source-over';
                }
            }
        }

        // orbs
        ctx.globalCompositeOperation = 'lighter';
        const orbGlow = glow(GOLD);
        for (const o of nearWorld.orbs) {
            if (o.x > t1 || o.x < t0 || taken.has(o.id)) continue;
            const pulse = 1 + 0.18 * Math.sin(t * 4 + o.x * 0.05);
            const s = 30 * pulse;
            ctx.drawImage(orbGlow, o.x - s / 2, o.y - s / 2, s, s);
        }
        ctx.globalCompositeOperation = 'source-over';
        // a solid core, so orbs still read against a bright daytime sky
        for (const o of nearWorld.orbs) {
            if (o.x > t1 || o.x < t0 || taken.has(o.id)) continue;
            ctx.fillStyle = '#ffb92e';
            ctx.beginPath();
            ctx.arc(o.x, o.y, 6, 0, 6.283);
            ctx.fill();
            ctx.fillStyle = '#fff3c4';
            ctx.beginPath();
            ctx.arc(o.x - 1, o.y - 1, 3.4, 0, 6.283);
            ctx.fill();
        }

        // rocks
        const tt = g ? g.t : t;
        for (const r of nearWorld.rocks) {
            if (r.x > t1 || r.x < t0) continue;
            const ry = C.rockY(r, tt);
            ctx.save();
            ctx.translate(r.x, ry);
            ctx.rotate(tt * 0.4 + r.ph);
            ctx.fillStyle = '#4b4462';
            ctx.beginPath();
            for (let k = 0; k < 8; k++) {
                const a = (k / 8) * 6.283;
                const rr = r.r * (0.82 + 0.28 * Math.abs(Math.sin(k * 2.3 + r.ph)));
                ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.14)';
            ctx.beginPath();
            ctx.arc(-r.r * 0.25, -r.r * 0.3, r.r * 0.35, 0, 6.283);
            ctx.fill();
            ctx.restore();
        }

        // the spirit
        if (g && mode !== 'over') drawPlayer(g, t, dt);

        // storms (over everything, the spirit dims inside)
        for (const s of nearWorld.storms) {
            if (s.x - s.rx > t1 || s.x + s.rx < t0) continue;
            ctx.fillStyle = 'rgba(38,28,66,0.86)';
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
                const a = (k / 6) * 6.283 + 0.4;
                const cx = s.x + Math.cos(a) * s.rx * 0.55;
                const cy = s.y + Math.sin(a) * s.ry * 0.5 + Math.sin(t * 0.8 + k) * 4;
                ctx.moveTo(cx + s.ry * 0.7, cy);
                ctx.ellipse(cx, cy, s.rx * 0.5, s.ry * 0.7, 0, 0, 6.283);
            }
            ctx.moveTo(s.x + s.rx * 0.5, s.y);
            ctx.ellipse(s.x, s.y, s.rx * 0.5, s.ry * 0.6, 0, 0, 6.283);
            ctx.fill();
            const flash = ((Math.floor(t * 2.5 + s.x) * 2654435761) >>> 0) % 6 === 0 && (t * 2.5) % 1 < 0.25;
            if (flash) {
                ctx.strokeStyle = 'rgba(255,240,180,0.95)';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.moveTo(s.x, s.y + 6);
                ctx.lineTo(s.x - 10, s.y + s.ry * 0.5);
                ctx.lineTo(s.x + 4, s.y + s.ry * 0.55);
                ctx.lineTo(s.x - 6, s.y + s.ry * 1.05);
                ctx.stroke();
            }
        }

        // sea of clouds along the bottom
        const seaTop = C.VIEW_H - 40;
        for (let row = 0; row < (low ? 2 : 3); row++) {
            const par = 0.9 + row * 0.05;
            ctx.beginPath();
            const y = seaTop + row * 16;
            const shift = camX * (1 - par);
            for (let k = Math.floor((t0 - shift) / 70) - 1; k * 70 + shift < t1 + 140; k++) {
                puff(k * 70 + shift, y + Math.sin((k * 70 + t * 20 * (row + 1)) * 0.01) * 5, 1.2 - row * 0.1);
            }
            ctx.fillStyle = rgb(mix(sky.bottom, [255, 255, 255], (0.66 - row * 0.12) * day + 0.06), 0.9);
            ctx.fill();
        }
        ctx.fillStyle = rgb(mix(sky.bottom, [255, 255, 255], 0.3 * day + 0.06));
        ctx.fillRect(t0, seaTop + 38, logicalW + 400, logicalH + 400);

        // sparkles
        ctx.globalCompositeOperation = 'lighter';
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 0.96;
            p.vy = p.vy * 0.96 - 8 * dt;
            ctx.globalAlpha = Math.min(1, p.life / p.max * 1.4);
            ctx.drawImage(glow(p.color), p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();

        if (g && mode !== 'over') drawHud(g, t);
    };

    const drawPlayer = (g, t, dt) => {
        // the cape follows the spirit
        trailT += dt;
        if (trailT > 0.028) {
            trailT = 0;
            trail.unshift({ x: g.x, y: g.y });
            if (trail.length > 14) trail.pop();
        }
        const blink = g.inv > 0 && Math.floor(g.t * 12) % 2 === 0;
        ctx.globalAlpha = blink ? 0.35 : 1;
        if (trail.length > 2) {
            const grad = ctx.createLinearGradient(g.x, g.y, g.x - 150, g.y);
            grad.addColorStop(0, 'rgba(255,120,170,0.95)');
            grad.addColorStop(1, 'rgba(150,110,255,0)');
            ctx.fillStyle = grad;
            const spread = g.gliding ? 8 : 4.5;
            ctx.beginPath();
            ctx.moveTo(trail[0].x, trail[0].y - 6);
            for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x - i * 5.5, trail[i].y - 6 - spread * (i / trail.length));
            for (let i = trail.length - 1; i > 0; i--) ctx.lineTo(trail[i].x - i * 5.5, trail[i].y + 6 + spread * (i / trail.length));
            ctx.lineTo(trail[0].x, trail[0].y + 6);
            ctx.closePath();
            ctx.fill();
        }
        // glow
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow(CYAN), g.x - 38, g.y - 38, 76, 76);
        ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.translate(g.x, g.y);
        ctx.rotate(clamp(g.vy / 700, -0.5, 0.6));
        // wings
        const beat = flapT > 0 ? Math.sin((1 - flapT / 0.28) * Math.PI) : (g.gliding ? 0.15 : 0.35);
        ctx.fillStyle = 'rgba(210,245,255,0.9)';
        for (const dir of [-1, 1]) {
            ctx.save();
            ctx.rotate(dir * (0.3 + beat * 0.9) - 0.3);
            ctx.beginPath();
            ctx.ellipse(-2, dir * -12, 5, 17, dir * 0.5, 0, 6.283);
            ctx.fill();
            ctx.restore();
        }
        // body + head
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 9, 0, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = '#2a2350';
        ctx.beginPath();
        ctx.arc(5, -2, 1.9, 0, 6.283);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
        flapT = Math.max(0, flapT - dt);
        // dust of light behind
        if (Math.random() < (g.gliding ? 0.6 : 0.3)) sparkle(g.x - 10, g.y + 2, 1, Math.random() < 0.5 ? CYAN : PINK, 30);
    };

    const drawHud = (g, t) => {
        // on a phone everything is drawn smaller, so the HUD is blown up to stay readable
        const k = clamp(0.85 / view.scale, 1, 1.7);
        ctx.save();
        ctx.scale(k, k);
        const logicalW = view.logicalW / k, logicalH = view.logicalH / k;
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 6;
        ctx.font = '700 30px "Space Grotesk", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${Math.floor(g.distance).toLocaleString('en')} m`, 18, 12);
        ctx.font = '600 15px "Space Grotesk", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(`${game.score().toLocaleString('en')} points${seedName === 'daily' ? ' · daily' : ''}`, 19, 48);
        if (g.combo > 1) {
            ctx.fillStyle = '#ffd66e';
            ctx.font = '800 20px "Space Grotesk", system-ui, sans-serif';
            ctx.fillText(`×${Math.min(5, g.combo)} light`, 19, 70);
        }
        // lives
        ctx.textAlign = 'right';
        for (let i = 0; i < g.lives; i++) {
            const cx = logicalW - 62 / (view.scale * k) - 12 - i * 24;
            ctx.fillStyle = '#ff8fb8';
            ctx.beginPath();
            ctx.moveTo(cx, 16);
            ctx.lineTo(cx + 8, 26);
            ctx.lineTo(cx, 36);
            ctx.lineTo(cx - 8, 26);
            ctx.closePath();
            ctx.fill();
        }
        // energy
        const bw = Math.min(220, logicalW * 0.34), bx = 18, by = logicalH - 30;
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        rrect(bx, by, bw, 10, 5);
        ctx.fill();
        const e = g.energy / C.MAX_ENERGY;
        ctx.fillStyle = e < 0.2 && Math.floor(t * 5) % 2 ? '#ff6b7f' : '#6ee2ff';
        ctx.beginPath();
        rrect(bx, by, Math.max(10, bw * e), 10, 5);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '700 11px "Space Grotesk", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('LIGHT', bx, by - 15);
        // banners and the first-flight hint
        ctx.textAlign = 'center';
        if (banner) {
            const k = banner.t / 1.7;
            ctx.globalAlpha = Math.min(1, k * 3, (1 - k) * 3 + 0.2);
            ctx.font = '800 26px "Space Grotesk", system-ui, sans-serif';
            ctx.fillStyle = banner.color;
            ctx.shadowBlur = 10;
            ctx.fillText(banner.text, logicalW / 2, logicalH * 0.2 - k * 10);
            ctx.globalAlpha = 1;
        }
        if (hintT > 0) {
            ctx.globalAlpha = Math.min(1, hintT);
            ctx.font = '600 17px "Space Grotesk", system-ui, sans-serif';
            ctx.fillStyle = '#fff';
            ctx.fillText('Hold to glide  ·  tap to flap', logicalW / 2, logicalH - 62);
            ctx.globalAlpha = 1;
        }
        ctx.shadowBlur = 0;
        ctx.restore();
    };

    /* ---------- the loop ---------- */
    const idleWorld = C.createWorld(2024);
    const frame = (now) => {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (!root.clientWidth || document.hidden) {
            if (mode === 'playing') pauseGame();
            return;
        }
        if (root.clientWidth !== view.w || root.clientHeight !== view.h) resize();
        const t = now / 1000;
        if (mode === 'playing' && game) {
            acc += dt;
            let steps = 0;
            while (acc >= C.STEP && steps < 6 && mode === 'playing') {
                const events = game.step(C.STEP, { hold, pressed });
                pressed = false;
                events.forEach(handle);
                acc -= C.STEP;
                steps++;
            }
            if (steps === 6) acc = 0;
            if (game && !game.state.dead && !progress.aurora && game.state.distance >= 2000) {
                progress.aurora = true;
                saveProgress(progress);
                say('Aurora neon unlocked in the room ✦', '#7cffcb');
                onMilestone('aurora');
            }
            shake = Math.max(0, shake - dt * 2.5);
            hintT = Math.max(0, hintT - dt);
            if (bannerQueue.length && !banner) banner = { ...bannerQueue.shift(), t: 1.7 };
            if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
        } else if (mode === 'menu' || mode === 'over') {
            idle += dt * 120;
        }
        render(mode === 'playing' ? dt : Math.min(dt, 0.05), t);
    };
    raf = requestAnimationFrame(frame);

    showMenu();

    const api = {
        root,
        get mode() { return mode; },
        get state() { return game ? game.state : null; },
        get game() { return game; },
        start,
        pause: pauseGame,
        resume: resumeGame,
        progress: () => ({ ...progress }),
        // for tests: feed inputs and see the last result
        get lastResult() { return overInfo; },
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            if (ro) ro.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
            root.remove();
        },
    };
    root.__sky = api;
    return api;
}
