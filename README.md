# adi839.github.io

Gabytzu's site: **a 3D room you walk around in like a game**, served by GitHub Pages. It is lit like a real room (daylight through the window, lamps, neon, shadows), and the things in it work.

| In the room | What it does | Live? |
|---|---|---|
| 💻 PC | Sit down and use **GabyOS**: windows for GitHub, NexusTV, Steam Switcher, YouTube, Discord, Music, About me, and a terminal (`help`, `lights off`, `night`, `neon`…) | yes |
| 🖥️ Side monitor | Clock, Discord server, newest video, GitHub activity | yes |
| 📺 TV | The YouTube channel: pick a video and it plays on the TV | refreshed every 6 hours |
| 📱 Phone | Discord: server, invite, live profile (once set up) | yes |
| 📻 Boombox | Lofi music; the room pulses to the beat | – |
| 🖼️ Posters | NexusTV, Steam Switcher, Honcho | – |
| 💡 Switch, 🪟 window, ✨ neon, 🚪 door, 📷 camera… | lights, day/night, neon colour, links, a photo of the room | – |

**Controls.** Computer: **W A S D** to walk, the mouse to look, **E** or click to use what you aim at, **Esc** for the menu, **1–6** for shortcuts, **M** for music. Phone: the stick to walk, drag to look, tap things to use them. There are **10 hidden stars** to find, and something appears when you have them all.

Visitors whose device can't run WebGL, or who have "reduce motion" turned on, get the **classic page**: the same content as a normal page. The **2D/3D** button switches between the two, and **Menu → Graphics** trades looks for speed.

## Files

- `index.html`: the page, the room's overlays (start screen, menu, prompts) and all panel content (also the classic page).
- `assets/room/`: the 3D room. `build.js` builds it (walls, furniture, lights, stars), `textures.js` draws the generated textures, `controls.js` is walking and looking, `index.js` runs it all (loading, screens, using things, day/night).
- `assets/os.js`: what the screens show: GabyOS on the PC, the dashboard on the side monitor, the channel on the TV.
- `assets/app.js`: glue: menus, the phone, posters, music, star hunt, settings, view switching. `MUSIC_SRC` is at the top.
- `assets/live.js`: GitHub, YouTube and Discord data. Settings are in the `CONFIG` block at the top.
- `assets/sfx.js`: small sound effects, made in the browser.
- `assets/style.css`: all styles.
- `assets/models`, `assets/textures`, `assets/env`: 3D models, textures and the sky outside the window. See `CREDITS.md`.
- `vendor/`: three.js r170 and the addons the room uses (MIT, see `vendor/THREE-LICENSE`), bundled so the site doesn't depend on a CDN.
- `data/*.json` + `scripts/fetch-live.mjs` + `.github/workflows/live-data.yml`: the GitHub Action that refreshes YouTube and GitHub data every 6 hours. You can also run it by hand from the **Actions** tab (**Refresh live data** → **Run workflow**).

## Settings

- **Hide a repo:** add its name to `hiddenRepos` in `assets/live.js` and to `HIDDEN` in `scripts/fetch-live.mjs`.
- **Description for a repo that has none on GitHub:** add it to `descriptions` in `assets/live.js` (or, better, set it on GitHub).
- **YouTube channel:** found automatically from `@Raccoon_Team`. If that ever fails, add a repository variable `YT_CHANNEL_ID` (Settings → Secrets and variables → Actions → Variables).
- **Music:** set `MUSIC_SRC` in `assets/app.js`. For the room to react to the actual beat, put the file in this repo (for example `assets/lofi.mp3`) and point `MUSIC_SRC` at it.

## Discord profile (live status, avatar, games, Spotify)

1. Join the [Lanyard Discord server](https://discord.gg/lanyard) with your account. Lanyard is the free service that shares your presence.
2. In Discord, go to Settings → Advanced and turn on Developer Mode. Then right-click your name and choose **Copy User ID**.
3. Paste the ID into `discordUserId` in `assets/live.js`.

Your status then shows on the phone, the side monitor and in GabyOS.

## Privacy

The site does not show an age, an email address or a location. Only public GitHub repos can appear.
