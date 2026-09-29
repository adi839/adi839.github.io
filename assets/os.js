// What runs on the room's screens: GabyOS on the PC, a live dashboard on the
// side monitor and a YouTube channel on the TV. Plain DOM, so it is real UI:
// it can be clicked, scrolled, typed into and read by screen readers.
// Anything that comes from outside is written with textContent.

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
};
const button = (className, label, text) => {
    const b = el('button', className, text);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
};
const time = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const day = () => new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
const ago = (date) => {
    const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
    if (!Number.isFinite(s)) return '';
    const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year']];
    let v = s;
    for (const [size, unit] of steps) {
        if (v < size) {
            const n = Math.max(1, Math.floor(v));
            return unit === 'second' ? 'just now' : `${n} ${unit}${n === 1 ? '' : 's'} ago`;
        }
        v /= size;
    }
    return '';
};

const GH = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>';

export const APPS = [
    { id: 'about', title: 'About me', glyph: '👋', panel: 'about', w: 560, h: 560 },
    { id: 'github', title: 'GitHub', glyph: GH, panel: 'github', w: 600, h: 590 },
    { id: 'nexustv', title: 'NexusTV', glyph: '📺', panel: 'nexustv', w: 520, h: 360 },
    { id: 'steam', title: 'Steam Switcher', glyph: '🛠️', panel: 'steam', w: 540, h: 430 },
    { id: 'youtube', title: 'YouTube', glyph: '▶️', panel: 'youtube', w: 600, h: 590 },
    { id: 'discord', title: 'Discord', glyph: '💬', panel: 'discord', w: 520, h: 470 },
    { id: 'music', title: 'Music', glyph: '🎵', panel: 'music', w: 460, h: 330 },
    { id: 'terminal', title: 'Terminal', glyph: '⌨️', w: 640, h: 400 },
];

/* ======================================================================= GabyOS */

export function createOS(root, {
    mount = () => {},        // (panelId, container, onEvict) => move a panel into a window
    unmount = () => {},      // (panelId) => give the panel back
    actions = {},            // lights(on), night(on), neon(), music(), standUp(), tv(), disco(), classic()
    info = {},               // repos(), stars(), status()
    onBoot = () => {},
} = {}) {
    root.classList.add('os');
    root.tabIndex = -1;
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', 'GabyOS, the desktop on Gabytzu\'s PC');
    root.replaceChildren();

    const wall = el('div', 'os__wall');
    wall.append(el('span', 'os__logo', 'G'));
    const icons = el('div', 'os__icons');
    icons.setAttribute('role', 'list');
    const layer = el('div', 'os__windows');
    const menu = el('div', 'os__menu');
    menu.hidden = true;
    const bar = el('div', 'os__taskbar');
    const start = button('os__start', 'Start menu', 'G');
    const tasks = el('div', 'os__tasks');
    const tray = el('div', 'os__tray');
    const trayStatus = el('span', 'os__tray-status');
    trayStatus.hidden = true;
    const trayMusic = el('span', 'os__tray-music', '♪');
    trayMusic.hidden = true;
    const clock = el('time', 'os__clock', time());
    const power = button('os__power', 'Stand up from the PC (Esc)', '⏻');
    power.title = 'Stand up (Esc)';
    tray.append(trayStatus, trayMusic, clock, power);
    bar.append(start, tasks, tray);
    const boot = el('div', 'os__boot');
    boot.append(el('b', null, 'GabyOS'), el('span', null, 'Starting up…'));
    boot.hidden = true;
    root.append(wall, icons, layer, menu, bar, boot);

    setInterval(() => { clock.textContent = time(); }, 10000);
    power.addEventListener('click', () => actions.standUp && actions.standUp());

    /* ---------- windows ---------- */
    const windows = new Map();   // id -> { win, task }
    let z = 10;
    let cascade = 0;
    const flat = () => root.classList.contains('is-flat');
    // The desktop is drawn scaled to fit the monitor; convert screen pixels to desktop pixels.
    const scale = () => {
        const r = root.getBoundingClientRect();
        return r.width / root.offsetWidth || 1;
    };

    const focus = (id) => {
        const w = windows.get(id);
        if (!w) return;
        w.win.hidden = false;
        w.win.style.zIndex = String(++z);
        windows.forEach((o, key) => {
            o.win.classList.toggle('is-front', key === id);
            o.task.classList.toggle('is-front', key === id);
        });
    };

    const close = (id, { keepPanel = false } = {}) => {
        const w = windows.get(id);
        if (!w) return;
        windows.delete(id);
        w.win.remove();
        w.task.remove();
        if (w.app.panel && !keepPanel) unmount(w.app.panel);
        const last = [...windows.keys()].pop();
        if (last) focus(last);
    };

    const open = (id) => {
        const app = APPS.find((a) => a.id === id);
        if (!app) return;
        menu.hidden = true;
        if (windows.has(id)) { focus(id); return; }
        const win = el('section', 'win');
        win.dataset.app = id;
        win.setAttribute('role', 'dialog');
        win.setAttribute('aria-label', app.title);
        const head = el('header', 'win__bar');
        const glyph = el('span', 'win__glyph');
        glyph.innerHTML = app.glyph.startsWith('<svg') ? app.glyph : '';
        if (!app.glyph.startsWith('<svg')) glyph.textContent = app.glyph;
        const ctrl = el('div', 'win__ctrl');
        const bMin = button('win__btn', `Minimize ${app.title}`, '–');
        const bMax = button('win__btn', `Maximize ${app.title}`, '□');
        const bClose = button('win__btn win__btn--close', `Close ${app.title}`, '×');
        ctrl.append(bMin, bMax, bClose);
        head.append(glyph, el('span', 'win__title', app.title), ctrl);
        const body = el('div', 'win__body');
        win.append(head, body);
        const maxW = 1280 - 40, maxH = 720 - 56;
        const w = Math.min(app.w, maxW), h = Math.min(app.h, maxH);
        const left = Math.min(150 + cascade * 34, 1280 - w - 20);
        const top = Math.min(24 + cascade * 30, 720 - 48 - h - 8);
        cascade = (cascade + 1) % 7;
        Object.assign(win.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
        layer.append(win);

        const task = button('os__task', `${app.title} window`);
        const tGlyph = el('span', 'os__task-glyph');
        if (app.glyph.startsWith('<svg')) tGlyph.innerHTML = app.glyph; else tGlyph.textContent = app.glyph;
        task.append(tGlyph, el('span', 'os__task-label', app.title));
        tasks.append(task);
        windows.set(id, { win, task, app });

        if (app.panel) mount(app.panel, body, () => close(id, { keepPanel: true }));
        else if (id === 'terminal') terminal(body);

        bClose.addEventListener('click', () => close(id));
        bMin.addEventListener('click', () => { win.hidden = true; task.classList.remove('is-front'); });
        bMax.addEventListener('click', () => win.classList.toggle('is-max'));
        head.addEventListener('dblclick', () => win.classList.toggle('is-max'));
        task.addEventListener('click', () => {
            if (win.hidden || !win.classList.contains('is-front')) focus(id);
            else { win.hidden = true; task.classList.remove('is-front'); }
        });
        win.addEventListener('pointerdown', () => focus(id), true);

        // drag by the title bar
        head.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button') || flat() || win.classList.contains('is-max')) return;
            e.preventDefault();
            const k = scale();
            const sx = e.clientX, sy = e.clientY;
            const ox = win.offsetLeft, oy = win.offsetTop;
            head.setPointerCapture(e.pointerId);
            const move = (ev) => {
                const nx = ox + (ev.clientX - sx) / k;
                const ny = oy + (ev.clientY - sy) / k;
                win.style.left = `${Math.max(-w + 80, Math.min(1280 - 80, nx))}px`;
                win.style.top = `${Math.max(0, Math.min(720 - 48 - 30, ny))}px`;
            };
            const up = () => {
                head.removeEventListener('pointermove', move);
                head.removeEventListener('pointerup', up);
                head.removeEventListener('pointercancel', up);
            };
            head.addEventListener('pointermove', move);
            head.addEventListener('pointerup', up);
            head.addEventListener('pointercancel', up);
        });
        focus(id);
        const input = body.querySelector('input');
        if (input) setTimeout(() => input.focus({ preventScroll: true }), 50);
    };

    /* ---------- desktop icons + start menu ---------- */
    APPS.forEach((app) => {
        const b = button('os__icon', `Open ${app.title}`);
        b.setAttribute('role', 'listitem');
        const g = el('span', 'os__icon-glyph');
        if (app.glyph.startsWith('<svg')) g.innerHTML = app.glyph; else g.textContent = app.glyph;
        b.append(g, el('span', 'os__icon-label', app.title));
        b.addEventListener('click', () => open(app.id));
        icons.append(b);
    });
    const menuHead = el('div', 'os__menu-head');
    menuHead.append(el('b', null, 'Gabytzu'), el('span', null, 'IT Developer · Gamer'));
    const menuList = el('div', 'os__menu-list');
    APPS.forEach((app) => {
        const b = button('os__menu-item', null);
        const g = el('span', 'os__menu-glyph');
        if (app.glyph.startsWith('<svg')) g.innerHTML = app.glyph; else g.textContent = app.glyph;
        b.append(g, el('span', null, app.title));
        b.addEventListener('click', () => open(app.id));
        menuList.append(b);
    });
    const menuFoot = el('div', 'os__menu-foot');
    const standBtn = button('os__menu-item', null, '⏻  Stand up');
    standBtn.addEventListener('click', () => { menu.hidden = true; actions.standUp && actions.standUp(); });
    menuFoot.append(standBtn);
    menu.append(menuHead, menuList, menuFoot);
    start.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    root.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.os__menu, .os__start')) menu.hidden = true; });

    /* ---------- terminal ---------- */
    function terminal(body) {
        const box = el('div', 'term');
        const out = el('div', 'term__out');
        out.setAttribute('aria-live', 'polite');
        const form = el('form', 'term__line');
        const ps1 = el('span', 'term__ps1', 'gaby@room:~$');
        const input = el('input', 'term__in');
        input.setAttribute('aria-label', 'Terminal command');
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.setAttribute('autocapitalize', 'off');
        form.append(ps1, input);
        box.append(out, form);
        body.append(box);
        const history = [];
        let hIndex = 0;
        const print = (text, cls) => {
            String(text).split('\n').forEach((line) => out.append(el('div', cls || null, line)));
            box.scrollTop = box.scrollHeight;
        };
        print('GabyOS terminal · type "help" and press Enter', 'term__dim');
        const cmds = {
            help: () => print([
                'help              this list',
                'whoami            who lives here',
                'projects          my public projects (live from GitHub)',
                'open <app>        github · nexustv · steam · youtube · discord · music',
                'lights on|off     the room lights',
                'night | day       change the time outside',
                'neon              change the neon sign colour',
                'music             play or pause the music',
                'tv                go watch the TV',
                'stars             how many hidden stars you found',
                'neofetch          system info',
                'clear             clear the screen',
                'exit              stand up from the PC',
            ].join('\n')),
            whoami: () => print('Gabytzu: IT developer, gamer and problem solver.\nBuilding NexusTV, Steam Switcher and more. Say hi on Discord!'),
            projects: () => {
                const repos = (info.repos && info.repos()) || [];
                if (!repos.length) { print('Loading projects… try again in a second.'); return; }
                repos.slice(0, 10).forEach((r) => print(`• ${r.name}${r.language ? ` [${r.language}]` : ''}${r.stars ? ` ★${r.stars}` : ''}  ${r.description || ''}`));
            },
            open: (arg) => {
                const app = APPS.find((a) => a.id === (arg || '').toLowerCase());
                if (!app) { print('Usage: open github | nexustv | steam | youtube | discord | music'); return; }
                open(app.id);
            },
            lights: (arg) => {
                if (arg !== 'on' && arg !== 'off') { print('Usage: lights on | lights off'); return; }
                actions.lights && actions.lights(arg === 'on');
                print(arg === 'on' ? 'Lights on 💡' : 'Lights off. Gamer mode 🌌');
            },
            night: () => { actions.night && actions.night(true); print('Good night 🌙'); },
            day: () => { actions.night && actions.night(false); print('Good morning ☀️'); },
            neon: () => { actions.neon && actions.neon(); print('Neon colour changed ✨'); },
            music: () => { actions.music && actions.music(); print('♪ toggled'); },
            tv: () => { actions.tv && actions.tv(); },
            stars: () => { const n = info.stars ? info.stars() : 0; print(n >= 10 ? 'All 10 stars found. Legend 🏆' : `${n}/10 stars found. They are hidden around the room ★`); },
            neofetch: () => print([
                '   ____       gaby@room',
                '  / ___|      ---------',
                ' | |  _       OS: GabyOS 1.0 (three.js edition)',
                ' | |_| |      Host: adi839.github.io',
                '  \\____|      Shell: gsh',
                '              Theme: Neon night',
                `              Stars: ${info.stars ? info.stars() : 0}/10`,
            ].join('\n'), 'term__art'),
            clear: () => out.replaceChildren(),
            exit: () => actions.standUp && actions.standUp(),
            sudo: () => print('Nice try 😄'),
            gg: () => print('GG WP 🎮'),
            disco: () => { actions.disco && actions.disco(); print('🪩 Party mode!'); },
            ls: () => print('projects/  games/  secrets/  README.txt'),
            cat: (arg) => print(arg === 'README.txt' ? 'Welcome to my room. Look around, use things, find the stars.' : `cat: ${arg || ''}: No such file`),
            cd: () => print('You are already where the cool stuff is.'),
        };
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const line = input.value.trim();
            input.value = '';
            print(`gaby@room:~$ ${line}`, 'term__echo');
            if (!line) return;
            history.push(line);
            hIndex = history.length;
            const [cmd, ...rest] = line.split(/\s+/);
            const fn = cmds[cmd.toLowerCase()];
            if (fn) fn(rest.join(' ').trim());
            else print(`${cmd}: command not found. Type "help".`);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp' && hIndex > 0) { input.value = history[--hIndex]; e.preventDefault(); }
            if (e.key === 'ArrowDown') { hIndex = Math.min(history.length, hIndex + 1); input.value = history[hIndex] || ''; e.preventDefault(); }
        });
        box.addEventListener('pointerup', () => { if (!window.getSelection().toString()) input.focus({ preventScroll: true }); });
    }

    let booted = false;
    return {
        root,
        open,
        close,
        // first time someone sits down: short boot, then the About window
        wake() {
            if (booted) return;
            booted = true;
            boot.hidden = false;
            setTimeout(() => {
                boot.classList.add('is-done');
                setTimeout(() => { boot.hidden = true; }, 500);
                // on a phone the home screen of icons comes first
                if (!windows.size && !flat()) open('about');
                onBoot();
            }, 900);
        },
        setFlat(on) { root.classList.toggle('is-flat', on); },
        setStatus(text, status) {
            trayStatus.hidden = !text;
            trayStatus.textContent = text || '';
            if (status) trayStatus.dataset.status = status; else delete trayStatus.dataset.status;
        },
        setMusic(on) { trayMusic.hidden = !on; },
        get openApps() { return [...windows.keys()]; },
    };
}

/* ======================================================================= side monitor */

export function createDash(root) {
    root.classList.add('dash');
    root.setAttribute('aria-label', 'Live dashboard');
    root.replaceChildren();
    const top = el('div', 'dash__top');
    const clock = el('b', 'dash__time', time());
    const date = el('span', 'dash__date', day());
    top.append(clock, date);

    const card = (label) => {
        const c = el('section', 'dash__card');
        c.append(el('h3', 'dash__label', label));
        root.append(c);
        return c;
    };
    root.append(top);
    const status = card('Discord');
    const statusLine = el('p', 'dash__big', 'Join the server');
    const statusSub = el('p', 'dash__sub', 'discord.gg/tUcEZ6kp5a');
    status.append(statusLine, statusSub);

    const video = card('Latest upload');
    const thumb = el('div', 'dash__thumb');
    const vTitle = el('p', 'dash__sub', 'Loading…');
    video.append(thumb, vTitle);

    const feed = card('GitHub activity');
    const list = el('ul', 'dash__feed');
    list.append(el('li', null, 'Loading…'));
    feed.append(list);

    const music = card('Now playing');
    const mLine = el('p', 'dash__big', 'Nothing yet');
    const bars = el('div', 'dash__bars');
    for (let i = 0; i < 16; i++) bars.append(el('i'));
    music.append(mLine, bars);

    setInterval(() => { clock.textContent = time(); date.textContent = day(); }, 10000);

    return {
        setServer({ name, online, members }) {
            if (status.dataset.presence) return;
            statusLine.textContent = name || 'Discord server';
            statusSub.textContent = online != null ? `${online} online · ${members} members` : 'discord.gg/tUcEZ6kp5a';
        },
        setPresence({ status: st, name, playing }) {
            status.dataset.presence = '1';
            statusLine.textContent = `${name || 'Gabytzu'} is ${({ online: 'online', idle: 'away', dnd: 'busy', offline: 'offline' })[st] || 'offline'}`;
            statusSub.textContent = playing ? `Playing ${playing}` : 'discord.gg/tUcEZ6kp5a';
            status.dataset.status = st;
        },
        setVideo(v) {
            if (!v) return;
            const img = el('img');
            img.alt = '';
            img.referrerPolicy = 'no-referrer';
            img.src = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
            img.onerror = () => img.remove();
            thumb.replaceChildren(img);
            vTitle.textContent = `${v.title || 'New video'}${v.published ? ` · ${ago(v.published)}` : ''}`;
        },
        setEvents(events) {
            list.replaceChildren();
            (events || []).slice(0, 5).forEach((e) => {
                const li = el('li', null, e.text);
                li.append(el('span', null, ago(e.date)));
                list.append(li);
            });
            if (!list.childNodes.length) list.append(el('li', null, 'No public activity yet'));
        },
        setMusic(state) {
            mLine.textContent = state === 'playing' ? 'Lofi beats' : state === 'loading' ? 'Loading…' : 'Paused';
            root.dataset.music = state;
        },
        setLevel(v) { root.style.setProperty('--lv', v.toFixed(3)); },
    };
}

/* ======================================================================= TV */

export function createTV(root, { onPlay = () => {}, onStop = () => {}, channelUrl = 'https://www.youtube.com/@VTEAM2' } = {}) {
    root.classList.add('tvui');
    root.setAttribute('aria-label', 'TV: YouTube channel');
    root.replaceChildren();
    const home = el('div', 'tvui__home');
    const head = el('header', 'tvui__head');
    const logo = el('span', 'tvui__logo', '▶');
    const who = el('div', 'tvui__who');
    const title = el('b', null, 'VTEAM');
    const handle = el('span', null, '@VTEAM2 · YouTube');
    who.append(title, handle);
    const sub = el('a', 'tvui__sub', 'Subscribe');
    sub.href = channelUrl;
    sub.target = '_blank';
    sub.rel = 'noopener noreferrer';
    head.append(logo, who, sub);
    const grid = el('div', 'tvui__grid');
    const empty = el('p', 'tvui__empty', 'Loading the newest videos…');
    grid.append(empty);
    home.append(head, grid);

    const player = el('div', 'tvui__player');
    player.hidden = true;
    const back = button('tvui__back', 'Stop the video and go back', '← Back');
    player.append(back);
    root.append(home, player);

    const stop = () => {
        const frame = player.querySelector('iframe');
        if (frame) frame.remove();
        player.hidden = true;
        home.hidden = false;
        onStop();
    };
    back.addEventListener('click', stop);

    const play = (v) => {
        const frame = document.createElement('iframe');
        frame.src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1`;
        frame.title = v.title || 'YouTube video';
        frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        player.querySelectorAll('iframe').forEach((f) => f.remove());
        player.prepend(frame);
        player.hidden = false;
        home.hidden = true;
        onPlay(v);
    };

    return {
        root,
        stop,
        get playing() { return !player.hidden; },
        setFlat(on) { root.classList.toggle('is-flat', on); },
        setChannel(channel) {
            if (channel && channel.title) title.textContent = String(channel.title);
        },
        setVideos(videos) {
            grid.replaceChildren();
            (videos || []).slice(0, 6).forEach((v) => {
                const card = button('tvui__card', `Play ${v.title || 'video'}`);
                const img = el('img');
                img.alt = '';
                img.loading = 'lazy';
                img.referrerPolicy = 'no-referrer';
                img.src = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
                img.onerror = () => { img.style.visibility = 'hidden'; };
                const text = el('span', 'tvui__card-text');
                text.append(el('b', null, v.title || 'Untitled video'));
                if (v.published) text.append(el('span', null, ago(v.published)));
                card.append(img, text);
                card.addEventListener('click', () => play(v));
                grid.append(card);
            });
            if (!grid.childNodes.length) {
                const p = el('p', 'tvui__empty', 'New videos show up here. ');
                const a = el('a', null, 'Open the channel');
                a.href = channelUrl;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                p.append(a);
                grid.append(p);
            }
        },
    };
}
