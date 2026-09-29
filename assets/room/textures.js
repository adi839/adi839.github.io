// Textures drawn in the browser: plaster, rug, keyboard, posters, neon sign, contact shadows.
import * as THREE from 'three';

// Safari < 16 has no roundRect on canvas.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
        const rr = Math.min(Number(r) || 0, w / 2, h / 2);
        this.moveTo(x + rr, y);
        this.arcTo(x + w, y, x + w, y + h, rr);
        this.arcTo(x + w, y + h, x, y + h, rr);
        this.arcTo(x, y + h, x, y, rr);
        this.arcTo(x, y, x + w, y, rr);
        this.closePath();
    };
}

const canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
};

const toTexture = (c, { srgb = true, repeat = null, anisotropy = 8 } = {}) => {
    const tex = new THREE.CanvasTexture(c);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    if (repeat) {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(repeat[0], repeat[1]);
    }
    return tex;
};

// Seeded value noise, summed over octaves. Tileable because the lattice wraps.
const makeNoise = (seed = 1, period = 16) => {
    const rand = (() => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
    const size = period;
    const grid = new Float32Array(size * size).map(() => rand());
    const smooth = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const fx = smooth(x - x0), fy = smooth(y - y0);
        const g = (i, j) => grid[((j % size) + size) % size * size + (((i % size) + size) % size)];
        const a = g(x0, y0), b = g(x0 + 1, y0), c = g(x0, y0 + 1), d = g(x0 + 1, y0 + 1);
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
};

const fbm = (noise, x, y, octaves = 5) => {
    let sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
        sum += noise(x * freq, y * freq) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2;
    }
    return sum / norm;
};

/** Painted plaster: soft mottling for the colour map and a matching bump map. */
export function plaster(hex = '#c9c3ba', { size = 512, repeat = [4, 2], seed = 7 } = {}) {
    const color = new THREE.Color(hex);
    const noise = makeNoise(seed, 16);
    const fine = makeNoise(seed + 3, 64);
    const cMap = canvas(size, size);
    const cBump = canvas(size, size);
    const a = cMap.getContext('2d').createImageData(size, size);
    const b = cBump.getContext('2d').createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const u = (x / size) * 16, v = (y / size) * 16;
            const broad = fbm(noise, u, v, 4);
            const grain = fine((x / size) * 64, (y / size) * 64);
            const shade = 0.93 + broad * 0.1 + (grain - 0.5) * 0.03;
            const i = (y * size + x) * 4;
            a.data[i] = Math.min(255, color.r * 255 * shade);
            a.data[i + 1] = Math.min(255, color.g * 255 * shade);
            a.data[i + 2] = Math.min(255, color.b * 255 * shade);
            a.data[i + 3] = 255;
            const h = 128 + (broad - 0.5) * 60 + (grain - 0.5) * 70;
            b.data[i] = b.data[i + 1] = b.data[i + 2] = h;
            b.data[i + 3] = 255;
        }
    }
    cMap.getContext('2d').putImageData(a, 0, 0);
    cBump.getContext('2d').putImageData(b, 0, 0);
    return { map: toTexture(cMap, { repeat }), bump: toTexture(cBump, { srgb: false, repeat }) };
}

/** A modern wool rug: geometric pattern, border, fibre noise. */
export function rug({ w = 1024, h = 768 } = {}) {
    const c = canvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = '#1f2433';
    g.fillRect(0, 0, w, h);
    // border bands
    const band = (inset, width, color) => { g.strokeStyle = color; g.lineWidth = width; g.strokeRect(inset, inset, w - inset * 2, h - inset * 2); };
    band(34, 18, '#d8cbb3');
    band(64, 6, '#c2562f');
    // diamonds
    g.save();
    g.beginPath();
    g.rect(84, 84, w - 168, h - 168);
    g.clip();
    const step = 96;
    for (let y = 60; y < h; y += step) {
        for (let x = 60 + ((y / step) % 2) * (step / 2); x < w; x += step) {
            g.fillStyle = (Math.floor(x / step) + Math.floor(y / step)) % 3 === 0 ? '#c2562f' : '#2f3a52';
            g.beginPath();
            g.moveTo(x, y - 30); g.lineTo(x + 30, y); g.lineTo(x, y + 30); g.lineTo(x - 30, y);
            g.closePath();
            g.fill();
            g.strokeStyle = '#d8cbb3';
            g.lineWidth = 3;
            g.stroke();
        }
    }
    g.restore();
    // wool fibre noise
    const img = g.getImageData(0, 0, w, h);
    const noise = makeNoise(11, 64);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const n = 0.86 + noise(x / 4, y / 4) * 0.2 + (Math.random() - 0.5) * 0.08;
            img.data[i] *= n; img.data[i + 1] *= n; img.data[i + 2] *= n;
        }
    }
    g.putImageData(img, 0, 0);
    return toTexture(c);
}

/** Mechanical keyboard top: key caps (colour) and RGB under-glow (emissive). */
export function keyboard({ w = 1024, h = 320 } = {}) {
    const c = canvas(w, h);
    const e = canvas(w, h);
    const g = c.getContext('2d');
    const ge = e.getContext('2d');
    g.fillStyle = '#16171b';
    g.fillRect(0, 0, w, h);
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, w, h);
    const rows = [
        ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
        ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Back'],
        ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
        ['Caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
        ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
        ['Ctrl', 'Win', 'Alt', ' ', 'Alt', 'Fn', 'Ctrl'],
    ];
    const wide = { Back: 2, Tab: 1.5, '\\': 1.5, Caps: 1.8, Enter: 2.2, Shift: 2.4, ' ': 6.5, Ctrl: 1.4, Win: 1.2, Alt: 1.2, Fn: 1.2 };
    const unit = 64, pad = 5, top = 14;
    rows.forEach((row, r) => {
        const total = row.reduce((s, k) => s + (wide[k] || 1), 0);
        const scale = (w - 28) / (total * unit);
        let x = 14;
        const y = top + r * 50;
        row.forEach((k, i) => {
            const kw = (wide[k] || 1) * unit * scale;
            const hue = (x / w) * 300 + r * 12;
            ge.fillStyle = `hsl(${hue}, 100%, 55%)`;
            ge.fillRect(x + pad - 3, y + pad - 3, kw - pad * 2 + 6, 44 - pad * 2 + 6);
            g.fillStyle = r === 0 && i === 0 ? '#7c3aed' : '#24262d';
            g.beginPath();
            g.roundRect(x + pad, y + pad, kw - pad * 2, 44 - pad * 2, 6);
            g.fill();
            g.fillStyle = 'rgba(255,255,255,0.08)';
            g.fillRect(x + pad + 2, y + pad + 2, kw - pad * 2 - 4, 4);
            g.fillStyle = '#e8e8ef';
            g.font = `600 ${k.length > 2 ? 12 : 16}px system-ui, sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'middle';
            g.fillText(k, x + kw / 2, y + 22);
            ge.fillStyle = `hsl(${hue}, 100%, 70%)`;
            ge.font = g.font;
            ge.textAlign = 'center';
            ge.textBaseline = 'middle';
            ge.fillText(k, x + kw / 2, y + 22);
            x += kw;
        });
    });
    return { map: toTexture(c), emissive: toTexture(e) };
}

/** Framed poster art. */
export function poster(kind) {
    const w = 768, h = 1024;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const title = (text, y, size, color = '#fff') => {
        g.fillStyle = color;
        g.font = `800 ${size}px Unbounded, "Arial Black", sans-serif`;
        g.textAlign = 'center';
        g.fillText(text, w / 2, y);
    };
    const line = (text, y, size = 34, color = 'rgba(255,255,255,0.8)', weight = 600) => {
        g.fillStyle = color;
        g.font = `${weight} ${size}px "Space Grotesk", system-ui, sans-serif`;
        g.textAlign = 'center';
        g.fillText(text, w / 2, y);
    };
    if (kind === 'nexustv') {
        const grad = g.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#1b0b3a');
        grad.addColorStop(0.55, '#4c1d95');
        grad.addColorStop(1, '#0e7490');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        for (let i = 0; i < 26; i++) {
            g.strokeStyle = `rgba(34, 211, 238, ${0.05 + (i % 5) * 0.02})`;
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(0, 620 + i * 16);
            g.lineTo(w, 520 + i * 22);
            g.stroke();
        }
        // TV icon
        g.strokeStyle = '#fff';
        g.lineWidth = 16;
        g.lineJoin = 'round';
        g.strokeRect(234, 250, 300, 210);
        g.beginPath(); g.moveTo(314, 180); g.lineTo(384, 245); g.lineTo(454, 180); g.stroke();
        g.fillStyle = '#f472b6';
        g.beginPath(); g.moveTo(354, 305); g.lineTo(354, 405); g.lineTo(434, 355); g.closePath(); g.fill();
        title('NEXUSTV', 600, 92);
        line('WATCH · STREAM · CHILL', 660, 30, '#a5f3fc', 700);
        g.fillStyle = '#f472b6';
        g.beginPath(); g.roundRect(284, 730, 200, 58, 29); g.fill();
        line('NEW', 771, 30, '#fff', 800);
        line('nexustv.lol', 930, 40, 'rgba(255,255,255,0.9)', 700);
    } else if (kind === 'steam') {
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0b1a2e');
        grad.addColorStop(1, '#16334f');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(56, 189, 248, 0.12)';
        for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(384, 330, 120 + i * 60, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = '#38bdf8';
        g.beginPath(); g.arc(384, 330, 110, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#0b1a2e';
        g.font = '800 110px Unbounded, sans-serif';
        g.textAlign = 'center';
        g.fillText('⇄', 384, 370);
        title('STEAM', 560, 84);
        title('SWITCHER', 650, 64, '#7dd3fc');
        line('One click. Every account.', 730, 32);
        line('Ban status · Top games · Groups', 780, 26, 'rgba(255,255,255,0.6)');
        line('Python · CustomTkinter', 920, 30, '#7dd3fc', 700);
    } else if (kind === 'honcho') {
        g.fillStyle = '#111';
        g.fillRect(0, 0, w, h);
        const grad = g.createRadialGradient(384, 420, 20, 384, 420, 520);
        grad.addColorStop(0, '#ff2d55');
        grad.addColorStop(1, '#2a0510');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff';
        g.beginPath(); g.roundRect(214, 290, 340, 240, 60); g.fill();
        g.fillStyle = '#ff0033';
        g.beginPath(); g.moveTo(344, 350); g.lineTo(344, 470); g.lineTo(450, 410); g.closePath(); g.fill();
        title('HONCHO', 680, 96);
        line('Roblox · Doors · Secrets', 750, 32);
        line('youtube.com/@Raccoon_Team', 920, 30, '#fecdd3', 700);
    }
    return toTexture(c);
}

/** Neon sign: text on a transparent canvas; the glow layer is a blurred copy. */
export function neon(text, { color = '#ff4fd8', w = 1024, h = 256 } = {}) {
    const draw = (blur) => {
        const c = canvas(w, h);
        const g = c.getContext('2d');
        g.font = `800 150px Unbounded, "Arial Black", sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        if (blur) {
            g.filter = `blur(${blur}px)`;
            g.strokeStyle = color;
            g.lineWidth = 26;
            g.strokeText(text, w / 2, h / 2 + 6);
        } else {
            g.shadowColor = color;
            g.shadowBlur = 18;
            g.strokeStyle = color;
            g.lineWidth = 12;
            g.strokeText(text, w / 2, h / 2 + 6);
            g.shadowBlur = 0;
            g.strokeStyle = '#fff';
            g.lineWidth = 4;
            g.strokeText(text, w / 2, h / 2 + 6);
        }
        return c;
    };
    return { tube: toTexture(draw(0)), glow: toTexture(draw(28)) };
}

/** Soft dark ellipse used as contact shadow under furniture. */
export function blobShadow() {
    const c = canvas(256, 256);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return toTexture(c, { srgb: false });
}

/** Radial glow sprite (for lamps, LEDs, stars). */
export function glow() {
    const c = canvas(128, 128);
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return toTexture(c);
}

/** Door panels (painted wood with shaker panels). */
export function doorPaint() {
    const c = canvas(512, 1024);
    const g = c.getContext('2d');
    g.fillStyle = '#e9e5de';
    g.fillRect(0, 0, 512, 1024);
    const panel = (x, y, pw, ph) => {
        g.strokeStyle = 'rgba(0,0,0,0.12)';
        g.lineWidth = 6;
        g.strokeRect(x, y, pw, ph);
        g.strokeStyle = 'rgba(255,255,255,0.6)';
        g.lineWidth = 2;
        g.strokeRect(x + 5, y + 5, pw - 10, ph - 10);
    };
    panel(60, 70, 392, 380);
    panel(60, 540, 392, 400);
    return toTexture(c);
}
