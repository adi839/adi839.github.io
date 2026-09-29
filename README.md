# adi839.github.io

Gabytzu's site: a **3D world** you can explore, served by GitHub Pages. Every planet is something I make or a place you can find me, and the content updates on its own.

| Planet | What's inside | Live? |
|---|---|---|
| 📺 NexusTV | link to nexustv.lol | repo stats |
| 💬 Discord | server stats, invite, live profile (once set up) | yes |
| ▶️ YouTube | newest uploads from @Raccoon_Team | refreshed every 6 hours |
| 🐙 GitHub | public projects and recent activity | yes |
| 🛠️ Steam Switcher | the project and its stats | repo stats |
| 🎵 Music | lofi player; the planet pulses to the beat | – |

Things to do: drag to spin, scroll/pinch to zoom, click planets (or press **1–6**), **M** for music, **R** to reset, tap the core for a surprise, and find the **10 hidden stars**.

Visitors whose device can't run WebGL, or who have "reduce motion" turned on, get the **classic view**: the same content as a normal page. The **2D/3D** button switches between the two.

## Files

- `index.html`: the page and all panel content (also the classic view).
- `assets/world.js`: the Three.js scene (planets, stars, particles, camera).
- `assets/live.js`: GitHub, YouTube and Discord data. Settings are in the `CONFIG` block at the top.
- `assets/app.js`: panels, keyboard, music, star hunt, view switching. `MUSIC_SRC` is at the top.
- `assets/style.css`: all styles.
- `vendor/`: Three.js r170 (MIT, see `vendor/THREE-LICENSE`), bundled so the site doesn't depend on a CDN.
- `data/*.json` + `scripts/fetch-live.mjs` + `.github/workflows/live-data.yml`: the GitHub Action that refreshes YouTube and GitHub data every 6 hours. You can also run it by hand from the **Actions** tab (**Refresh live data** → **Run workflow**).

## Settings

- **Hide a repo from the GitHub planet:** add its name to `hiddenRepos` in `assets/live.js` and to `HIDDEN` in `scripts/fetch-live.mjs`.
- **Description for a repo that has none on GitHub:** add it to `descriptions` in `assets/live.js` (or, better, set it on GitHub).
- **YouTube channel:** found automatically from `@Raccoon_Team`. If that ever fails, add a repository variable `YT_CHANNEL_ID` (Settings → Secrets and variables → Actions → Variables).
- **Music:** set `MUSIC_SRC` in `assets/app.js`. For the music planet to react to the actual beat, put the file in this repo (for example `assets/lofi.mp3`) and point `MUSIC_SRC` at it.

## Discord profile (live status, avatar, games, Spotify)

1. Join the [Lanyard Discord server](https://discord.gg/lanyard) with your account. Lanyard is the free service that shares your presence.
2. In Discord, go to Settings → Advanced and turn on Developer Mode. Then right-click your name and choose **Copy User ID**.
3. Paste the ID into `discordUserId` in `assets/live.js`.

The core of the world then glows in your status colour.

## Privacy

The site does not show an age, an email address or a location. Only public GitHub repos can appear.
