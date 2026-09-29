// Builds Gabytzu's room: walls with real window/door openings, furniture, lights, stars.
// Units are metres. The room spans x -3.5..3.5, z -3..3, floor at y 0, ceiling at 2.8.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';

export const ROOM = { x0: -3.5, x1: 3.5, z0: -3, z1: 3, h: 2.8, wall: 0.16 };

// Where the in-world screens are (DOM gets mapped onto these with CSS3D).
export const SCREENS = {
    pc: { w: 0.6, h: 0.3375, px: [1280, 720] },
    side: { w: 0.3375, h: 0.6, px: [540, 960] },
    tv: { w: 1.43, h: 0.8044, px: [1280, 720] },
    phone: { w: 0.068, h: 0.146, px: [360, 780] },
};

/* ---------------------------------------------------------------- helpers */

// Give a world-space geometry UVs from its own positions (per-face planar
// mapping), so textures keep real-world scale across separate wall pieces.
const worldUV = (geometry, tileU, tileV = tileU) => {
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
        const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (ny >= nx && ny >= nz) uv.setXY(i, x / tileU, z / tileV);
        else if (nx >= nz) uv.setXY(i, z / tileU, y / tileV);
        else uv.setXY(i, x / tileU, y / tileV);
    }
    uv.needsUpdate = true;
    return geometry;
};

// Axis-aligned box given by its min/max corners, already in world space.
const slab = (x0, x1, y0, y1, z0, z1) => {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return g;
};

export function buildRoom({ scene, tex, quality = 'high', renderer }) {
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const colliders = [];
    const interactive = [];   // meshes that can be targeted (solid or interactive)
    const anim = {};          // things the loop animates
    const lights = {};
    const glowTex = T.glow();
    const blobTex = T.blobShadow();

    const add = (mesh, { cast = true, receive = true, parent = scene, solid = false, interact = null } = {}) => {
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        if (interact) mesh.userData.interact = interact;
        if (solid || interact) interactive.push(mesh);
        parent.add(mesh);
        return mesh;
    };
    const rbox = (w, h, d, r = 0.01, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));
    const collide = (x0, x1, z0, z1) => colliders.push({ x0, x1, z0, z1 });
    const blob = (x, z, w, d, y = 0.003, opacity = 0.75) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity, color: 0x000000, toneMapped: false }));
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, y, z);
        m.renderOrder = -1;
        scene.add(m);
        return m;
    };
    const glowSprite = (color, size, opacity = 0.6) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        s.scale.setScalar(size);
        return s;
    };
    const setTex = (t, { srgb = true, repeat = null } = {}) => {
        if (!t) return t;
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = maxAniso;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        if (repeat) t.repeat.set(...repeat);
        return t;
    };

    /* ---------------------------------------------------------------- materials */
    setTex(tex.floorColor);
    setTex(tex.floorBump, { srgb: false });
    setTex(tex.floorRough, { srgb: false });
    setTex(tex.brickColor);
    setTex(tex.brickBump, { srgb: false });
    setTex(tex.brickRough, { srgb: false });
    setTex(tex.deskWood);

    const wallPlaster = T.plaster('#d9d3ca', { repeat: [1, 1], seed: 5 });
    const ceilPlaster = T.plaster('#f7f5f1', { repeat: [1, 1], seed: 9 });
    const M = {
        floor: new THREE.MeshPhysicalMaterial({ map: tex.floorColor, bumpMap: tex.floorBump, bumpScale: 1.2, roughnessMap: tex.floorRough, roughness: 0.9, clearcoat: 0.18, clearcoatRoughness: 0.28, color: 0xe9ddd0 }),
        brick: new THREE.MeshStandardMaterial({ map: tex.brickColor, bumpMap: tex.brickBump, bumpScale: 2.2, roughnessMap: tex.brickRough, roughness: 1, color: 0xd9cfc9 }),
        plaster: new THREE.MeshStandardMaterial({ map: wallPlaster.map, bumpMap: wallPlaster.bump, bumpScale: 0.6, roughness: 0.94 }),
        ceiling: new THREE.MeshStandardMaterial({ map: ceilPlaster.map, bumpMap: ceilPlaster.bump, bumpScale: 0.15, roughness: 0.96 }),
        paint: new THREE.MeshStandardMaterial({ color: 0xf1eee8, roughness: 0.45 }),
        walnut: new THREE.MeshPhysicalMaterial({ map: tex.deskWood, roughness: 0.52, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
        blackMetal: new THREE.MeshStandardMaterial({ color: 0x1d1e22, metalness: 0.75, roughness: 0.38 }),
        alu: new THREE.MeshStandardMaterial({ color: 0xc8cbd1, metalness: 1, roughness: 0.28 }),
        chrome: new THREE.MeshStandardMaterial({ color: 0xe6e8ec, metalness: 1, roughness: 0.12 }),
        plastic: new THREE.MeshPhysicalMaterial({ color: 0x0f1013, roughness: 0.4, clearcoat: 0.25, clearcoatRoughness: 0.35 }),
        matteBlack: new THREE.MeshStandardMaterial({ color: 0x131417, roughness: 0.7 }),
        glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 }),
        tintedGlass: new THREE.MeshPhysicalMaterial({ color: 0x9aa4b8, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, envMapIntensity: 1.6 }),
        leather: new THREE.MeshPhysicalMaterial({ color: 0x17171b, roughness: 0.48, clearcoat: 0.18, clearcoatRoughness: 0.45, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x3a3a44) }),
        leatherRed: new THREE.MeshPhysicalMaterial({ color: 0xa3102f, roughness: 0.5, clearcoat: 0.15, sheen: 0.3, sheenColor: new THREE.Color(0x551020) }),
        curtain: new THREE.MeshPhysicalMaterial({ color: 0x2c3548, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0x7d89a6), sheenRoughness: 0.55, side: THREE.DoubleSide }),
        hole: new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, side: THREE.FrontSide }),
        pcb: new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.6, metalness: 0.2 }),
    };
    M.floor.bumpMap.repeat.copy(M.floor.map.repeat);

    /* ---------------------------------------------------------------- shell */
    const { x0, x1, z0, z1, h, wall: t } = ROOM;
    const W = x1 - x0, D = z1 - z0;

    // floor (planks run along x; the photo covers 2.4 m x 1.2 m)
    const floorGeo = worldUV(slab(x0 - t, x1 + t, -0.05, 0, z0 - t, z1 + t), 2.4, 1.2);
    add(new THREE.Mesh(floorGeo, M.floor), { cast: false, solid: true }).userData.floor = true;
    // ceiling
    add(new THREE.Mesh(worldUV(slab(x0 - t, x1 + t, h, h + 0.1, z0 - t, z1 + t), 2.5), M.ceiling), { receive: true, solid: true });

    // north wall: exposed brick
    add(new THREE.Mesh(worldUV(slab(x0 - t, x1 + t, 0, h, z0 - t, z0), 2.2), M.brick), { solid: true });
    // west wall
    add(new THREE.Mesh(worldUV(slab(x0 - t, x0, 0, h, z0, z1), 2.5), M.plaster), { solid: true });
    // east wall with the window opening (z -1..1, y 0.9..2.4)
    const win = { z0: -1, z1: 1, y0: 0.9, y1: 2.4 };
    [
        slab(x1, x1 + t, 0, h, z0, win.z0),
        slab(x1, x1 + t, 0, h, win.z1, z1),
        slab(x1, x1 + t, 0, win.y0, win.z0, win.z1),
        slab(x1, x1 + t, win.y1, h, win.z0, win.z1),
    ].forEach((g) => add(new THREE.Mesh(worldUV(g, 2.5), M.plaster), { solid: true }));
    // south wall with the door opening (x -2.75..-1.85, up to 2.05)
    const door = { x0: -2.75, x1: -1.85, y1: 2.05 };
    [
        slab(x0 - t, door.x0, 0, h, z1, z1 + t),
        slab(door.x1, x1 + t, 0, h, z1, z1 + t),
        slab(door.x0, door.x1, door.y1, h, z1, z1 + t),
    ].forEach((g) => add(new THREE.Mesh(worldUV(g, 2.5), M.plaster), { solid: true }));

    // baseboards
    const bb = 0.09, bt = 0.014;
    [
        slab(x0, x1, 0, bb, z0, z0 + bt),
        slab(x0, x0 + bt, 0, bb, z0, z1),
        slab(x1 - bt, x1, 0, bb, z0, z1),
        slab(x0, door.x0, 0, bb, z1 - bt, z1),
        slab(door.x1, x1, 0, bb, z1 - bt, z1),
    ].forEach((g) => add(new THREE.Mesh(g, M.paint), { cast: false }));

    collide(-99, x0 + 0.02, -99, 99);
    collide(x1 - 0.02, 99, -99, 99);
    collide(-99, 99, -99, z0 + 0.02);
    collide(-99, 99, z1 - 0.02, 99);

    /* ---------------------------------------------------------------- window */
    const winGroup = new THREE.Group();
    scene.add(winGroup);
    const frameDepth = 0.07;
    const fx = x1 + t * 0.5;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2c31, metalness: 0.6, roughness: 0.35 });
    [
        slab(fx - frameDepth / 2, fx + frameDepth / 2, win.y0, win.y0 + 0.06, win.z0, win.z1),
        slab(fx - frameDepth / 2, fx + frameDepth / 2, win.y1 - 0.06, win.y1, win.z0, win.z1),
        slab(fx - frameDepth / 2, fx + frameDepth / 2, win.y0, win.y1, win.z0, win.z0 + 0.06),
        slab(fx - frameDepth / 2, fx + frameDepth / 2, win.y0, win.y1, win.z1 - 0.06, win.z1),
        slab(fx - frameDepth / 2, fx + frameDepth / 2, win.y0, win.y1, -0.025, 0.025),
    ].forEach((g) => add(new THREE.Mesh(g, frameMat), { parent: winGroup, interact: 'window' }));
    const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(win.z1 - win.z0, win.y1 - win.y0), M.glass);
    glassPane.rotation.y = -Math.PI / 2;
    glassPane.position.set(fx, (win.y0 + win.y1) / 2, 0);
    add(glassPane, { cast: false, receive: false, parent: winGroup, interact: 'window' });
    // interior sill
    add(new THREE.Mesh(rbox(0.26, 0.035, 2.24, 0.006), M.paint), { interact: 'window' }).position.set(x1 - 0.06, win.y0 - 0.017, 0);
    // curtains with folds + rod
    const curtain = (zc) => {
        const g = new THREE.PlaneGeometry(0.62, 2.55, 40, 1);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 36) * 0.035 + Math.sin(p.getX(i) * 13) * 0.02);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, M.curtain);
        m.rotation.y = -Math.PI / 2;
        m.position.set(x1 - 0.12, 2.6 - 2.55 / 2, zc);
        add(m, { solid: true });
    };
    curtain(win.z0 - 0.36);
    curtain(win.z1 + 0.36);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 3.1, 12), M.blackMetal);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(x1 - 0.1, 2.6, 0);
    add(rod, { cast: false });

    /* ---------------------------------------------------------------- door + switch */
    const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(door.x1 - door.x0 - 0.01, door.y1 - 0.01, 0.045), [M.paint, M.paint, M.paint, M.paint, new THREE.MeshStandardMaterial({ map: T.doorPaint(), roughness: 0.45 }), M.paint]);
    doorLeaf.position.set((door.x0 + door.x1) / 2, (door.y1 - 0.01) / 2, z1 + 0.04);
    doorLeaf.material[4].map.flipY = true;
    add(doorLeaf, { interact: 'door' });
    const casing = [
        slab(door.x0 - 0.07, door.x0, 0, door.y1 + 0.07, z1 - 0.02, z1),
        slab(door.x1, door.x1 + 0.07, 0, door.y1 + 0.07, z1 - 0.02, z1),
        slab(door.x0 - 0.07, door.x1 + 0.07, door.y1, door.y1 + 0.07, z1 - 0.02, z1),
    ];
    casing.forEach((g) => add(new THREE.Mesh(g, M.paint), { interact: 'door' }));
    const handle = new THREE.Group();
    const hRose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.012, 24), M.chrome);
    hRose.rotation.x = Math.PI / 2;
    const hLever = new THREE.Mesh(rbox(0.13, 0.018, 0.02, 0.008), M.chrome);
    hLever.position.set(0.055, 0, -0.03);
    handle.add(hRose, hLever);
    handle.position.set(door.x1 - 0.1, 1.0, z1 + 0.01);
    handle.children.forEach((c) => add(c, { parent: handle, interact: 'door' }));
    scene.add(handle);

    const sw = new THREE.Group();
    const plate = new THREE.Mesh(rbox(0.08, 0.12, 0.012, 0.004), M.paint);
    const rocker = new THREE.Mesh(rbox(0.032, 0.05, 0.012, 0.003), new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.3 }));
    rocker.position.z = -0.008;
    sw.add(plate, rocker);
    sw.position.set(-1.62, 1.2, z1 - 0.006);
    sw.children.forEach((c) => add(c, { parent: sw, interact: 'switch' }));
    scene.add(sw);
    anim.switchRocker = rocker;

    /* ---------------------------------------------------------------- desk + PC setup (north wall) */
    const deskTop = 0.7575;
    const desk = new THREE.Group();
    scene.add(desk);
    add(new THREE.Mesh(rbox(1.8, 0.035, 0.75, 0.008), M.walnut), { parent: desk, interact: 'pc' }).position.set(0, deskTop - 0.0175, -2.605);
    [[-0.86, -2.29], [0.86, -2.29], [-0.86, -2.93], [0.86, -2.93]].forEach(([lx, lz]) => {
        add(new THREE.Mesh(rbox(0.045, deskTop - 0.035, 0.045, 0.006), M.blackMetal), { parent: desk, solid: true }).position.set(lx, (deskTop - 0.035) / 2, lz);
    });
    add(new THREE.Mesh(rbox(1.7, 0.05, 0.03, 0.005), M.blackMetal), { parent: desk }).position.set(0, 0.2, -2.93);
    collide(-0.93, 0.93, -3.0, -2.2);
    blob(0, -2.6, 2.1, 1.0, 0.003, 0.5);

    // desk mat
    add(new THREE.Mesh(rbox(0.92, 0.004, 0.4, 0.002), new THREE.MeshStandardMaterial({ color: 0x15161c, roughness: 0.95 })), { parent: desk, cast: false }).position.set(0.05, deskTop + 0.002, -2.45);

    // main monitor (27")
    const mon = new THREE.Group();
    mon.position.set(0, 1.13, -2.79);
    desk.add(mon);
    add(new THREE.Mesh(rbox(0.625, 0.372, 0.026, 0.006), M.plastic), { parent: mon, interact: 'pc' });
    add(new THREE.Mesh(rbox(0.42, 0.26, 0.045, 0.02), M.matteBlack), { parent: mon }).position.z = -0.03;
    add(new THREE.Mesh(rbox(0.045, 0.3, 0.025, 0.006), M.alu), { parent: mon }).position.set(0, -0.2, -0.055);
    add(new THREE.Mesh(rbox(0.24, 0.012, 0.17, 0.005), M.alu), { parent: desk }).position.set(0, deskTop + 0.006, -2.8);
    const pcScreen = new THREE.Group();
    pcScreen.position.z = 0.0135;
    mon.add(pcScreen);

    // side monitor (portrait, angled toward the chair)
    const side = new THREE.Group();
    side.position.set(0.66, 1.2, -2.7);
    side.rotation.y = -0.5;
    desk.add(side);
    add(new THREE.Mesh(rbox(0.36, 0.625, 0.024, 0.006), M.plastic), { parent: side, interact: 'pc' });
    add(new THREE.Mesh(rbox(0.04, 0.3, 0.025, 0.006), M.alu), { parent: side }).position.set(0, -0.28, -0.04);
    add(new THREE.Mesh(rbox(0.2, 0.012, 0.15, 0.005), M.alu), { parent: desk }).position.set(0.7, deskTop + 0.006, -2.76);
    const sideScreen = new THREE.Group();
    sideScreen.position.z = 0.0125;
    side.add(sideScreen);

    // keyboard
    const kb = T.keyboard();
    const kbGroup = new THREE.Group();
    kbGroup.position.set(0, deskTop + 0.011, -2.43);
    desk.add(kbGroup);
    add(new THREE.Mesh(rbox(0.44, 0.022, 0.145, 0.006), M.blackMetal), { parent: kbGroup, interact: 'pc' });
    const kbTopMat = new THREE.MeshStandardMaterial({ map: kb.map, emissiveMap: kb.emissive, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.55 });
    const kbTop = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.134), kbTopMat);
    kbTop.rotation.x = -Math.PI / 2;
    kbTop.position.y = 0.0115;
    add(kbTop, { parent: kbGroup, cast: false, interact: 'pc' });
    anim.keyboard = kbTopMat;

    // mouse
    const mouse = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0x111215, roughness: 0.3, clearcoat: 0.6 }));
    mouse.scale.set(0.032, 0.018, 0.058);
    mouse.position.set(0.34, deskTop + 0.012, -2.42);
    add(mouse, { parent: desk, interact: 'pc' });
    const mouseLed = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.002, 0.04), new THREE.MeshBasicMaterial({ color: 0x22d3ee, toneMapped: false }));
    mouseLed.position.set(0.34, deskTop + 0.03, -2.42);
    desk.add(mouseLed);

    // phone lying on the desk
    const phone = new THREE.Group();
    phone.position.set(-0.36, deskTop + 0.005, -2.4);
    phone.rotation.set(-Math.PI / 2, 0, 0.35);
    desk.add(phone);
    add(new THREE.Mesh(rbox(0.074, 0.156, 0.009, 0.009), new THREE.MeshPhysicalMaterial({ color: 0x1a1b20, metalness: 0.6, roughness: 0.3, clearcoat: 1 })), { parent: phone, interact: 'phone' });
    const phoneScreen = new THREE.Group();
    phoneScreen.position.z = 0.0048;
    phone.add(phoneScreen);

    // PC tower on the desk: solid back/left/top/bottom, tempered glass on the
    // two sides that face the room so the RGB parts inside are visible.
    const tower = new THREE.Group();
    tower.position.set(-0.7, deskTop + 0.235, -2.64);
    desk.add(tower);
    const tw = 0.21, th = 0.47, td = 0.44, pt = 0.006;
    const towerPart = (w, hh, d, x, y, z) => add(new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), M.blackMetal), { parent: tower, interact: 'pc' }).position.set(x, y, z);
    towerPart(pt, th, td, -tw / 2 + pt / 2, 0, 0);               // left
    towerPart(tw, pt, td, 0, th / 2 - pt / 2, 0);                // top
    towerPart(tw, 0.014, td, 0, -th / 2 + 0.007, 0);             // bottom
    towerPart(tw, th, pt, 0, 0, -td / 2 + pt / 2);               // back
    towerPart(0.012, th, 0.012, tw / 2 - 0.006, 0, td / 2 - 0.006);  // front-right pillar
    towerPart(0.012, th, 0.012, tw / 2 - 0.006, 0, -td / 2 + 0.006); // back-right pillar
    towerPart(0.012, 0.012, td, tw / 2 - 0.006, th / 2 - 0.006, 0);  // top-right rail
    towerPart(0.012, 0.03, td, tw / 2 - 0.006, -th / 2 + 0.015, 0);  // bottom-right rail
    towerPart(tw, 0.03, 0.012, 0, -th / 2 + 0.015, td / 2 - 0.006);  // bottom-front rail
    const glassSide = new THREE.Mesh(new THREE.PlaneGeometry(td - 0.01, th - 0.01), M.tintedGlass);
    glassSide.rotation.y = Math.PI / 2;
    glassSide.position.x = tw / 2 + 0.001;
    add(glassSide, { parent: tower, cast: false, receive: false, interact: 'pc' });
    const rgb = new THREE.MeshBasicMaterial({ color: 0xff00aa, toneMapped: false });
    anim.rgb = rgb;
    // components
    const mobo = new THREE.Mesh(new THREE.BoxGeometry(0.01, th - 0.08, td - 0.08), M.pcb);
    mobo.position.x = -tw / 2 + 0.02;
    tower.add(mobo);
    [-0.14, 0, 0.14].forEach((fy) => {
        const blades = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), M.matteBlack);
        blades.position.set(0, fy, td / 2 - 0.016);
        tower.add(blades);
    });
    const gpu = new THREE.Mesh(rbox(0.05, 0.11, 0.3, 0.006), M.matteBlack);
    gpu.position.set(0.01, -0.03, 0.02);
    tower.add(gpu);
    const gpuStrip = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.012, 0.26), rgb);
    gpuStrip.position.set(0.036, 0.01, 0.02);
    tower.add(gpuStrip);
    for (let i = 0; i < 4; i++) {
        const ram = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.004), rgb);
        ram.position.set(-0.05, 0.13, -0.02 + i * 0.012);
        tower.add(ram);
    }
    const coolerRing = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 8, 32), rgb);
    coolerRing.rotation.y = Math.PI / 2;
    coolerRing.position.set(-0.035, 0.1, 0.08);
    tower.add(coolerRing);
    for (let i = 0; i < 3; i++) {
        const fan = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.006, 8, 40), rgb);
        fan.position.set(0, -0.14 + i * 0.14, td / 2 - 0.012);
        tower.add(fan);
    }
    const front = new THREE.Mesh(new THREE.PlaneGeometry(tw - 0.03, th - 0.03), M.tintedGlass);
    front.position.z = td / 2 + 0.001;
    add(front, { parent: tower, cast: false, receive: false, interact: 'pc' });
    if (quality === 'high') {
        const towerGlow = new THREE.PointLight(0xff00aa, 0.35, 1.2, 2);
        towerGlow.position.set(0.18, 0, 0.1);
        tower.add(towerGlow);
        anim.towerGlow = towerGlow;
    }

    // gaming chair (faces the desk)
    const chair = new THREE.Group();
    chair.position.set(0.02, 0, -1.9);
    scene.add(chair);
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spoke = new THREE.Mesh(rbox(0.3, 0.035, 0.05, 0.012), M.blackMetal);
        spoke.position.set(Math.cos(a) * 0.15, 0.085, Math.sin(a) * 0.15);
        spoke.rotation.y = -a;
        add(spoke, { parent: chair, interact: 'chair' });
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 16), M.matteBlack);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29);
        add(wheel, { parent: chair });
    }
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.03, 0.34, 16), M.chrome), { parent: chair }).position.y = 0.27;
    add(new THREE.Mesh(rbox(0.54, 0.1, 0.52, 0.045, 4), M.leather), { parent: chair, interact: 'chair' }).position.y = 0.48;
    [-0.24, 0.24].forEach((sx) => add(new THREE.Mesh(rbox(0.07, 0.07, 0.5, 0.03, 3), M.leatherRed), { parent: chair }).position.set(sx, 0.54, 0));
    const back = new THREE.Group();
    back.position.set(0, 0.55, 0.26);
    back.rotation.x = 0.16;
    chair.add(back);
    add(new THREE.Mesh(rbox(0.52, 0.82, 0.1, 0.06, 4), M.leather), { parent: back, interact: 'chair' }).position.y = 0.41;
    [-0.2, 0.2].forEach((sx) => add(new THREE.Mesh(rbox(0.07, 0.7, 0.11, 0.03, 3), M.leatherRed), { parent: back }).position.set(sx, 0.4, 0.004));
    add(new THREE.Mesh(rbox(0.26, 0.12, 0.08, 0.04, 3), M.leatherRed), { parent: back }).position.set(0, 0.74, -0.07);
    [-0.29, 0.29].forEach((sx) => {
        add(new THREE.Mesh(rbox(0.035, 0.2, 0.035, 0.01), M.blackMetal), { parent: chair }).position.set(sx, 0.62, 0.02);
        add(new THREE.Mesh(rbox(0.07, 0.03, 0.26, 0.012), M.matteBlack), { parent: chair }).position.set(sx, 0.73, -0.02);
    });
    collide(-0.33, 0.37, -2.2, -1.6);
    blob(0.02, -1.9, 0.9, 0.9, 0.004, 0.6);

    /* ---------------------------------------------------------------- neon sign + bias light (brick wall) */
    const neonGroup = new THREE.Group();
    neonGroup.position.set(0, 1.97, z0 + 0.03);
    scene.add(neonGroup);
    const neonBack = new THREE.Mesh(rbox(1.5, 0.4, 0.012, 0.01), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.05, depthWrite: false }));
    add(neonBack, { parent: neonGroup, cast: false, interact: 'neon' });
    const neonTubeMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
    const neonGlowMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.75 });
    const neonTube = new THREE.Mesh(new THREE.PlaneGeometry(1.44, 0.36), neonTubeMat);
    neonTube.position.z = 0.012;
    const neonGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.62), neonGlowMat);
    neonGlow.position.z = 0.004;
    neonGroup.add(neonGlow, neonTube);
    const neonLight = new THREE.PointLight(0xff4fd8, 1.6, 3.2, 2);
    neonLight.position.set(0, 0, 0.35);
    neonGroup.add(neonLight);
    const setNeon = (color) => {
        const t2 = T.neon('GABYTZU', { color });
        if (neonTubeMat.map) neonTubeMat.map.dispose();
        if (neonGlowMat.map) neonGlowMat.map.dispose();
        neonTubeMat.map = t2.tube;
        neonGlowMat.map = t2.glow;
        neonTubeMat.needsUpdate = neonGlowMat.needsUpdate = true;
        neonLight.color.set(color);
    };
    setNeon('#ff4fd8');
    lights.neon = neonLight;
    anim.neon = { set: setNeon, tube: neonTubeMat, glow: neonGlowMat };

    const bias = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.8), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x5b6cff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    bias.position.set(0, 1.15, z0 + 0.005);
    scene.add(bias);
    anim.bias = bias.material;

    /* ---------------------------------------------------------------- TV wall (west) */
    const tvGroup = new THREE.Group();
    tvGroup.position.set(x0 + 0.05, 1.32, 0.2);
    tvGroup.rotation.y = Math.PI / 2;
    scene.add(tvGroup);
    add(new THREE.Mesh(rbox(1.462, 0.836, 0.04, 0.006), M.plastic), { parent: tvGroup, interact: 'tv' });
    const tvScreen = new THREE.Group();
    tvScreen.position.z = 0.0205;
    tvGroup.add(tvScreen);
    add(new THREE.Mesh(rbox(0.95, 0.07, 0.09, 0.02), M.matteBlack), { parent: tvGroup }).position.set(0, -0.51, 0.04);

    // media console
    const mediaConsole = new THREE.Group();
    mediaConsole.position.set(x0 + 0.24, 0, 0.2);
    scene.add(mediaConsole);
    add(new THREE.Mesh(rbox(0.44, 0.42, 1.8, 0.01), M.walnut), { parent: mediaConsole, solid: true }).position.y = 0.26;
    [-0.6, 0, 0.6].forEach((cz) => add(new THREE.Mesh(rbox(0.012, 0.3, 0.56, 0.004), M.walnut), { parent: mediaConsole }).position.set(0.225, 0.27, cz));
    [[-0.17, -0.85], [0.17, -0.85], [-0.17, 0.85], [0.17, 0.85]].forEach(([cx, cz]) => add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 0.05, 10), M.blackMetal), { parent: mediaConsole }).position.set(cx, 0.025, cz));
    // game console
    add(new THREE.Mesh(rbox(0.1, 0.05, 0.28, 0.012), new THREE.MeshPhysicalMaterial({ color: 0xf2f3f5, roughness: 0.3, clearcoat: 0.6 })), { parent: mediaConsole }).position.set(0.02, 0.495, -0.5);
    const consoleLed = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.004, 0.08), new THREE.MeshBasicMaterial({ color: 0x3b82f6, toneMapped: false }));
    consoleLed.position.set(0.071, 0.495, -0.5);
    mediaConsole.add(consoleLed);
    collide(x0, x0 + 0.5, -0.75, 1.15);
    blob(x0 + 0.26, 0.2, 0.7, 2.1, 0.003, 0.55);

    /* ---------------------------------------------------------------- rug */
    const rugMat = [new THREE.MeshStandardMaterial({ color: 0x1b1f2b, roughness: 1 })];
    const rugTop = new THREE.MeshPhysicalMaterial({ map: T.rug({ w: 1024, h: 1024 }), roughness: 0.98, sheen: 0.8, sheenColor: new THREE.Color(0x8b8fa0), sheenRoughness: 0.8 });
    const rugMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.012, 2.05), [rugMat[0], rugMat[0], rugTop, rugMat[0], rugMat[0], rugMat[0]]);
    rugMesh.position.set(-1.98, 0.006, 0.2);
    add(rugMesh, { cast: false, solid: true }).userData.floor = true;

    /* ---------------------------------------------------------------- sideboard under the window (east) */
    const sideboard = new THREE.Group();
    sideboard.position.set(x1 - 0.23, 0, 0);
    scene.add(sideboard);
    add(new THREE.Mesh(rbox(0.42, 0.46, 1.5, 0.01), new THREE.MeshStandardMaterial({ color: 0xece8e1, roughness: 0.5 })), { parent: sideboard, solid: true }).position.y = 0.28;
    [-0.37, 0.37].forEach((cz) => add(new THREE.Mesh(rbox(0.012, 0.36, 0.7, 0.004), M.walnut), { parent: sideboard }).position.set(-0.214, 0.28, cz));
    [[-0.15, -0.65], [0.15, -0.65], [-0.15, 0.65], [0.15, 0.65]].forEach(([cx, cz]) => add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, 0.05, 10), M.blackMetal), { parent: sideboard }).position.set(cx, 0.025, cz));
    collide(x1 - 0.48, x1, -0.8, 0.8);
    blob(x1 - 0.24, 0, 0.65, 1.8, 0.003, 0.5);

    /* ---------------------------------------------------------------- side table (next to the sofa) */
    const sideTable = new THREE.Group();
    sideTable.position.set(-0.95, 0, 1.78);
    scene.add(sideTable);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.028, 40), M.walnut), { parent: sideTable, solid: true }).position.y = 0.55;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.53, 12), M.blackMetal), { parent: sideTable }).position.y = 0.27;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.018, 32), M.blackMetal), { parent: sideTable }).position.y = 0.009;
    collide(-1.2, -0.7, 1.53, 2.03);
    blob(-0.95, 1.78, 0.6, 0.6, 0.004, 0.5);

    /* ---------------------------------------------------------------- shelves + posters (south wall) */
    const shelfY = [1.28, 1.7];
    shelfY.forEach((y) => add(new THREE.Mesh(rbox(1.2, 0.03, 0.24, 0.006), M.walnut), { solid: true }).position.set(1.62, y, z1 - 0.12));
    // books
    const bookColors = [0x9b2c2c, 0x2c5282, 0x276749, 0xb7791f, 0x553c9a, 0x1a202c, 0xc05621];
    let bx = 1.1;
    for (let i = 0; i < 9; i++) {
        const bw = 0.025 + (i % 3) * 0.008, bh = 0.18 + ((i * 7) % 5) * 0.012;
        const book = new THREE.Mesh(rbox(bw, bh, 0.16, 0.003), new THREE.MeshStandardMaterial({ color: bookColors[i % bookColors.length], roughness: 0.7 }));
        book.position.set(bx, shelfY[1] + 0.015 + bh / 2, z1 - 0.13);
        if (i === 8) { book.rotation.z = 0.28; book.position.x += 0.03; }
        add(book, { solid: true });
        bx += bw + 0.004;
    }

    const posterFrame = (kind, px, py, pz, ry, id) => {
        const g = new THREE.Group();
        g.position.set(px, py, pz);
        g.rotation.y = ry;
        scene.add(g);
        add(new THREE.Mesh(rbox(0.64, 0.84, 0.025, 0.004), M.matteBlack), { parent: g, interact: id });
        const art = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.78), new THREE.MeshStandardMaterial({ map: T.poster(kind), roughness: 0.4 }));
        art.position.z = 0.0135;
        add(art, { parent: g, cast: false, interact: id });
        const cover = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), M.glass);
        cover.position.z = 0.016;
        g.add(cover);
        return g;
    };
    posterFrame('nexustv', 0.2, 1.55, z1 - 0.013, Math.PI, 'poster-nexustv');
    posterFrame('honcho', -0.8, 1.55, z1 - 0.013, Math.PI, 'poster-honcho');
    posterFrame('steam', x0 + 0.013, 1.55, -2.05, Math.PI / 2, 'poster-steam');

    /* ---------------------------------------------------------------- ceiling light + LED cove */
    const ceilLamp = new THREE.Group();
    ceilLamp.position.set(0, h, 0);
    scene.add(ceilLamp);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.05, 48), M.paint), { parent: ceilLamp, cast: false }).position.y = -0.025;
    const diffuserMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe2bd, emissiveIntensity: 2.5, roughness: 0.5 });
    const diffuser = new THREE.Mesh(new THREE.CircleGeometry(0.27, 48), diffuserMat);
    diffuser.rotation.x = Math.PI / 2;
    diffuser.position.y = -0.051;
    ceilLamp.add(diffuser);
    anim.diffuser = diffuserMat;

    const ledMat = new THREE.MeshBasicMaterial({ color: 0x8b5cf6, toneMapped: false });
    const ledWash = new THREE.MeshBasicMaterial({ map: glowTex, color: 0x8b5cf6, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    anim.led = { strip: ledMat, wash: ledWash };
    const ledRun = (x0r, x1r, z0r, z1r) => {
        const strip = new THREE.Mesh(slab(x0r, x1r, h - 0.03, h - 0.018, z0r, z1r), ledMat);
        scene.add(strip);
    };
    ledRun(x0 + 0.04, x1 - 0.04, z0 + 0.03, z0 + 0.045);
    ledRun(x0 + 0.04, x1 - 0.04, z1 - 0.045, z1 - 0.03);
    ledRun(x0 + 0.03, x0 + 0.045, z0 + 0.04, z1 - 0.04);
    ledRun(x1 - 0.045, x1 - 0.03, z0 + 0.04, z1 - 0.04);
    const wash = (w2, cx, cz, ry) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w2, 0.9), ledWash);
        m.position.set(cx, h - 0.35, cz);
        m.rotation.y = ry;
        scene.add(m);
    };
    wash(W - 0.2, 0, z0 + 0.004, 0);
    wash(W - 0.2, 0, z1 - 0.004, Math.PI);
    wash(D - 0.2, x0 + 0.004, 0, Math.PI / 2);

    /* ---------------------------------------------------------------- lights */
    const sun = new THREE.DirectionalLight(0xffd3a0, 3.4);
    sun.position.set(x1 + 8, 3.9, 1.6);
    sun.target.position.set(0, 0.3, -0.2);
    scene.add(sun, sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.setScalar(quality === 'low' ? 1024 : 2048);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 5, bottom: -5, near: 1, far: 22 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 3;
    lights.sun = sun;

    const sky = new THREE.RectAreaLight(0xcfe0ff, 2.2, win.z1 - win.z0, win.y1 - win.y0);
    sky.position.set(x1 + 0.02, (win.y0 + win.y1) / 2, 0);
    sky.lookAt(0, 1.3, 0);
    scene.add(sky);
    lights.sky = sky;

    const ceiling = new THREE.PointLight(0xffd9ad, 9, 0, 2);
    ceiling.position.set(0, h - 0.25, 0);
    ceiling.castShadow = quality === 'high';
    ceiling.shadow.mapSize.setScalar(1024);
    ceiling.shadow.bias = -0.003;
    ceiling.shadow.radius = 6;
    scene.add(ceiling);
    lights.ceiling = ceiling;

    // screens light the room a little (skipped on low quality: area lights are costly)
    if (quality !== 'low') {
        const monitorLight = new THREE.RectAreaLight(0x8a9cff, 3, SCREENS.pc.w, SCREENS.pc.h);
        monitorLight.position.set(0, 1.13, -2.76);
        monitorLight.lookAt(0, 1.0, -1.5);
        scene.add(monitorLight);
        lights.monitor = monitorLight;

        const tvLight = new THREE.RectAreaLight(0x9fb4ff, 2.2, SCREENS.tv.w, SCREENS.tv.h);
        tvLight.position.set(x0 + 0.08, 1.32, 0.2);
        tvLight.lookAt(0, 1.0, 0.2);
        scene.add(tvLight);
        lights.tv = tvLight;
    }

    /* ---------------------------------------------------------------- hidden stars */
    const starShape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? 0.021 : 0.05;
        if (i === 0) starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    starShape.closePath();
    const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2 });
    starGeo.center();
    const starMat = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 1, roughness: 0.22, emissive: 0xffa000, emissiveIntensity: 0.55 });
    const STAR_SPOTS = [
        [0.5, 0.06, -2.78],   // under the desk
        [-0.7, 1.27, -2.64],  // on top of the PC
        [3.2, 0.3, -2.86],    // behind the plant
        [3.36, 0.96, 0.84],   // window sill
        [2.12, 1.76, 2.84],   // end of the top shelf
        [-1.62, 0.07, -0.72], // by the sofa's foot
        [-3.32, 0.53, 0.7],   // media console, next to the vase
        [-3.43, 1.8, 0.66],   // on top of the TV
        [-3.3, 0.07, 2.78],   // corner by the door
        [0.34, 2.7, 0.32],    // up by the ceiling light
    ];
    const stars = STAR_SPOTS.map(([sx, sy, sz], i) => {
        const g = new THREE.Group();
        g.position.set(sx, sy, sz);
        const m = new THREE.Mesh(starGeo, starMat);
        m.castShadow = true;
        const s = glowSprite(0xffc040, 0.22, 0.55);
        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
        hit.userData.interact = `star-${i}`;
        interactive.push(hit);
        g.add(m, s, hit);
        scene.add(g);
        return { group: g, mesh: m, sprite: s, hit, phase: i * 1.7, collected: false };
    });

    // trophy (appears when all stars are found)
    const trophy = new THREE.Group();
    trophy.position.set(1.98, shelfY[0] + 0.015, z1 - 0.12);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 1, roughness: 0.18 });
    const cupPts = [[0, 0], [0.05, 0], [0.05, 0.012], [0.018, 0.02], [0.014, 0.07], [0.02, 0.08], [0.055, 0.1], [0.065, 0.17], [0.06, 0.17], [0.05, 0.11], [0.0, 0.1]].map(([x, y]) => new THREE.Vector2(x, y));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(cupPts, 40), gold);
    add(cup, { parent: trophy, interact: 'trophy' });
    [-1, 1].forEach((sd) => {
        const hnd = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 24, Math.PI), gold);
        hnd.position.set(sd * 0.065, 0.135, 0);
        hnd.rotation.z = sd > 0 ? -Math.PI / 2 : Math.PI / 2;
        trophy.add(hnd);
    });
    trophy.visible = false;
    scene.add(trophy);

    return { M, quality, colliders, interactive, anim, lights, stars, trophy, glowSprite, blob, add, collide,
        screens: { pc: pcScreen, side: sideScreen, tv: tvScreen, phone: phoneScreen },
        groups: { desk, mon, side, tower, chair, tvGroup, mediaConsole, sideboard, sideTable, neonGroup, winGroup, phone } };
}

/* ---------------------------------------------------------------- models */

// Place the loaded glTF models; each one gets an invisible box so aiming at it is cheap.
export function placeModels(room, scene, models) {
    const { add, collide, blob, interactive } = room;
    const tidy = (root) => {
        const drop = [];
        root.traverse((o) => {
            if (o.isLight || o.isCamera || /firefly|Camera0|Key_Light/i.test(o.name)) drop.push(o);
            if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
        });
        drop.forEach((o) => o.parent && o.parent.remove(o));
        return root;
    };
    const proxy = (root, id) => {
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
        m.position.copy(center);
        m.userData.interact = id;
        m.userData.proxy = true;
        scene.add(m);
        interactive.push(m);
        return box;
    };
    const put = (name, { pos, rotY = 0, scale = 1, id = null, solid = true }) => {
        const gltf = models[name];
        if (!gltf) return null;
        const root = tidy(gltf.scene);
        root.scale.setScalar(scale);
        root.rotation.y = rotY;
        root.position.set(...pos);
        scene.add(root);
        const box = proxy(root, id);
        if (solid && id !== 'car') collide(box.min.x - 0.05, box.max.x + 0.05, box.min.z - 0.05, box.max.z + 0.05);
        return { root, box };
    };

    const placed = {};
    placed.sofa = put('GlamVelvetSofa', { pos: [-0.95, 0, 0.2], rotY: -Math.PI / 2, id: 'sofa' });
    if (placed.sofa) blob(-0.95, 0.2, 1.3, 2.5, 0.013, 0.7);
    placed.armchair = put('SheenChair', { pos: [2.55, 0, 1.85], rotY: -Math.PI * 0.72, scale: 1.05, id: 'armchair' });
    if (placed.armchair) blob(2.55, 1.85, 1.0, 1.0, 0.003, 0.6);
    placed.plant = put('DiffuseTransmissionPlant', { pos: [2.98, 0, -2.52], rotY: 0.6, scale: 1.25, id: 'plant' });
    if (placed.plant) blob(2.98, -2.52, 0.9, 0.9, 0.003, 0.6);
    placed.lamp = put('IridescenceLamp', { pos: [-0.95, 0.564, 1.78], rotY: 0.4, scale: 1.1, id: 'lamp', solid: false });
    placed.pouf = put('SpecularSilkPouf', { pos: [-2.2, 0.012, 1.55], scale: 1, id: 'pouf' });
    placed.vase = put('GlassVaseFlowers', { pos: [-3.28, 0.47, 0.95], rotY: Math.PI / 2, scale: 1.3, id: 'plant', solid: false });
    placed.boombox = put('BoomBox', { pos: [3.24, 0.51, -0.3], rotY: -Math.PI / 2, scale: 22, id: 'boombox', solid: false });
    placed.bottle = put('WaterBottle', { pos: [-0.52, 0.7575, -2.32], scale: 0.9, id: 'bottle', solid: false });
    placed.camera = put('AntiqueCamera', { pos: [3.05, 0, 2.55], rotY: -2.3, scale: 0.2, id: 'camera' });
    if (placed.camera) blob(3.05, 2.55, 0.9, 0.9, 0.003, 0.45);
    placed.car = put('ToyCar', { pos: [1.3, 1.295, 2.87], rotY: Math.PI / 2, scale: 2.4, id: 'car', solid: false });
    if (models.ToyCar) {
        // keep only the car itself (the model ships with a cloth display stand)
        models.ToyCar.scene.traverse((o) => { if (/fabric/i.test(o.name)) o.visible = false; });
    }
    // table lamp: a warm bulb inside the shade
    if (placed.lamp) {
        const { box } = placed.lamp;
        const bulb = new THREE.PointLight(0xffb86b, 1.4, 4, 2);
        bulb.position.set((box.min.x + box.max.x) / 2, box.min.y + (box.max.y - box.min.y) * 0.7, (box.min.z + box.max.z) / 2);
        scene.add(bulb);
        const halo = room.glowSprite(0xffb070, 0.5, 0.35);
        halo.position.copy(bulb.position);
        scene.add(halo);
        room.lights.lamp = bulb;
        room.anim.lampHalo = halo;
    }
    // wall sconces either side of the TV, washing light down the wall
    room.lights.sconces = [];
    [-0.75, 1.15].forEach((z) => {
        const lamp = models.AnisotropyBarnLamp ? models.AnisotropyBarnLamp.scene.clone(true) : null;
        if (!lamp) return;
        tidy(lamp);
        lamp.position.set(ROOM.x0 + 0.01, 1.98, z);
        lamp.rotation.y = Math.PI / 2;
        lamp.scale.setScalar(1.4);
        scene.add(lamp);
        if (room.quality === 'high') {
            const spot = new THREE.SpotLight(0xffc27a, 6, 3.2, 0.75, 0.6, 2);
            spot.position.set(ROOM.x0 + 0.2, 1.9, z);
            spot.target.position.set(ROOM.x0 + 0.05, 0.6, z);
            scene.add(spot, spot.target);
            room.lights.sconces.push(spot);
        }
    });
    return placed;
}
