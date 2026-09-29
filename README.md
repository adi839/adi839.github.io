# adi839.github.io

Gabytzu's personal presentation site: a single self-contained `index.html` served by GitHub Pages, plus `og.png` (the preview image shown when the link is shared).

Sections: **Home · About · Skills · Projects · Channel · Community · Contact**, with a lofi music player and a share button.

## Filling in your content

Open `index.html` and find the `CONFIG` block near the bottom of the script. Every value is optional. An empty value simply hides that part of the page, so nothing looks unfinished.

```js
const CONFIG = {
    bio: '',       // 1–3 sentences about you, shown in About
    nexustv: '',   // one line describing NexusTV
    skills: [],    // e.g. ['JavaScript', 'Python', { name: 'HTML/CSS', level: 80 }]
    projects: [],  // e.g. [{ title: 'My app', description: 'What it does', url: 'https://…', tag: 'Web' }]
    channel: '',   // one line about the YouTube channel
    videoId: '',   // optional: an 11-character YouTube video ID to embed
};
```

- The **Skills** section and its menu link only appear once `skills` has at least one entry.
- `projects` are added after NexusTV (up to 6). Only `http` and `https` links are accepted.
- `videoId` shows a thumbnail; the YouTube player loads only after a click.

## Discord profile (live status, avatar, games, Spotify)

1. Join the [Lanyard Discord server](https://discord.gg/lanyard) with your account. Lanyard is the free service that shares your presence.
2. In Discord, go to Settings → Advanced and turn on Developer Mode. Then right-click your name and choose **Copy User ID**.
3. Paste the ID into `DISCORD_USER_ID` in `index.html`.

The live status is off until you do this. To turn it off again, set `DISCORD_USER_ID` back to `''`.

The member counts on the Discord link come from the invite code in `DISCORD_INVITE`.

## Music

Set `MUSIC_SRC` in the script at the bottom of the page. The most reliable option is to commit an audio file (for example `lofi.mp3`) next to `index.html` and point `MUSIC_SRC` at it.

## Avatar

Your Discord avatar is used automatically once Discord is set up. Until then the page shows the letter `G`.

## Privacy

The page does not show an age, an email address or a location. Add contact details only if you want them public.
