# adi839.github.io

Gabytzu's personal link hub, a single self-contained `index.html` served by GitHub Pages.

- **Links:** edit the `<li>` entries inside `<nav aria-label="Links">`. Each link sets its own `--brand` colour.
- **Music:** set `MUSIC_SRC` in the script at the bottom of the page. The most reliable option is to commit an audio file (for example `lofi.mp3`) next to `index.html` and point `MUSIC_SRC` at it.
- **Discord profile (live status, avatar, games, Spotify):**
  1. Join the [Lanyard Discord server](https://discord.gg/lanyard) with your account. Lanyard is the free service that shares your presence.
  2. In Discord, go to Settings → Advanced and turn on Developer Mode. Then right-click your name and choose **Copy User ID**.
  3. Paste the ID into `DISCORD_USER_ID` in `index.html`.
- **Discord server stats:** the member counts on the Discord link come from the invite code in `DISCORD_INVITE`.
- **Avatar:** your Discord avatar is used automatically once Discord is set up. Until then the page shows the letter `G`.
