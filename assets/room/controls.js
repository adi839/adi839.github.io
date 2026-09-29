// First-person controls.
// Desktop: pointer lock + WASD (drag-to-look if the browser refuses the lock).
// Touch: a joystick to walk, drag anywhere to look, tap to use or to walk to a spot.
import * as THREE from 'three';

const EYE = 1.6;
const RADIUS = 0.24;
const WALK = 2.1;
const RUN = 3.6;

const KEYS = {
    KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b',
    KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r',
    ShiftLeft: 'run', ShiftRight: 'run',
};

export function createControls({ camera, dom, colliders, joystick, touch = false, onLockChange = () => {}, onTap = () => {}, onUse = () => {}, onStep = () => {}, onMoveWhileSeated = () => {} }) {
    const pos = new THREE.Vector3(0, EYE, 1.2);
    const vel = new THREE.Vector2();
    const held = new Set();
    const joy = { x: 0, y: 0, active: false };
    let yaw = 0;
    let pitch = -0.05;
    let enabled = false;
    let dragMode = touch;
    let sensitivity = 1;
    let bobPhase = 0;
    let bobAmount = 0;
    let lastStep = 0;
    let walkTarget = null;
    let stuckTime = 0;
    let expectUnlock = false;
    let seated = false;

    camera.rotation.order = 'YXZ';

    const isLocked = () => document.pointerLockElement === dom;
    const clampPitch = () => { pitch = Math.max(-1.45, Math.min(1.45, pitch)); };
    const look = (dx, dy, scale) => {
        yaw -= dx * scale * sensitivity;
        pitch -= dy * scale * sensitivity;
        clampPitch();
    };

    /* ---------- pointer lock ---------- */
    const lock = async () => {
        if (!dom.requestPointerLock) dragMode = true;
        if (dragMode || isLocked()) return isLocked();
        try {
            const req = dom.requestPointerLock({ unadjustedMovement: false });
            if (req && req.then) await req;
            return true;
        } catch (err) {
            // Too soon after Esc, or not allowed here (some embeds): fall back to dragging.
            if (err && err.name === 'NotSupportedError') dragMode = true;
            return false;
        }
    };
    const unlock = () => {
        if (!isLocked()) return;
        expectUnlock = true;
        document.exitPointerLock();
    };
    document.addEventListener('pointerlockchange', () => {
        const locked = isLocked();
        if (locked) walkTarget = null;
        onLockChange(locked, { expected: expectUnlock });
        if (!locked) expectUnlock = false;
        held.clear();
    });
    document.addEventListener('pointerlockerror', () => { onLockChange(false, { error: true }); });

    document.addEventListener('mousemove', (e) => {
        if (!isLocked() || !enabled) return;
        // Some browsers report a huge jump right after locking; ignore it.
        if (Math.abs(e.movementX) > 350 || Math.abs(e.movementY) > 350) return;
        look(e.movementX, e.movementY, 0.0022);
    });
    dom.addEventListener('mousedown', (e) => {
        if (isLocked() && enabled && e.button === 0) onUse();
    });

    /* ---------- drag to look (touch, or mouse without lock) ---------- */
    const drags = new Map();
    dom.addEventListener('pointerdown', (e) => {
        if (isLocked()) return;
        if (e.pointerType === 'mouse' && (!dragMode || e.button !== 0)) return;
        drags.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 });
        dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
        const d = drags.get(e.pointerId);
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        d.x = e.clientX;
        d.y = e.clientY;
        d.moved += Math.abs(dx) + Math.abs(dy);
        if (enabled && d.moved > 6) {
            look(dx, dy, e.pointerType === 'mouse' ? 0.0042 : 0.0058);
            dom.classList.add('is-dragging');
        }
    });
    const endDrag = (e) => {
        const d = drags.get(e.pointerId);
        if (!d) return;
        drags.delete(e.pointerId);
        dom.classList.remove('is-dragging');
        if (d.moved <= 8 && performance.now() - d.t < 500) onTap(e.clientX, e.clientY);
    };
    dom.addEventListener('pointerup', endDrag);
    dom.addEventListener('pointercancel', (e) => { drags.delete(e.pointerId); dom.classList.remove('is-dragging'); });

    /* ---------- joystick ---------- */
    if (joystick) {
        const knob = joystick.querySelector('i');
        let id = null;
        let cx = 0, cy = 0, radius = 50;
        const set = (x, y) => {
            let dx = x - cx, dy = y - cy;
            const len = Math.hypot(dx, dy);
            if (len > radius) { dx *= radius / len; dy *= radius / len; }
            joy.x = dx / radius;
            joy.y = dy / radius;
            knob.style.transform = `translate(${dx}px, ${dy}px)`;
        };
        joystick.addEventListener('pointerdown', (e) => {
            if (id !== null) return;
            id = e.pointerId;
            joystick.setPointerCapture(id);
            const box = joystick.getBoundingClientRect();
            cx = box.left + box.width / 2;
            cy = box.top + box.height / 2;
            radius = box.width * 0.38;
            joy.active = true;
            walkTarget = null;
            joystick.classList.add('is-active');
            set(e.clientX, e.clientY);
        });
        joystick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX, e.clientY); });
        const release = (e) => {
            if (e.pointerId !== id) return;
            id = null;
            joy.x = joy.y = 0;
            joy.active = false;
            knob.style.transform = '';
            joystick.classList.remove('is-active');
        };
        joystick.addEventListener('pointerup', release);
        joystick.addEventListener('pointercancel', release);
    }

    /* ---------- keyboard ---------- */
    const typing = (e) => e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    window.addEventListener('keydown', (e) => {
        if (!enabled || typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
        const k = KEYS[e.code];
        if (!k) return;
        held.add(k);
        walkTarget = null;
        if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) held.delete(k); });
    window.addEventListener('blur', () => held.clear());
    document.addEventListener('visibilitychange', () => held.clear());

    /* ---------- collisions: a circle against axis-aligned boxes ---------- */
    const resolve = (p) => {
        for (let pass = 0; pass < 3; pass++) {
            let hit = false;
            for (const c of colliders) {
                const nx = Math.max(c.x0, Math.min(p.x, c.x1));
                const nz = Math.max(c.z0, Math.min(p.z, c.z1));
                let dx = p.x - nx, dz = p.z - nz;
                const d2 = dx * dx + dz * dz;
                if (d2 >= RADIUS * RADIUS) continue;
                hit = true;
                if (d2 > 1e-8) {
                    const d = Math.sqrt(d2);
                    p.x = nx + (dx / d) * RADIUS;
                    p.z = nz + (dz / d) * RADIUS;
                } else {
                    // centre inside the box: leave by the nearest side
                    const out = [[p.x - c.x0, -1, 0], [c.x1 - p.x, 1, 0], [p.z - c.z0, 0, -1], [c.z1 - p.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
                    p.x += out[1] * (out[0] + RADIUS);
                    p.z += out[2] * (out[0] + RADIUS);
                }
            }
            if (!hit) break;
        }
    };

    const forward = new THREE.Vector2();
    const wish = new THREE.Vector2();
    const update = (dt) => {
        if (enabled) {
            let f = 0, s = 0;
            if (held.has('f')) f += 1;
            if (held.has('b')) f -= 1;
            if (held.has('r')) s += 1;
            if (held.has('l')) s -= 1;
            if (joy.active) { f -= joy.y; s += joy.x; }
            if (seated) {
                // sitting down: looking around is fine, trying to walk stands you up
                if (Math.abs(f) > 0.3 || Math.abs(s) > 0.3) onMoveWhileSeated();
                f = s = 0;
            }
            let run = held.has('run') || Math.hypot(joy.x, joy.y) > 0.92;

            if (walkTarget && !f && !s) {
                const dx = walkTarget.x - pos.x, dz = walkTarget.z - pos.z;
                const dist = Math.hypot(dx, dz);
                if (dist < 0.12) walkTarget = null;
                else {
                    // turn toward the target, then walk
                    const want = Math.atan2(-dx, -dz);
                    let diff = want - yaw;
                    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
                    yaw += diff * Math.min(1, dt * 6);
                    f = Math.min(1, dist * 1.5);
                    run = false;
                }
            }

            forward.set(-Math.sin(yaw), -Math.cos(yaw));
            wish.set(forward.x * f - forward.y * s, forward.y * f + forward.x * s);
            if (wish.lengthSq() > 1) wish.normalize();
            wish.multiplyScalar(run ? RUN : WALK);
            vel.lerp(wish, Math.min(1, dt * 9));

            const before = walkTarget ? pos.clone() : null;
            pos.x += vel.x * dt;
            pos.z += vel.y * dt;
            resolve(pos);
            if (before) {
                const progressed = before.distanceTo(pos);
                stuckTime = progressed < 0.2 * dt ? stuckTime + dt : 0;
                if (stuckTime > 0.4) { walkTarget = null; stuckTime = 0; }
            }

            // head bob + footsteps
            const speed = vel.length();
            bobAmount += ((speed > 0.3 ? 1 : 0) - bobAmount) * Math.min(1, dt * 6);
            bobPhase += dt * speed * 3.1;
            if (speed > 0.3 && Math.floor(bobPhase / Math.PI) !== lastStep) {
                lastStep = Math.floor(bobPhase / Math.PI);
                onStep(speed / RUN);
            }
        } else {
            vel.set(0, 0);
            bobAmount *= 0.9;
        }
        camera.position.set(
            pos.x,
            pos.y + Math.sin(bobPhase * 2) * 0.018 * bobAmount,
            pos.z,
        );
        camera.rotation.set(pitch, yaw, Math.sin(bobPhase) * 0.004 * bobAmount);
    };

    return {
        update,
        lock,
        unlock,
        isLocked,
        get dragMode() { return dragMode; },
        set dragMode(v) { dragMode = v; },
        get enabled() { return enabled; },
        setEnabled(v) { enabled = v; if (!v) { held.clear(); walkTarget = null; } },
        setSensitivity(v) { sensitivity = v; },
        walkTo(x, z) { walkTarget = { x, z }; stuckTime = 0; },
        get moving() { return vel.length() > 0.3; },
        get seated() { return seated; },
        get walking() { return walkTarget !== null; },
        // where the player stands and looks (used to come back after using the PC or TV)
        getPose: () => ({ x: pos.x, z: pos.z, yaw, pitch }),
        setPose({ x = pos.x, z = pos.z, y: eye = EYE, yaw: y = yaw, pitch: p = pitch, sit = false }) {
            seated = sit;
            pos.set(x, eye, z);
            if (!sit) resolve(pos);
            yaw = y;
            pitch = p;
            clampPitch();
            vel.set(0, 0);
        },
        EYE,
    };
}
