// The 3D world: a neon core, six planets on orbits, hidden stars, particles.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/CSS2DRenderer.js';

const STATUS_COLORS = { online: 0x23a55a, idle: 0xf0b232, dnd: 0xf23f43, offline: 0x80848e };
const PALETTE = [0x22d3ee, 0xa78bfa, 0xf472b6, 0xffffff];

const makeGlowTexture = () => {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
};

// Small deterministic random, so the hidden stars are always in the same places.
const seeded = (seed) => () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const shapeFor = (shape) => {
    switch (shape) {
        case 'tv': return new THREE.BoxGeometry(1.9, 1.25, 0.35);
        case 'torus': return new THREE.TorusGeometry(0.8, 0.32, 18, 48);
        case 'play': return new THREE.ConeGeometry(1.05, 1.5, 3).rotateZ(-Math.PI / 2);
        case 'octa': return new THREE.OctahedronGeometry(1.15);
        case 'knot': return new THREE.TorusKnotGeometry(0.62, 0.2, 110, 14);
        default: return new THREE.SphereGeometry(0.9, 32, 32);
    }
};

export function createWorld({
    canvas,
    container,
    planets,
    starsFound = [],
    golden = false,
    mobile = false,
    trail = true,
    onSelect = () => {},
    onStar = () => {},
    onCore = () => {},
    onReady = () => {},
    onSlow = () => {},
    getLevel = () => 0,
    getInset = () => ({ right: 0, bottom: 0 }),
}) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
    renderer.setClearColor(0x05030a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05030a, 0.013);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
    camera.position.set(0, 48, 130);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'labels';
    labelRenderer.domElement.setAttribute('aria-hidden', 'true');
    container.append(labelRenderer.domElement);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 7;
    controls.maxDistance = 70;
    controls.maxPolarAngle = Math.PI * 0.64;
    controls.rotateSpeed = mobile ? 0.7 : 0.55;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.enabled = false;

    const glowTex = makeGlowTexture();
    const glow = (color, scale, opacity = 0.7) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
        }));
        sprite.scale.setScalar(scale);
        return sprite;
    };

    /* ---------- Lights ---------- */
    scene.add(new THREE.AmbientLight(0x8a7dff, 0.9));
    const coreLight = new THREE.PointLight(0xc4b5fd, 260, 0, 2);
    scene.add(coreLight);
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(10, 20, 15);
    scene.add(sun);

    /* ---------- Background: stars, grid, horizon ---------- */
    const bgCount = mobile ? 700 : 2200;
    const bgPos = new Float32Array(bgCount * 3);
    const bgCol = new Float32Array(bgCount * 3);
    const tmpColor = new THREE.Color();
    for (let i = 0; i < bgCount; i++) {
        const r = 70 + Math.random() * 170;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        bgPos.set([r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) * 0.6 + 20, r * Math.sin(phi) * Math.sin(theta)], i * 3);
        tmpColor.set(PALETTE[i % PALETTE.length]).lerp(new THREE.Color(0xffffff), 0.4);
        bgCol.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
    }
    const bgGeo = new THREE.BufferGeometry();
    bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
    bgGeo.setAttribute('color', new THREE.BufferAttribute(bgCol, 3));
    const bgStars = new THREE.Points(bgGeo, new THREE.PointsMaterial({
        size: 1.6, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    scene.add(bgStars);

    const grid = new THREE.GridHelper(440, 110, 0xf472b6, 0x7c3aed);
    grid.position.y = -9;
    grid.material.transparent = true;
    grid.material.opacity = 0.42;
    scene.add(grid);

    const horizonA = glow(0xff4fa8, 1, 0.35);
    horizonA.scale.set(300, 90, 1);
    horizonA.position.set(0, -8, -150);
    const horizonB = glow(0x22d3ee, 1, 0.25);
    horizonB.scale.set(300, 90, 1);
    horizonB.position.set(0, -8, 150);
    horizonA.material.fog = horizonB.material.fog = false;
    scene.add(horizonA, horizonB);

    /* ---------- Core ---------- */
    const core = new THREE.Group();
    scene.add(core);
    const coreMesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.5, 2),
        new THREE.MeshStandardMaterial({ color: 0x160b33, emissive: 0x7c3aed, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.3, flatShading: true }),
    );
    const shell = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.2, 1)),
        new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.6 }),
    );
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf472b6 });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.035, 8, 160), ringMat);
    ring1.rotation.x = Math.PI / 2.3;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.02, 8, 160), new THREE.MeshBasicMaterial({ color: 0x22d3ee }));
    ring2.rotation.set(Math.PI / 1.7, 0.4, 0);
    const coreGlow = glow(0x8b5cf6, 11, 0.85);
    const statusGlow = glow(0x23a55a, 7, 0);
    const coreHit = new THREE.Mesh(new THREE.SphereGeometry(2.5, 12, 12), new THREE.MeshBasicMaterial({ visible: false }));
    coreHit.userData.kind = 'core';
    core.add(coreGlow, statusGlow, coreMesh, shell, ring1, ring2, coreHit);

    /* ---------- Planets ---------- */
    // Tall phone screens get tighter orbits so everything fits across.
    const portrait = window.innerWidth < window.innerHeight;
    const SIZE = portrait ? 1.1 : 1.4;
    const planetList = planets.map((def, i) => {
        const color = new THREE.Color(def.color);
        const radius = portrait ? 4.5 + i * 1.15 : 7 + i * 1.8;
        const pivot = new THREE.Group();
        pivot.rotation.set((i % 2 ? 1 : -1) * (0.06 + i * 0.035), 0, (i % 3 - 1) * 0.08);
        scene.add(pivot);

        const ringPts = [];
        for (let k = 0; k <= 128; k++) {
            const a = (k / 128) * Math.PI * 2;
            ringPts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
        }
        const orbitLine = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(ringPts),
            new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.16 }),
        );
        pivot.add(orbitLine);

        const holder = new THREE.Group();
        pivot.add(holder);
        const body = new THREE.Group();
        const geo = shapeFor(def.shape);
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
            color: color.clone().multiplyScalar(0.25), emissive: color, emissiveIntensity: 0.38, metalness: 0.55, roughness: 0.3,
            flatShading: def.shape === 'octa' || def.shape === 'play',
        }));
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
        body.add(mesh, edges);
        if (def.shape === 'ringed') {
            const saturn = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color }));
            saturn.rotation.x = Math.PI / 2.4;
            body.add(saturn);
        }
        const halo = glow(color, 4.2, 0.55);
        const hit = new THREE.Mesh(new THREE.SphereGeometry((mobile ? 2 : 1.7) * SIZE, 12, 12), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData = { kind: 'planet', id: def.id };
        holder.add(halo, body, hit);

        const wrap = document.createElement('div');
        const label = document.createElement('button');
        label.type = 'button';
        label.tabIndex = -1;
        label.className = 'plabel';
        label.style.setProperty('--c', `#${color.getHexString()}`);
        label.append(document.createTextNode(`${def.icon} ${def.label} `));
        const key = document.createElement('kbd');
        key.textContent = String(i + 1);
        label.append(key);
        label.addEventListener('click', (e) => { e.stopPropagation(); onSelect(def.id); });
        label.addEventListener('pointerenter', () => { hoverId = def.id; });
        label.addEventListener('pointerleave', () => { if (hoverId === def.id) hoverId = null; });
        wrap.append(label);
        const labelObj = new CSS2DObject(wrap);
        labelObj.position.y = 1.3 * SIZE;
        holder.add(labelObj);

        return {
            ...def, index: i, radius, pivot, holder, body, mesh, edges, halo, hit, label, orbitLine,
            angle: (i / planets.length) * Math.PI * 2 + 0.4,
            speed: 0.16 / Math.sqrt(radius / 6.8) * (i % 2 ? 1 : 0.85),
            scale: 0,
            spin: 0.3 + (i % 3) * 0.2,
        };
    });
    const planetById = Object.fromEntries(planetList.map((p) => [p.id, p]));

    /* ---------- Hidden stars (collectibles) ---------- */
    const rand = seeded(839);
    const starGeo = new THREE.OctahedronGeometry(0.34, 0).scale(1, 1.45, 1);
    const found = new Set(starsFound);
    const stars = Array.from({ length: 10 }, (_, i) => {
        const a = rand() * Math.PI * 2;
        const r = 8 + rand() * 15;
        const y = -3 + rand() * 11;
        const group = new THREE.Group();
        group.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        const mesh = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color: 0xffd35a }));
        const halo = glow(0xfbbf24, 1.9, 0.8);
        const hit = new THREE.Mesh(new THREE.SphereGeometry(mobile ? 1.35 : 0.95, 10, 10), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData = { kind: 'star', index: i };
        group.add(halo, mesh, hit);
        group.visible = !found.has(i);
        scene.add(group);
        return { group, mesh, hit, index: i, phase: rand() * 10, collecting: -1 };
    });

    /* ---------- Particles (bursts + cursor trail) ---------- */
    const MAX = 700;
    const pPos = new Float32Array(MAX * 3).fill(99999);
    const pCol = new Float32Array(MAX * 3);
    const pBase = new Float32Array(MAX * 3);
    const pVel = new Float32Array(MAX * 3);
    const pLife = new Float32Array(MAX);
    const pSpan = new Float32Array(MAX).fill(1);
    let pNext = 0;
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
    const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
        size: 0.55, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    particles.frustumCulled = false;
    scene.add(particles);
    const burst = (pos, colors, count = 40, speed = 6, span = 1.1) => {
        for (let n = 0; n < count; n++) {
            const i = pNext;
            pNext = (pNext + 1) % MAX;
            const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.65));
            pPos.set([pos.x, pos.y, pos.z], i * 3);
            pVel.set([dir.x, dir.y, dir.z], i * 3);
            tmpColor.set(colors[n % colors.length]);
            pBase.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
            pLife[i] = 1;
            pSpan[i] = span * (0.6 + Math.random() * 0.6);
        }
    };
    const updateParticles = (dt) => {
        const drag = Math.pow(0.9, dt * 60);
        for (let i = 0; i < MAX; i++) {
            if (pLife[i] <= 0) continue;
            pLife[i] -= dt / pSpan[i];
            const k = i * 3;
            if (pLife[i] <= 0) {
                pPos[k] = pPos[k + 1] = pPos[k + 2] = 99999;
                pCol[k] = pCol[k + 1] = pCol[k + 2] = 0;
                continue;
            }
            pVel[k] *= drag; pVel[k + 1] = pVel[k + 1] * drag - 1.2 * dt; pVel[k + 2] *= drag;
            pPos[k] += pVel[k] * dt; pPos[k + 1] += pVel[k + 1] * dt; pPos[k + 2] += pVel[k + 2] * dt;
            const l = pLife[i];
            pCol[k] = pBase[k] * l; pCol[k + 1] = pBase[k + 1] * l; pCol[k + 2] = pBase[k + 2] * l;
        }
        pGeo.attributes.position.needsUpdate = true;
        pGeo.attributes.color.needsUpdate = true;
    };

    /* ---------- Camera modes ---------- */
    const home = new THREE.Vector3();
    // Looking a little above the core pushes the system down, clear of the title at the top.
    const homeTarget = new THREE.Vector3();
    const layoutHome = () => {
        const aspect = camera.aspect;
        const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
        const halfH = Math.atan(Math.tan(halfV) * aspect);
        const outer = planetList[planetList.length - 1].radius + 1.5;
        const tall = aspect < 1;
        // Wide screens: fit the orbits vertically, seen from a low angle.
        // Tall screens: fit them across, seen from higher up so they spread down the screen.
        const need = tall ? (outer * 0.92) / Math.tan(halfH) : outer / Math.tan(halfV * 1.25);
        const dist = THREE.MathUtils.clamp(need, 20, 52);
        homeTarget.set(0, tall ? 3.2 : 2.2, tall ? -1.5 : 0);
        home.set(0, tall ? 1.5 : 0.42, 1).setLength(dist).add(homeTarget);
        controls.maxDistance = Math.max(70, dist * 1.5);
    };
    let mode = 'intro';
    let focused = null;
    const camGoal = new THREE.Vector3();
    const tgtGoal = new THREE.Vector3();
    let orbitFactor = 1;
    let orbitGoal = 1;
    let idleTimer = 0;
    controls.addEventListener('start', () => {
        controls.autoRotate = false;
        clearTimeout(idleTimer);
        canvas.classList.add('is-dragging');
    });
    controls.addEventListener('end', () => {
        canvas.classList.remove('is-dragging');
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => { if (mode === 'free') controls.autoRotate = true; }, 9000);
    });

    const focus = (id) => {
        const p = planetById[id];
        if (!p) return;
        focused = p;
        mode = 'focus';
        orbitGoal = 0.05;
        controls.enabled = false;
        controls.autoRotate = false;
    };
    const unfocus = () => {
        if (!focused && mode !== 'free') return;
        focused = null;
        mode = 'return';
        orbitGoal = 1;
        camGoal.copy(home);
        tgtGoal.copy(homeTarget);
    };
    const reset = () => {
        focused = null;
        mode = 'return';
        orbitGoal = 1;
        camGoal.copy(home);
        tgtGoal.copy(homeTarget);
    };

    /* ---------- Pointer: hover, click, trail ---------- */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2(9, 9);
    let hoverId = null;
    let pointerInside = false;
    let down = null;
    let lastTrail = 0;
    const pickables = () => [
        ...stars.filter((s) => s.group.visible && s.collecting < 0).map((s) => s.hit),
        ...planetList.map((p) => p.hit),
        coreHit,
    ];
    const pick = () => {
        raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObjects(pickables(), false)[0];
        return hit ? hit.object.userData : null;
    };
    const setNdc = (e) => {
        const r = canvas.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    canvas.addEventListener('pointermove', (e) => {
        setNdc(e);
        pointerInside = true;
        if (trail && e.pointerType === 'mouse' && performance.now() - lastTrail > 24) {
            lastTrail = performance.now();
            const p = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera);
            const dir = p.sub(camera.position).normalize();
            const at = camera.position.clone().add(dir.multiplyScalar(14));
            burst(at, [PALETTE[Math.floor(Math.random() * 3)]], 1, 0.6, 0.55);
        }
    });
    canvas.addEventListener('pointerleave', () => { pointerInside = false; hoverId = null; });
    canvas.addEventListener('pointerdown', (e) => { setNdc(e); down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener('pointerup', (e) => {
        if (!down) return;
        const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        const quick = performance.now() - down.t < 600;
        down = null;
        if (moved > 8 || !quick) return;
        setNdc(e);
        const target = pick();
        if (!target) return;
        if (target.kind === 'planet') onSelect(target.id);
        else if (target.kind === 'star') collectStar(target.index);
        else if (target.kind === 'core') tapCore();
    });

    const collectStar = (index) => {
        const s = stars[index];
        if (!s || !s.group.visible || s.collecting >= 0) return;
        s.collecting = 0;
        burst(s.group.position, [0xffd35a, 0xffffff, 0xf472b6], 60, 7, 1.2);
        found.add(index);
        onStar(index, found.size);
    };

    let coreSpin = 0;
    let coreTaps = [];
    const tapCore = () => {
        const now = performance.now();
        coreTaps = coreTaps.filter((t) => now - t < 2000);
        coreTaps.push(now);
        coreSpin += 6;
        burst(new THREE.Vector3(), PALETTE, 30 + coreTaps.length * 12, 5 + coreTaps.length * 1.5, 1.2);
        if (coreTaps.length >= 5) {
            coreTaps = [];
            for (let k = 0; k < 4; k++) setTimeout(() => burst(new THREE.Vector3(), PALETTE, 120, 14, 1.8), k * 180);
        }
        onCore(coreTaps.length);
    };

    /* ---------- Golden mode (all stars found) ---------- */
    let isGolden = false;
    let fireworksUntil = 0;
    const setGolden = (on, celebrate = false) => {
        isGolden = on;
        shell.material.color.set(on ? 0xfbbf24 : 0x22d3ee);
        ringMat.color.set(on ? 0xfbbf24 : 0xf472b6);
        coreGlow.material.color.set(on ? 0xf59e0b : 0x8b5cf6);
        if (celebrate) fireworksUntil = performance.now() + 7000;
    };
    if (golden) setGolden(true);

    /* ---------- Status aura (Discord) ---------- */
    let statusTarget = 0;
    const setStatus = (status) => {
        statusGlow.material.color.set(STATUS_COLORS[status] || STATUS_COLORS.offline);
        statusTarget = status === 'offline' ? 0.2 : 0.65;
    };

    /* ---------- Resize ---------- */
    const resize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h, false);
        labelRenderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        layoutHome();
        if (mode === 'free' || mode === 'return' || mode === 'intro') { camGoal.copy(home); tgtGoal.copy(homeTarget); }
    };
    window.addEventListener('resize', resize);
    resize();

    /* ---------- Loop ---------- */
    const tmp = new THREE.Vector3();
    const outward = new THREE.Vector3();
    let last = performance.now();
    let elapsed = 0;
    let introDone = false;
    let viewX = 0;
    let viewY = 0;
    let fpsFrames = 0;
    let fpsStart = 0;
    let fpsChecked = false;
    let firstFrame = true;
    let fireworkNext = 0;

    const tick = () => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        elapsed += dt;
        const level = Math.min(1, Math.max(0, getLevel() || 0));

        // orbits
        orbitFactor += (orbitGoal - orbitFactor) * Math.min(1, dt * 2.5);
        planetList.forEach((p, i) => {
            p.angle += p.speed * dt * orbitFactor;
            p.holder.position.set(Math.cos(p.angle) * p.radius, Math.sin(elapsed * 0.8 + i) * 0.35, Math.sin(p.angle) * p.radius);
            p.body.rotation.y += dt * p.spin;
            p.body.rotation.x += dt * p.spin * 0.35;
            const appear = THREE.MathUtils.clamp((elapsed - 0.6 - i * 0.18) / 0.9, 0, 1);
            const eased = 1 - Math.pow(1 - appear, 3);
            const hovered = hoverId === p.id || focused === p;
            let target = eased * SIZE * (hovered ? 1.25 : 1);
            if (p.id === 'music') target *= 1 + level * 0.55;
            p.scale += (target - p.scale) * Math.min(1, dt * 10);
            p.body.scale.setScalar(Math.max(p.scale, 0.0001));
            p.halo.material.opacity = (hovered ? 0.95 : 0.5) * eased + (p.id === 'music' ? level * 0.5 : 0);
            p.halo.scale.setScalar((hovered ? 5.4 : 4.2) * SIZE * Math.max(eased, 0.01));
            p.mesh.material.emissiveIntensity = hovered ? 0.8 : 0.38;
            p.orbitLine.material.opacity = (hovered ? 0.45 : 0.16) * eased;
            p.label.classList.toggle('is-hover', hovered);
            p.label.parentElement.style.opacity = String(eased);
        });

        // core
        coreSpin *= Math.pow(0.35, dt);
        core.rotation.y += dt * (0.25 + coreSpin);
        shell.rotation.x += dt * 0.2;
        ring1.rotation.z += dt * 0.4;
        ring2.rotation.z -= dt * 0.3;
        const pulse = 1 + Math.sin(elapsed * 2.2) * 0.04 + level * 0.25;
        coreMesh.scale.setScalar(pulse);
        coreGlow.scale.setScalar(11 * pulse + level * 5);
        statusGlow.material.opacity += (statusTarget * (0.75 + Math.sin(elapsed * 3) * 0.25) - statusGlow.material.opacity) * Math.min(1, dt * 3);
        coreLight.intensity = 260 + level * 300;

        // stars
        stars.forEach((s) => {
            if (!s.group.visible) return;
            s.group.rotation.y += dt * 1.6;
            s.mesh.position.y = Math.sin(elapsed * 1.8 + s.phase) * 0.25;
            if (s.collecting >= 0) {
                s.collecting += dt / 0.5;
                s.group.scale.setScalar(1 + s.collecting * 1.6);
                s.mesh.material.opacity = 1 - s.collecting;
                s.mesh.material.transparent = true;
                if (s.collecting >= 1) s.group.visible = false;
            }
        });

        // background
        bgStars.rotation.y += dt * 0.012;
        grid.position.z = (elapsed * (2.2 + level * 6)) % 4;
        if (isGolden) grid.material.color.setHSL((elapsed * 0.08) % 1, 0.8, 0.6);
        grid.material.opacity = 0.42 + level * 0.3;

        if (now < fireworksUntil && now > fireworkNext) {
            fireworkNext = now + 260;
            burst(new THREE.Vector3((Math.random() - 0.5) * 30, 4 + Math.random() * 10, (Math.random() - 0.5) * 30), [0xfbbf24, PALETTE[Math.floor(Math.random() * 3)]], 70, 9, 1.4);
        }

        // hover (planets, stars, core) under the pointer
        if (pointerInside && !down && mode !== 'intro') {
            const target = pick();
            canvas.classList.toggle('is-pointing', Boolean(target));
            if (target && target.kind === 'planet') hoverId = target.id;
            else if (!target || target.kind !== 'planet') {
                const labelHovered = planetList.some((p) => p.label.matches(':hover'));
                if (!labelHovered) hoverId = null;
            }
        }

        // camera
        const k = 1 - Math.exp(-dt * (mode === 'intro' ? 1.5 : 3.2));
        if (mode === 'focus' && focused) {
            focused.holder.getWorldPosition(tmp);
            outward.copy(tmp).setY(0).normalize();
            if (outward.lengthSq() < 0.01) outward.set(0, 0, 1);
            camGoal.copy(tmp).addScaledVector(outward, portrait ? 13 : 10.5).add(new THREE.Vector3(0, portrait ? 4 : 3.2, 0));
            tgtGoal.copy(tmp);
            camera.position.lerp(camGoal, k);
            controls.target.lerp(tgtGoal, k);
            camera.lookAt(controls.target);
        } else if (mode === 'intro' || mode === 'return') {
            camera.position.lerp(camGoal, k);
            controls.target.lerp(tgtGoal, k);
            camera.lookAt(controls.target);
            if (camera.position.distanceTo(camGoal) < 0.25 && controls.target.distanceTo(tgtGoal) < 0.1) {
                mode = 'free';
                controls.enabled = true;
                if (!introDone) { introDone = true; fpsStart = now; onReady(); }
                idleTimer = setTimeout(() => { if (mode === 'free') controls.autoRotate = true; }, 4000);
            }
        } else {
            controls.update();
        }

        // keep the focused planet clear of the side panel / bottom sheet
        const inset = getInset();
        viewX += ((inset.right || 0) / 2 - viewX) * Math.min(1, dt * 5);
        viewY += ((inset.bottom || 0) / 2 - viewY) * Math.min(1, dt * 5);
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (Math.abs(viewX) > 0.5 || Math.abs(viewY) > 0.5) camera.setViewOffset(w, h, viewX, viewY, w, h);
        else if (camera.view && camera.view.enabled) camera.clearViewOffset();

        updateParticles(dt);
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);

        if (firstFrame) { firstFrame = false; container.dispatchEvent(new CustomEvent('world:frame')); }
        if (introDone && !fpsChecked) {
            fpsFrames++;
            if (now - fpsStart > 4000) {
                fpsChecked = true;
                const fps = (fpsFrames * 1000) / (now - fpsStart);
                if (fps < 14) onSlow(fps);
            }
        }
    };

    const start = () => { last = performance.now(); renderer.setAnimationLoop(tick); };
    const stop = () => renderer.setAnimationLoop(null);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
    start();

    return {
        focus,
        unfocus,
        reset,
        setStatus,
        setGolden,
        collectStar,
        burstAt: (x, y) => { setNdc({ clientX: x, clientY: y }); const p = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(camera); burst(p, PALETTE, 30, 4, 1); },
        get mode() { return mode; },
        get focusedId() { return focused ? focused.id : null; },
        destroy: () => { stop(); renderer.dispose(); labelRenderer.domElement.remove(); },
        _debug: { camera, planetList, stars, controls, scene, renderer },
    };
}
