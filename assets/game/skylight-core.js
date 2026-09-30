// Skylight: the rules of the game, with no drawing and no DOM, so they can be
// tested in Node. y grows downwards; the world is VIEW_H units tall and the
// player flies to the right.

export const VIEW_H = 540;
export const CHUNK = 1400;      // the terrain is built one chunk at a time
export const MAX_LIVES = 5;
export const MAX_ENERGY = 100;
export const PLAYER_R = 14;
export const STEP = 1 / 60;

const FLAP_COST = 10;
const ORB_ENERGY = 16;
const START_ISLAND = { id: 'start', x: -260, w: 640, y: 410, lantern: false };

/* ---------------------------------------------------------------- random */

export const mulberry32 = (seed) => {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

export const hashString = (text) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

// The daily flight: everyone gets the same course on the same (UTC) day.
export const dailyKey = (date = new Date()) => date.toISOString().slice(0, 10);
export const dailySeed = (date = new Date()) => hashString(`skylight-${dailyKey(date)}`);

/* ---------------------------------------------------------------- terrain */

const buildChunk = (seed, index) => {
    const rand = mulberry32((seed ^ Math.imul(index + 1, 0x9E3779B1)) >>> 0);
    const between = (a, b) => a + rand() * (b - a);
    const d = Math.min(1, index / 14);          // 0 easy → 1 hard
    const e = Math.min(1, Math.max(0, (index - 14) / 40));   // keeps getting harder after that
    const base = index * CHUNK;
    const chunk = { islands: [], orbs: [], winds: [], storms: [], rocks: [] };

    // two islands per chunk, wide and forgiving at first
    for (let k = 0; k < 2; k++) {
        const w = between(150, 250) + (1 - d) * 110 - e * 60;
        chunk.islands.push({
            id: `i${index}.${k}`,
            x: base + 160 + k * 640 + between(0, 130),
            y: between(300, 470),
            w,
            lantern: rand() < 0.6 - e * 0.25,
        });
    }

    // light: arcs of orbs, thinner when it gets hard
    const arcs = 1 + (rand() < 0.8 - d * 0.35 ? 1 : 0) + (rand() < 0.5 - d * 0.5 ? 1 : 0);
    for (let a = 0; a < arcs; a++) {
        const n = 5 + Math.floor(rand() * 4);
        const x0 = base + between(80, CHUNK - 400);
        const y0 = between(150, 420);
        const amp = between(20, 80);
        const rise = between(-60, 60);
        for (let o = 0; o < n; o++) {
            chunk.orbs.push({
                id: `o${index}.${a}.${o}`,
                x: x0 + o * 46,
                y: Math.max(60, Math.min(470, y0 + Math.sin(o * 0.7) * amp + rise * (o / n))),
            });
        }
    }
    // a few orbs floating above each island
    chunk.islands.forEach((is, k) => {
        if (rand() < 0.7) {
            for (let o = -1; o <= 1; o++) {
                chunk.orbs.push({ id: `p${index}.${k}.${o}`, x: is.x + is.w / 2 + o * 40, y: is.y - 70 - (o === 0 ? 24 : 0) });
            }
        }
    });

    // updrafts
    if (rand() < 0.35 + d * 0.15 - e * 0.15) {
        const y0 = between(120, 260);
        chunk.winds.push({ id: `w${index}`, x: base + between(100, CHUNK - 300), y0, y1: Math.min(500, y0 + between(220, 320)), w: between(90, 130) });
    }

    // storm clouds
    if (index >= 2 && rand() < 0.25 + d * 0.5 + e * 0.2) {
        const count = 1 + (rand() < 0.3 * d ? 1 : 0) + (rand() < 0.4 * e ? 1 : 0);
        for (let s = 0; s < count; s++) {
            const st = { id: `s${index}.${s}`, x: base + between(80, CHUNK - 200), y: between(110, 330), rx: between(80, 130), ry: between(55, 80) };
            // keep clear of updrafts and lanterns so it stays fair
            const clear = chunk.winds.every((w) => st.x + st.rx < w.x - 30 || st.x - st.rx > w.x + w.w + 30)
                && chunk.islands.every((is) => !is.lantern || Math.abs(st.x - (is.x + is.w / 2)) > st.rx + 90);
            if (clear) chunk.storms.push(st);
        }
    }

    // drifting rocks
    if (index >= 3) {
        const count = Math.floor(rand() * (1 + 2 * d + 2 * e) + 0.6);
        for (let r = 0; r < Math.min(3, count); r++) {
            const rock = { id: `r${index}.${r}`, x: base + between(100, CHUNK - 100), y: between(100, 380), r: between(20, 30), amp: between(0, 30), ph: between(0, 6.28) };
            const clear = chunk.orbs.every((o) => Math.hypot(o.x - rock.x, o.y - rock.y) > rock.r + rock.amp + 60)
                && chunk.islands.every((is) => rock.x < is.x - 60 || rock.x > is.x + is.w + 60 || rock.y < is.y - 200);
            if (clear) chunk.rocks.push(rock);
        }
    }
    return chunk;
};

export function createWorld(seed) {
    const cache = new Map();
    const chunk = (i) => {
        if (!cache.has(i)) cache.set(i, buildChunk(seed, i));
        return cache.get(i);
    };
    // everything between x0 and x1 (a little generous on both sides)
    const near = (x0, x1) => {
        const out = { islands: [START_ISLAND], orbs: [], winds: [], storms: [], rocks: [] };
        const first = Math.max(0, Math.floor(x0 / CHUNK) - 1);
        const last = Math.max(0, Math.floor(x1 / CHUNK) + 1);
        for (let i = first; i <= last; i++) {
            const c = chunk(i);
            for (const key of ['islands', 'orbs', 'winds', 'storms', 'rocks']) out[key].push(...c[key]);
        }
        // the start island is only "near" at the beginning
        if (x0 > START_ISLAND.x + START_ISLAND.w + 400) out.islands.shift();
        return out;
    };
    return { seed, chunk, near };
}

/* ---------------------------------------------------------------- the game */

export const rockY = (rock, t) => rock.y + Math.sin(t * 1.3 + rock.ph) * rock.amp;

export function createGame({ seed = 1, mode = 'free' } = {}) {
    const world = createWorld(seed);
    const R = PLAYER_R;
    const g = {
        seed,
        mode,
        t: 0,
        x: 40,
        y: START_ISLAND.y - R,
        vx: 0,
        vy: 0,
        energy: MAX_ENERGY,
        lives: 3,
        bonus: 0,
        combo: 0,
        comboT: 0,
        orbs: 0,
        lanterns: 0,
        inv: 0,
        flapCd: 0,
        noEnergyCd: 0,
        distance: 0,
        dead: false,
        gliding: false,
        inWind: false,
        inStorm: false,
        island: START_ISLAND,
        respawn: { x: 40, y: START_ISLAND.y - R },
        taken: new Set(),
        lit: new Set(),
    };

    const score = () => Math.floor(g.distance) + g.bonus;
    const result = () => ({ score: score(), meters: Math.floor(g.distance), orbs: g.orbs, lanterns: g.lanterns, seed, mode });

    const loseLife = (events, type) => {
        g.lives -= 1;
        g.combo = 0;
        g.comboT = 0;
        events.push({ type, lives: g.lives });
        if (g.lives <= 0) {
            g.dead = true;
            events.push({ type: 'gameover', result: result() });
        }
    };

    // input: { hold: boolean, pressed: boolean (a new press since the last step) }
    const step = (dt, input = {}) => {
        const events = [];
        if (g.dead) return events;
        const hold = !!input.hold;
        const speedUp = 1 + Math.min(0.9, g.x / 60000);
        g.t += dt;
        g.inv = Math.max(0, g.inv - dt);
        g.flapCd = Math.max(0, g.flapCd - dt);
        g.noEnergyCd = Math.max(0, g.noEnergyCd - dt);
        g.comboT = Math.max(0, g.comboT - dt);
        if (g.comboT === 0) g.combo = 0;

        const near = world.near(g.x - 160, g.x + 160);

        // air: updrafts and storms
        const wasInStorm = g.inStorm;
        g.inWind = near.winds.some((w) => g.x > w.x && g.x < w.x + w.w && g.y > w.y0 && g.y < w.y1);
        g.inStorm = near.storms.some((s) => ((g.x - s.x) / s.rx) ** 2 + ((g.y - s.y) / s.ry) ** 2 < 1);
        if (g.inStorm && !wasInStorm) events.push({ type: 'storm' });

        // wings
        if (input.pressed && g.flapCd === 0) {
            if (g.island) {
                g.vy = -270;
                g.island = null;
                g.flapCd = 0.2;
                events.push({ type: 'flap' });
            } else if (g.energy >= FLAP_COST) {
                g.energy -= FLAP_COST;
                g.vy = Math.max(-380, Math.min(g.vy, 0) - 200);
                g.flapCd = 0.16;
                events.push({ type: 'flap' });
            } else if (g.noEnergyCd === 0) {
                g.noEnergyCd = 0.7;
                events.push({ type: 'noenergy' });
            }
        }

        // up and down
        g.gliding = hold && !g.island;
        if (g.island) {
            g.vy = 0;
            g.energy = Math.min(MAX_ENERGY, g.energy + 38 * dt);
        } else {
            g.vy += (g.gliding ? 115 : 560) * dt;
            if (g.gliding && g.vy > 95) g.vy = Math.max(95, g.vy - 700 * dt);
            if (g.vy > 560) g.vy = 560;
            if (g.inWind) g.vy = Math.max(-250, g.vy - 980 * dt);
            if (g.inStorm) {
                g.vy += 160 * dt;
                g.energy -= 26 * dt;
            } else {
                g.energy += 3 * dt;
            }
        }
        g.energy = Math.max(0, Math.min(MAX_ENERGY, g.energy));

        // forward
        const target = (g.island ? 140 : g.gliding ? 235 : 165) * speedUp;
        g.vx += (target - g.vx) * Math.min(1, dt * 4);
        const footBefore = g.y + R;
        g.x += g.vx * dt;
        g.y += g.vy * dt;

        // landing on an island (from above only: from below you fly through)
        if (!g.island && g.vy >= 0) {
            for (const is of near.islands) {
                if (g.x > is.x - 6 && g.x < is.x + is.w + 6 && footBefore <= is.y + 3 && g.y + R >= is.y) {
                    if (g.vy > 360 && g.inv === 0) {
                        g.inv = 1.2;
                        loseLife(events, 'crash');
                    } else {
                        events.push({ type: 'land' });
                    }
                    g.y = is.y - R;
                    g.vy = 0;
                    g.island = is;
                    break;
                }
            }
        } else if (g.island && (g.x > g.island.x + g.island.w + 4 || g.x < g.island.x - 4)) {
            g.island = null;   // ran off the edge
        }

        // lanterns are lit by flying (or walking) past
        for (const is of near.islands) {
            if (!is.lantern || g.lit.has(is.id)) continue;
            const cx = is.x + is.w / 2;
            if (Math.abs(g.x - cx) < 70 && g.y < is.y + 30 && g.y > is.y - 190) {
                g.lit.add(is.id);
                g.lanterns += 1;
                g.bonus += 100;
                g.respawn = { x: cx, y: is.y - R - 60 };
                events.push({ type: 'lantern', x: cx, y: is.y });
                if (g.lanterns % 3 === 0 && g.lives < MAX_LIVES) {
                    g.lives += 1;
                    events.push({ type: 'life', lives: g.lives });
                }
            }
        }

        // light
        for (const o of near.orbs) {
            if (g.taken.has(o.id)) continue;
            if (Math.hypot(o.x - g.x, o.y - g.y) < 28) {
                g.taken.add(o.id);
                g.orbs += 1;
                g.energy = Math.min(MAX_ENERGY, g.energy + ORB_ENERGY);
                g.combo = g.comboT > 0 ? g.combo + 1 : 1;
                g.comboT = 2.2;
                g.bonus += 10 * Math.min(5, g.combo);
                events.push({ type: 'orb', combo: g.combo, x: o.x, y: o.y });
            }
        }

        // rocks hurt
        if (g.inv === 0) {
            for (const r of near.rocks) {
                if (Math.hypot(r.x - g.x, rockY(r, g.t) - g.y) < r.r + R - 2) {
                    g.inv = 1.6;
                    g.vy = 120;
                    loseLife(events, 'crash');
                    break;
                }
            }
        }

        // ceiling and sea
        if (g.y < R + 4) {
            g.y = R + 4;
            g.vy = Math.max(g.vy, 20);
        }
        if (!g.dead && g.y > VIEW_H + 20) {
            loseLife(events, 'sea');
            if (!g.dead) {
                g.x = g.respawn.x;
                g.y = g.respawn.y;
                g.vy = 0;
                g.island = null;
                g.inv = 1.5;
                g.energy = Math.max(g.energy, 60);
            }
        }

        g.distance = Math.max(g.distance, g.x / 10);
        return events;
    };

    return { state: g, world, step, score, result };
}

/* ---------------------------------------------------------------- sharing */

export const shareText = ({ score, meters, mode, seed }, date = new Date()) => {
    const label = mode === 'daily' ? `Daily flight ${dailyKey(date)}` : 'Free flight';
    return `🪽 Skylight · ${label}\n${score.toLocaleString('en')} points · ${meters.toLocaleString('en')} m\nadi839.github.io`;
};
