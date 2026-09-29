// Gabytzu's room: a physically lit 3D room you walk around in like a game.
// The PC monitor, the side monitor and the TV show real web pages (CSS3D);
// sitting down in front of one lets you click, scroll and type on it.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { buildRoom, placeModels, SCREENS } from './build.js';
import { createControls } from './controls.js';
import * as sfx from '../sfx.js';

const ROOT = new URL('../../', import.meta.url);
const at = (path) => new URL(path, ROOT).href;

const MODELS = ['GlamVelvetSofa', 'SheenChair', 'DiffuseTransmissionPlant', 'IridescenceLamp', 'AnisotropyBarnLamp', 'SpecularSilkPouf', 'ToyCar', 'GlassVaseFlowers', 'BoomBox', 'WaterBottle', 'AntiqueCamera'];
const TEXTURES = {
    floorColor: 'assets/textures/floor_color.webp',
    floorBump: 'assets/textures/floor_bump.webp',
    floorRough: 'assets/textures/floor_rough.webp',
    brickColor: 'assets/textures/brick_color.webp',
    brickBump: 'assets/textures/brick_bump.webp',
    brickRough: 'assets/textures/brick_rough.webp',
    deskWood: 'assets/textures/desk_wood.webp',
};
const NEON_COLORS = ['#ff4fd8', '#22d3ee', '#a78bfa', '#4ade80', '#fb923c', '#f43f5e'];
const SPAWN = { x: -2.25, z: 2.2, yaw: -0.42, pitch: -0.06 };
const ATTRACT = { pos: new THREE.Vector3(2.75, 1.72, 2.45), look: new THREE.Vector3(-0.7, 1.05, -1.6) };
const ARMCHAIR = { x: 2.6, y: 1.12, z: 1.9, yaw: 0.88, pitch: -0.12 };

// How far away (metres) you can use something with the crosshair.
const reachFor = (id) => {
    if (!id) return 0;
    if (id === 'tv' || id === 'sofa') return 4.2;
    if (id === 'window' || id === 'neon' || id === 'door') return 3.6;
    if (id.startsWith('poster')) return 3.2;
    return 2.7;
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function createRoom({
    canvas,
    cssLayer,
    screens: screenEls = {},
    joystick = null,
    touch = false,
    quality = 'high',
    night = false,
    collected = [],
    onProgress = () => {},
    onTarget = () => {},
    onInteract = () => {},
    onMode = () => {},
    onLock = () => {},
    onStar = () => {},
    onFps = () => {},
    isMusicOn = () => false,
    getLevel = () => 0,
}) {
    /* ---------------------------------------------------------------- renderer */
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    RectAreaLightUniformsLib.init();

    const maxRatio = { high: 1.75, medium: 1.3, low: 1 }[quality] || 1.3;
    let pixelRatio = Math.min(window.devicePixelRatio || 1, maxRatio);
    renderer.setPixelRatio(pixelRatio);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.04, 80);
    camera.rotation.order = 'YXZ';
    const css = new CSS3DRenderer({ element: cssLayer });

    /* ---------------------------------------------------------------- loading */
    const parts = new Map();
    const total = Object.keys(TEXTURES).length + MODELS.length + 3;
    const report = () => {
        let sum = 0;
        parts.forEach((v) => { sum += v; });
        onProgress(Math.min(1, sum / total));
    };
    const track = (name, loader, path) => new Promise((resolve) => {
        parts.set(name, 0);
        loader.load(
            at(path),
            (result) => { parts.set(name, 1); report(); resolve(result); },
            (e) => { if (e && e.lengthComputable) { parts.set(name, 0.95 * e.loaded / e.total); report(); } },
            (err) => { console.warn('Could not load', path, err); parts.set(name, 1); report(); resolve(null); },
        );
    });

    const texLoader = new THREE.TextureLoader();
    const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const exrLoader = new EXRLoader();

    const [texList, modelList, exr, dayTex, nightTex] = await Promise.all([
        Promise.all(Object.entries(TEXTURES).map(([key, path]) => track(key, texLoader, path).then((t) => [key, t]))),
        Promise.all(MODELS.map((name) => track(name, gltfLoader, `assets/models/${name}.glb`).then((g) => [name, g]))),
        track('env', exrLoader, 'assets/env/apartment.exr'),
        track('day', texLoader, 'assets/env/window_day.jpg'),
        track('night', texLoader, 'assets/env/window_night.jpg'),
    ]);
    const tex = Object.fromEntries(texList);
    const models = Object.fromEntries(modelList.filter(([, g]) => g));

    /* ---------------------------------------------------------------- scene */
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = exr
        ? pmrem.fromEquirectangular(exr).texture
        : pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    if (exr) exr.dispose();
    pmrem.dispose();
    [dayTex, nightTex].forEach((t) => {
        if (!t) return;
        t.mapping = THREE.EquirectangularReflectionMapping;
        t.colorSpace = THREE.SRGBColorSpace;
    });

    const room = buildRoom({ scene, tex, quality, renderer });
    const placed = placeModels(room, scene, models);
    const { anim, lights } = room;

    // Real web pages on the screens: a CSS3D element behind the canvas, and a
    // "hole" in the canvas (alpha 0) exactly where the screen is. The CSS side
    // gets its own copy of the camera and screens, scaled from metres up to
    // pixel-sized numbers that browsers handle well.
    const CSS_SCALE = 1000;
    const cssScene = new THREE.Scene();
    const cssCamera = new THREE.PerspectiveCamera();
    const screenObjects = {};
    for (const key of ['pc', 'side', 'tv']) {
        const content = screenEls[key];
        if (!content) continue;
        const spec = SCREENS[key];
        const wrap = document.createElement('div');
        wrap.className = `screen3d screen3d--${key}`;
        wrap.style.width = `${spec.px[0]}px`;
        wrap.style.height = `${spec.px[1]}px`;
        wrap.append(content);
        wrap.addEventListener('scroll', () => { wrap.scrollTop = 0; wrap.scrollLeft = 0; });
        const obj = new CSS3DObject(wrap);
        const group = room.screens[key];
        group.updateWorldMatrix(true, false);
        group.matrixWorld.decompose(obj.position, obj.quaternion, obj.scale);
        obj.position.multiplyScalar(CSS_SCALE);
        obj.scale.multiplyScalar(CSS_SCALE * spec.w / spec.px[0]);
        cssScene.add(obj);
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), room.M.hole);
        hole.position.z = 0.0004;
        room.screens[key].add(hole);
        screenObjects[key] = { obj, wrap, hole };
    }

    // the phone's lock screen is a small canvas texture
    const phoneCanvas = document.createElement('canvas');
    phoneCanvas.width = 360;
    phoneCanvas.height = 780;
    const phoneTex = new THREE.CanvasTexture(phoneCanvas);
    phoneTex.colorSpace = THREE.SRGBColorSpace;
    phoneTex.anisotropy = 8;
    const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(SCREENS.phone.w, SCREENS.phone.h), new THREE.MeshBasicMaterial({ map: phoneTex, toneMapped: false }));
    phoneScreen.position.z = 0.0003;
    room.screens.phone.add(phoneScreen);
    let phoneNote = '';
    const drawPhone = () => {
        const g = phoneCanvas.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 360, 780);
        grad.addColorStop(0, '#2e1065');
        grad.addColorStop(0.6, '#4c1d95');
        grad.addColorStop(1, '#0e7490');
        g.fillStyle = grad;
        g.fillRect(0, 0, 360, 780);
        const now = new Date();
        g.fillStyle = '#fff';
        g.textAlign = 'center';
        g.font = '300 96px "Space Grotesk", system-ui, sans-serif';
        g.fillText(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 180, 210);
        g.font = '600 26px "Space Grotesk", system-ui, sans-serif';
        g.fillStyle = 'rgba(255,255,255,0.8)';
        g.fillText(now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }), 180, 120);
        if (phoneNote) {
            g.fillStyle = 'rgba(255,255,255,0.16)';
            g.beginPath();
            g.roundRect(24, 300, 312, 110, 26);
            g.fill();
            g.fillStyle = '#c7d2fe';
            g.textAlign = 'left';
            g.font = '700 22px "Space Grotesk", system-ui, sans-serif';
            g.fillText('DISCORD', 48, 344);
            g.fillStyle = '#fff';
            g.font = '600 26px "Space Grotesk", system-ui, sans-serif';
            g.fillText(phoneNote.slice(0, 22), 48, 384);
        }
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.fillRect(130, 750, 100, 6);
        phoneTex.needsUpdate = true;
    };
    drawPhone();
    setInterval(drawPhone, 30000);

    /* ---------------------------------------------------------------- state */
    const state = {
        mode: 'attract',   // attract | walk | flying | pc | tv | armchair | paused
        night: false,
        lights: true,
        lamp: true,
        neon: 0,
        golden: false,
        target: null,
        returnPose: null,
        pending: null,
        disco: 0,
    };

    const setNight = (on, { sound = false } = {}) => {
        state.night = on;
        if (on ? nightTex : dayTex) scene.background = on ? nightTex : dayTex;
        scene.backgroundIntensity = on ? 0.9 : 1.2;
        scene.backgroundRotation.set(0, on ? 0 : -0.35, 0);
        scene.environmentIntensity = on ? 0.06 : 0.55;
        lights.sun.color.set(on ? 0x9db4ff : 0xffd6a8);
        lights.sun.intensity = on ? 0.35 : 10;
        lights.sky.color.set(on ? 0x5d74b8 : 0xd4e4ff);
        lights.sky.intensity = on ? 0.3 : 2.4;
        if (sound) sfx.whoosh();
    };
    const setLights = (on) => {
        state.lights = on;
        lights.ceiling.intensity = on ? 9 : 0;
        anim.diffuser.emissiveIntensity = on ? 2.5 : 0.03;
        anim.switchRocker.rotation.x = on ? -0.22 : 0.22;
    };
    const setLamp = (on) => {
        state.lamp = on;
        if (lights.lamp) lights.lamp.intensity = on ? 1.4 : 0;
        if (anim.lampHalo) anim.lampHalo.visible = on;
    };
    let neonFlicker = 0;
    const setNeon = (color) => {
        anim.neon.set(color);
        neonFlicker = 0.8;
    };
    const cycleNeon = () => {
        state.neon = (state.neon + 1) % NEON_COLORS.length;
        setNeon(state.golden && state.neon === 0 ? '#fbbf24' : NEON_COLORS[state.neon]);
        sfx.buzz();
    };
    const setGolden = (on) => {
        state.golden = on;
        room.trophy.visible = on;
        if (on) setNeon('#fbbf24');
    };

    setNight(night);
    setLights(true);
    setLamp(true);

    /* ---------------------------------------------------------------- stars */
    const done = new Set(collected);
    room.stars.forEach((s, i) => {
        s.base = s.group.position.y;
        if (done.has(i)) {
            s.collected = true;
            s.group.visible = false;
        }
    });
    const collectStar = (i) => {
        const s = room.stars[i];
        if (!s || s.collected) return;
        s.collected = true;
        s.popAt = performance.now();
        sfx.star();
        onStar(i);
    };
    setGolden(room.stars.every((s) => s.collected));

    /* ---------------------------------------------------------------- little animations */
    const tweens = [];
    const tween = (ms, fn) => new Promise((resolve) => tweens.push({ t0: performance.now(), ms, fn, resolve }));
    const wiggle = (obj, amount = 0.12) => {
        if (!obj) return;
        const rz = obj.rotation.z;
        tween(1200, (k) => { obj.rotation.z = rz + Math.sin(k * Math.PI * 7) * amount * (1 - k); });
    };
    const squish = (obj) => {
        if (!obj) return;
        const sy = obj.scale.y, sx = obj.scale.x;
        tween(700, (k) => {
            const w = Math.sin(k * Math.PI * 3) * (1 - k) * 0.22;
            obj.scale.y = sy * (1 - w);
            obj.scale.x = obj.scale.z = sx * (1 + w * 0.5);
        });
    };
    let carBusy = false;
    const driveCar = async () => {
        const car = placed.car && placed.car.root;
        if (!car || carBusy) return;
        carBusy = true;
        sfx.vroom();
        const x0 = car.position.x;
        await tween(700, (k) => { car.position.x = x0 + ease(k) * 0.26; });
        await tween(700, (k) => { car.position.x = x0 + 0.26 - ease(k) * 0.26; });
        carBusy = false;
    };

    /* ---------------------------------------------------------------- camera flights */
    let flight = null;
    const flyTo = (pos, quat, ms = 1000, lift = 0.3) => new Promise((resolve) => {
        const from = camera.position.clone();
        const mid = from.clone().lerp(pos, 0.5);
        mid.y += lift;
        flight = { from, mid, to: pos.clone(), qFrom: camera.quaternion.clone(), qTo: quat.clone(), t0: performance.now(), ms, resolve };
    });
    const stepFlight = (now) => {
        if (!flight) return;
        const k = Math.min(1, (now - flight.t0) / flight.ms);
        const e = ease(k);
        // quadratic Bézier so the camera arcs over furniture on the way
        const a = flight.from, b = flight.mid, c = flight.to;
        camera.position.set(
            (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * b.x + e * e * c.x,
            (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * b.y + e * e * c.y,
            (1 - e) * (1 - e) * a.z + 2 * (1 - e) * e * b.z + e * e * c.z,
        );
        camera.quaternion.slerpQuaternions(flight.qFrom, flight.qTo, e);
        if (k >= 1) {
            const done2 = flight.resolve;
            flight = null;
            done2();
        }
    };

    const lookQuat = (pos, target) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pos, target, new THREE.Vector3(0, 1, 0)));
    const poseQuat = (yaw, pitch) => new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));

    // Stand far enough back that the screen fills most of the view.
    const screenPose = (key) => {
        const group = room.screens[key];
        const spec = SCREENS[key];
        group.updateWorldMatrix(true, false);
        const center = new THREE.Vector3().setFromMatrixPosition(group.matrixWorld);
        const normal = new THREE.Vector3(0, 0, 1).transformDirection(group.matrixWorld);
        const vHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const hHalf = vHalf * camera.aspect;
        const fill = 0.8;
        const d = Math.max(spec.h / 2 / (vHalf * fill), spec.w / 2 / (hHalf * fill));
        const pos = center.clone().addScaledVector(normal, Math.min(d, key === 'tv' ? 2.9 : 1.6));
        return { pos, quat: lookQuat(pos, center) };
    };

    /* ---------------------------------------------------------------- controls */
    const controls = createControls({
        camera,
        dom: canvas,
        colliders: room.colliders,
        joystick,
        touch,
        onLockChange: (locked, info) => onLock(locked, info),
        onTap: (x, y) => tap(x, y),
        onUse: () => useTarget(),
        onStep: (k) => sfx.step(k),
        onMoveWhileSeated: () => { if (state.mode === 'armchair') standUp(); },
    });

    const sit = async (kind) => {
        if (state.mode !== 'walk') return;
        state.returnPose = controls.getPose();
        state.pending = null;
        controls.setEnabled(false);
        if (kind !== 'armchair') controls.unlock();
        state.mode = 'flying';
        setTarget(null);
        onMode('flying', kind);
        sfx.whoosh();
        if (kind === 'armchair') {
            await flyTo(new THREE.Vector3(ARMCHAIR.x, ARMCHAIR.y, ARMCHAIR.z), poseQuat(ARMCHAIR.yaw, ARMCHAIR.pitch), 1000, 0.25);
            controls.setPose({ ...ARMCHAIR, sit: true });
            controls.setEnabled(true);
        } else {
            const pose = screenPose(kind);
            await flyTo(pose.pos, pose.quat, 1150, kind === 'pc' ? 0.35 : 0.15);
            canvas.classList.add('is-through');
            if (kind === 'pc') sfx.boot(); else sfx.tvOn();
        }
        state.mode = kind;
        onMode(kind);
    };

    const standUp = async () => {
        if (!['pc', 'tv', 'armchair'].includes(state.mode)) return;
        canvas.classList.remove('is-through');
        controls.setEnabled(false);
        state.mode = 'flying';
        onMode('flying', 'walk');
        const p = state.returnPose || SPAWN;
        await flyTo(new THREE.Vector3(p.x, controls.EYE, p.z), poseQuat(p.yaw, p.pitch), 850, 0.1);
        controls.setPose({ x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch });
        controls.setEnabled(true);
        state.mode = 'walk';
        onMode('walk');
    };

    /* ---------------------------------------------------------------- aiming */
    const raycaster = new THREE.Raycaster();
    raycaster.far = 30;
    const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
    const interactOf = (o) => { for (let n = o; n; n = n.parent) if (n.userData.interact) return n.userData.interact; return null; };
    const pick = (ndc) => {
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(room.interactive, false);
        let proxyHit = null;
        for (const h of hits) {
            if (!shown(h.object)) continue;
            const id = interactOf(h.object);
            // A model's box can hide a star tucked behind it; let the star win.
            if (h.object.userData.proxy && !proxyHit) { proxyHit = { id, point: h.point, distance: h.distance, object: h.object }; continue; }
            if (proxyHit) {
                if (id && id.startsWith('star-') && h.distance - proxyHit.distance < 0.9) return { id, point: h.point, distance: h.distance, object: h.object };
                return proxyHit;
            }
            return { id, point: h.point, distance: h.distance, object: h.object };
        }
        return proxyHit;
    };

    const labelFor = (id) => {
        if (!id) return '';
        if (id.startsWith('star-')) return 'Collect the star ★';
        switch (id) {
            case 'pc': case 'chair': return 'Use the PC';
            case 'tv': case 'sofa': return 'Watch TV';
            case 'phone': return 'Check the phone';
            case 'boombox': return isMusicOn() ? 'Pause the music' : 'Play music';
            case 'switch': return state.lights ? 'Turn the lights off' : 'Turn the lights on';
            case 'window': return state.night ? 'Wait for the morning' : 'Wait for the night';
            case 'neon': return 'Change the neon colour';
            case 'door': return 'Open the door';
            case 'poster-nexustv': return 'Look at NexusTV';
            case 'poster-steam': return 'Look at Steam Switcher';
            case 'poster-honcho': return 'Watch Honcho on the TV';
            case 'armchair': return 'Sit down';
            case 'plant': return 'Touch the plant';
            case 'lamp': return state.lamp ? 'Turn the lamp off' : 'Turn the lamp on';
            case 'pouf': return 'Poke the pouf';
            case 'bottle': return 'Drink some water';
            case 'camera': return 'Take a photo';
            case 'car': return 'Drive the toy car';
            case 'trophy': return 'Admire the trophy';
            default: return '';
        }
    };

    const setTarget = (hit) => {
        const id = hit && hit.id && hit.distance <= reachFor(hit.id) ? hit.id : null;
        const label = labelFor(id);
        if (state.target && state.target.id === id && state.target.label === label) return;
        state.target = id ? { id, label } : null;
        onTarget(state.target);
    };

    const use = (id) => {
        if (!id || state.mode === 'flying' || state.mode === 'attract') return;
        if (id.startsWith('star-')) { collectStar(Number(id.slice(5))); return; }
        const seat = { pc: 'pc', chair: 'pc', tv: 'tv', sofa: 'tv', 'poster-honcho': 'tv', armchair: 'armchair' }[id];
        if (seat) {
            if (state.mode === 'armchair' && seat !== 'armchair') standUp().then(() => sit(seat));
            else if (state.mode === 'walk') sit(seat);
            return;
        }
        switch (id) {
            case 'switch': setLights(!state.lights); sfx.click(); break;
            case 'window': setNight(!state.night, { sound: true }); break;
            case 'neon': cycleNeon(); break;
            case 'lamp': setLamp(!state.lamp); sfx.click(); break;
            case 'plant': wiggle(placed.plant && placed.plant.root, 0.06); sfx.rustle(); break;
            case 'pouf': squish(placed.pouf && placed.pouf.root); sfx.bloop(); break;
            case 'bottle': wiggle(placed.bottle && placed.bottle.root, 0.2); sfx.gulp(); break;
            case 'car': driveCar(); break;
            case 'trophy': sfx.fanfare(); break;
            case 'camera': sfx.shutter(); break;
            case 'door': sfx.knock(); break;
            default: sfx.blip();
        }
        onInteract(id);
    };

    const useTarget = () => {
        if (state.mode !== 'walk' && state.mode !== 'armchair') return;
        if (state.target) use(state.target.id);
    };

    const ndc = new THREE.Vector2();
    const toNdc = (x, y) => {
        const box = canvas.getBoundingClientRect();
        ndc.set(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1);
        return ndc;
    };
    const tap = (x, y) => {
        if (state.mode !== 'walk' && state.mode !== 'armchair') return;
        sfx.unlock();
        const hit = pick(toNdc(x, y));
        if (!hit) return;
        if (hit.id) {
            const reach = reachFor(hit.id) + 1.3;
            if (hit.distance <= reach) { use(hit.id); return; }
            if (state.mode !== 'walk') return;
            // too far: walk over there first, then use it
            const from = camera.position;
            const dir = new THREE.Vector3(hit.point.x - from.x, 0, hit.point.z - from.z);
            const len = dir.length();
            dir.normalize();
            const stop = Math.max(0, len - 1.1);
            controls.walkTo(from.x + dir.x * stop, from.z + dir.z * stop);
            state.pending = { id: hit.id, point: hit.point.clone() };
        } else if (hit.object.userData.floor && state.mode === 'walk') {
            controls.walkTo(hit.point.x, hit.point.z);
            state.pending = null;
        }
    };

    let hover = null;   // mouse position when looking around by dragging
    canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !controls.isLocked()) hover = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerleave', () => { hover = null; });

    /* ---------------------------------------------------------------- resize */
    const resize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const aspect = w / h;
        camera.aspect = aspect;
        // keep a sensible horizontal field of view on tall phone screens
        const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(33)) / aspect);
        camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(hFov), 58, 80);
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        css.setSize(w, h);
        if (state.mode === 'pc' || state.mode === 'tv') {
            const pose = screenPose(state.mode);
            camera.position.copy(pose.pos);
            camera.quaternion.copy(pose.quat);
        }
    };
    window.addEventListener('resize', resize);
    resize();

    /* ---------------------------------------------------------------- attract view (behind the start screen) */
    camera.position.copy(ATTRACT.pos);
    camera.quaternion.copy(lookQuat(ATTRACT.pos, ATTRACT.look));
    const attractQuat = camera.quaternion.clone();

    renderer.shadowMap.needsUpdate = true;
    try { await renderer.compileAsync(scene, camera); } catch { /* older browsers compile on first render */ }

    /* ---------------------------------------------------------------- loop */
    const clock = new THREE.Clock();
    let fpsTime = 0, fpsFrames = 0, slowWindows = 0, fastWindows = 0;
    const tmpQ = new THREE.Quaternion();
    const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
    let frameCount = 0;
    let firstFrame = true;

    const frame = () => {
        const dt = Math.min(0.05, clock.getDelta());
        const t = clock.elapsedTime;
        const now = performance.now();
        frameCount++;

        if (state.mode === 'attract') {
            tmpE.set(Math.sin(t * 0.21) * 0.02, Math.sin(t * 0.13) * 0.07, 0);
            tmpQ.setFromEuler(tmpE);
            camera.quaternion.copy(attractQuat).multiply(tmpQ);
        } else if (flight) {
            stepFlight(now);
        } else if (state.mode === 'walk' || state.mode === 'armchair') {
            controls.update(dt);
        }

        // tweens (little object animations)
        for (let i = tweens.length - 1; i >= 0; i--) {
            const tw = tweens[i];
            const k = Math.min(1, (now - tw.t0) / tw.ms);
            tw.fn(k);
            if (k >= 1) { tweens.splice(i, 1); tw.resolve(); }
        }

        // what am I looking at?
        if ((state.mode === 'walk' || state.mode === 'armchair') && !flight && frameCount % 2 === 0) {
            if (controls.isLocked() || touch || !hover) setTarget(pick(ndc.set(0, 0)));
            else setTarget(pick(toNdc(hover.x, hover.y)));
            canvas.classList.toggle('is-pointing', !!state.target && !controls.isLocked());
        }
        // finish a tap-to-walk by using the thing
        if (state.pending && state.mode === 'walk') {
            const p = state.pending;
            const d = Math.hypot(p.point.x - camera.position.x, p.point.z - camera.position.z);
            if (d <= reachFor(p.id) + 0.4) { state.pending = null; use(p.id); }
            else if (!controls.walking) state.pending = null;
        }

        // living details
        const level = getLevel();
        anim.rgb.color.setHSL((t * 0.06) % 1, 1, 0.55);
        if (anim.towerGlow) anim.towerGlow.color.copy(anim.rgb.color);
        anim.keyboard.emissiveIntensity = 0.45 + Math.sin(t * 1.7) * 0.12 + level * 0.4;
        const ledHue = state.golden ? 0.12 : 0.75 + Math.sin(t * 0.15) * 0.08 + (state.disco > 0 ? t * 0.6 : 0);
        anim.led.strip.color.setHSL(ledHue % 1, 0.85, 0.6);
        anim.led.wash.color.copy(anim.led.strip.color);
        anim.led.wash.opacity = (state.lights ? 0.1 : 0.26) + level * 0.18;
        anim.bias.opacity = (state.lights ? 0.25 : 0.45) + level * 0.2;
        let neonOn = 1;
        if (neonFlicker > 0) {
            neonFlicker -= dt;
            neonOn = Math.random() > 0.45 ? 1 : 0.15;
        } else if (Math.random() < 0.002) {
            neonFlicker = 0.12;
        }
        anim.neon.tube.opacity = neonOn;
        anim.neon.glow.opacity = (0.55 + level * 0.35) * neonOn;
        lights.neon.intensity = (state.lights ? 1.2 : 2.4) * neonOn * (1 + level * 0.5);
        if (placed.boombox) {
            const s = placed.boombox.root.userData.baseScale || (placed.boombox.root.userData.baseScale = placed.boombox.root.scale.x);
            placed.boombox.root.scale.setScalar(s * (1 + level * 0.05));
        }
        if (state.disco > 0) state.disco -= dt;
        room.stars.forEach((s) => {
            if (!s.group.visible) return;
            if (s.popAt) {
                const k = Math.min(1, (now - s.popAt) / 550);
                s.group.scale.setScalar(1 + k * 0.9);
                s.sprite.material.opacity = 0.6 * (1 - k);
                s.mesh.rotation.y += dt * 14;
                if (k >= 1) s.group.visible = false;
                return;
            }
            s.mesh.rotation.y = t * 1.6 + s.phase;
            s.group.position.y = s.base + Math.sin(t * 2 + s.phase) * 0.02;
            s.sprite.material.opacity = 0.4 + Math.sin(t * 3 + s.phase) * 0.15;
        });
        if (room.trophy.visible) room.trophy.rotation.y = t * 0.5;

        renderer.render(scene, camera);
        cssCamera.position.copy(camera.position).multiplyScalar(CSS_SCALE);
        cssCamera.quaternion.copy(camera.quaternion);
        if (cssCamera.fov !== camera.fov || cssCamera.aspect !== camera.aspect) {
            cssCamera.fov = camera.fov;
            cssCamera.aspect = camera.aspect;
            cssCamera.near = camera.near * CSS_SCALE;
            cssCamera.far = camera.far * CSS_SCALE;
            cssCamera.updateProjectionMatrix();
        }
        css.render(cssScene, cssCamera);
        if (firstFrame) { firstFrame = false; canvas.dispatchEvent(new CustomEvent('room:frame', { bubbles: true })); }

        // adaptive resolution: trade sharpness for smoothness on slow devices
        fpsTime += dt;
        fpsFrames++;
        if (fpsTime >= 2) {
            const fps = fpsFrames / fpsTime;
            onFps(fps);
            if (state.mode !== 'attract') {
                slowWindows = fps < 34 ? slowWindows + 1 : 0;
                fastWindows = fps > 57 ? fastWindows + 1 : 0;
                if (slowWindows >= 2 && pixelRatio > 0.6) {
                    pixelRatio = Math.max(0.6, pixelRatio * 0.82);
                    renderer.setPixelRatio(pixelRatio);
                    slowWindows = 0;
                } else if (fastWindows >= 3 && pixelRatio < Math.min(window.devicePixelRatio || 1, maxRatio)) {
                    pixelRatio = Math.min(Math.min(window.devicePixelRatio || 1, maxRatio), pixelRatio * 1.12);
                    renderer.setPixelRatio(pixelRatio);
                    fastWindows = 0;
                }
            }
            fpsTime = 0;
            fpsFrames = 0;
        }
    };
    renderer.setAnimationLoop(frame);

    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        canvas.dispatchEvent(new CustomEvent('room:lost', { bubbles: true }));
    });

    /* ---------------------------------------------------------------- public API */
    const enter = async () => {
        if (state.mode !== 'attract') return;
        state.mode = 'flying';
        sfx.unlock();
        controls.setPose({ ...SPAWN });
        await flyTo(new THREE.Vector3(SPAWN.x, controls.EYE, SPAWN.z), poseQuat(SPAWN.yaw, SPAWN.pitch), 1400, 0.15);
        controls.setEnabled(true);
        state.mode = 'walk';
        onMode('walk');
    };

    return {
        enter,
        lock: () => controls.lock(),
        unlock: () => controls.unlock(),
        isLocked: () => controls.isLocked(),
        pause(on) {
            if (state.mode === 'walk' || state.mode === 'armchair') controls.setEnabled(!on);
        },
        use,
        useTarget,
        sit,
        standUp,
        get mode() { return state.mode; },
        get target() { return state.target; },
        get dragMode() { return controls.dragMode; },
        set dragMode(v) { controls.dragMode = v; },
        setSensitivity: (v) => controls.setSensitivity(v),
        toggleLights: () => use('switch'),
        toggleNight: () => use('window'),
        isNight: () => state.night,
        lightsOn: () => state.lights,
        cycleNeon,
        disco() { state.disco = 12; cycleNeon(); },
        setGolden,
        setPhoneNote(text) { phoneNote = String(text || ''); drawPhone(); },
        screen: (key) => screenObjects[key] && screenObjects[key].wrap,
        // Where a screen is on the page right now (used to lay the real page
        // exactly over the 3D screen while sitting in front of it).
        screenRect(key) {
            const group = room.screens[key];
            const spec = SCREENS[key];
            group.updateWorldMatrix(true, false);
            camera.updateMatrixWorld();
            const w = window.innerWidth, h = window.innerHeight;
            const xs = [], ys = [];
            [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
                const p = new THREE.Vector3(sx * spec.w / 2, sy * spec.h / 2, 0).applyMatrix4(group.matrixWorld).project(camera);
                xs.push((p.x + 1) / 2 * w);
                ys.push((1 - p.y) / 2 * h);
            });
            const left = Math.min(...xs), top = Math.min(...ys);
            return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top, px: spec.px };
        },
        snapshot() {
            renderer.render(scene, camera);
            return canvas.toDataURL('image/jpeg', 0.92);
        },
        get fps() { return fpsFrames / Math.max(fpsTime, 0.001); },
        debug: { scene, camera, renderer, room, placed, controls, state, pick: (x = 0, y = 0) => pick(new THREE.Vector2(x, y)), hover: () => hover },
    };
}
