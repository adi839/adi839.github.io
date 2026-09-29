// Tiny sound effects, synthesised with the Web Audio API (no files to download).

let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;

try { enabled = localStorage.getItem('sfx') !== 'off'; } catch { /* private mode */ }

export const isEnabled = () => enabled;
export const setEnabled = (on) => {
    enabled = on;
    try { localStorage.setItem('sfx', on ? 'on' : 'off'); } catch { /* ignore */ }
    if (master) master.gain.value = on ? 0.55 : 0;
};

// Call from a user gesture: browsers only start audio after one.
export const unlock = () => {
    if (!ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        ctx = new Ctx();
        master = ctx.createGain();
        master.gain.value = enabled ? 0.55 : 0;
        master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
};

const ready = () => ctx && enabled && ctx.state === 'running';

const tone = ({ freq = 440, to = null, type = 'sine', dur = 0.15, gain = 0.2, delay = 0, attack = 0.005 }) => {
    if (!ready()) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
};

const noise = ({ dur = 0.1, gain = 0.2, type = 'lowpass', freq = 1000, to = null, q = 0.8, delay = 0, attack = 0.004 }) => {
    if (!ready()) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
};

export const click = () => { noise({ dur: 0.03, gain: 0.5, type: 'highpass', freq: 2500 }); tone({ freq: 2200, type: 'square', dur: 0.015, gain: 0.04 }); };
export const blip = () => tone({ freq: 880, to: 1320, type: 'triangle', dur: 0.08, gain: 0.12 });
export const step = (k = 0.5) => noise({ dur: 0.08, gain: 0.05 + k * 0.05, type: 'lowpass', freq: 260 + k * 240, q: 0.4 });
export const whoosh = () => noise({ dur: 0.55, gain: 0.16, type: 'bandpass', freq: 300, to: 1800, q: 1.2, attack: 0.18 });
export const star = () => [988, 1319, 1568, 1976].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.14, delay: i * 0.07 }));
export const fanfare = () => {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.14, delay: i * 0.11 }));
    [523, 659, 784].forEach((f) => tone({ freq: f, type: 'sine', dur: 1.1, gain: 0.08, delay: 0.46, attack: 0.03 }));
};
export const boot = () => [392, 523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.9 - i * 0.1, gain: 0.07, delay: i * 0.09, attack: 0.04 }));
export const knock = () => [0, 0.2, 0.4].forEach((d) => { noise({ dur: 0.09, gain: 0.5, type: 'lowpass', freq: 380, delay: d }); tone({ freq: 110, to: 70, dur: 0.09, gain: 0.25, delay: d }); });
export const shutter = () => { noise({ dur: 0.05, gain: 0.45, type: 'highpass', freq: 1800 }); noise({ dur: 0.07, gain: 0.35, type: 'bandpass', freq: 3200, delay: 0.09 }); };
export const bloop = () => tone({ freq: 320, to: 120, type: 'sine', dur: 0.22, gain: 0.22 });
export const rustle = () => { for (let i = 0; i < 5; i++) noise({ dur: 0.09, gain: 0.08, type: 'highpass', freq: 3000 + i * 400, delay: i * 0.06 }); };
export const buzz = () => { tone({ freq: 120, type: 'sawtooth', dur: 0.12, gain: 0.05 }); tone({ freq: 240, type: 'square', dur: 0.08, gain: 0.02, delay: 0.1 }); };
export const vroom = () => { tone({ freq: 70, to: 180, type: 'sawtooth', dur: 0.5, gain: 0.07, attack: 0.05 }); tone({ freq: 180, to: 60, type: 'sawtooth', dur: 0.45, gain: 0.05, delay: 0.55 }); };
export const gulp = () => [0, 0.16].forEach((d) => tone({ freq: 260, to: 520, type: 'sine', dur: 0.1, gain: 0.14, delay: d }));
export const tvOn = () => { noise({ dur: 0.22, gain: 0.12, type: 'bandpass', freq: 2400, q: 0.5 }); tone({ freq: 15600, type: 'sine', dur: 0.4, gain: 0.015 }); };
