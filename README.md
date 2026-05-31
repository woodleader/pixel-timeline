# Screenshot Hitster (Pixel Timeline)

Multiplayer WebRTC lobby game built with plain HTML/CSS/JS and PeerJS.

This version implements the **Pixel Timeline** flow:

- Create/join lobby with 6-char code
- Username-based players
- Host-managed room with no backend
- Every player starts with:
  - 1 random anchor card in their own timeline (screenshot + known title)
  - 2 Pixel Tokens
- Active turn flow:
  1. Server reveals a screenshot card (front only).
  2. Active player chooses where to place it in their timeline (before / between / after existing cards).
  3. Card is revealed.
  4. Correct placement keeps it on timeline and gives score.
  5. Incorrect placement discards it.
  6. Correct title + studio before reveal grants +1 Pixel Token (max 5).
- Tokens:
  - Spend 1 token to reroll your active screenshot.
  - Spend 3 tokens to auto-add next card directly to your timeline.
  - On opponent turn, spend 1 token to `GLITCH` (guess where their card belongs):
    - if that player is wrong and your guess is correct, you steal the card.

## Files

- `index.html` — UI, lobby/game panels, controls
- `style.css` — themed visual styling
- `script.js` — multiplayer and game rule engine
- `https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js` via CDN
- `scripts/import-steam.js` — local Node importer for pulling IGDB titles and appending to `games.json`/`game-images.json`

## Run locally

1. Open the folder in a local static server.
2. Go to `index.html`.
3. Enter a username.
4. Create or join a lobby.

### Manual JSON import in UI

- If the app shows fallback cards because `games.json` could not be loaded, open **Settings**.
- Use **Upload games.json** and optionally **Upload game-images.json**.
- Click **Load uploaded library** and the game will switch to that local library immediately.

## Deploy to GitHub Pages

1. Push these three files to a GitHub repo.
2. Enable GitHub Pages from the repo root.
3. Share the lobby code from Host and join from a second browser/device.

## Replace assets

`script.js` currently uses seeded placeholder images from `picsum.photos`.
Replace `GAME_CARDS` entries with real screenshots and correct release metadata.

### Import IGDB games (local script)

Run this from the project root:

```bash
node scripts/import-steam.js --max 20
```

Environment:

- `IGDB_CLIENT_ID` (optional if you want the script to prompt)
- `IGDB_CLIENT_SECRET` (optional if you want the script to prompt)

What it does:

- authenticates with Twitch and queries the IGDB Games API,
- goes through them page by page until the max count or you stop it with `q`,
- skips duplicates already present in `games.json`,
- opens a browser preview for each game with screenshot thumbnails and lets you pick one image,
- writes back to `games.json` and `game-images.json`.

Useful flags:

- `--games ./games.json`
- `--images ./game-images.json`
- `--country us` (legacy compatibility flag, unused)
- `--lang english` (legacy compatibility flag, unused)
- `--page-size 50`
- `--delay 250`
- `--sort popular|reviews|rating|hype|custom`
- `--mode interactive|auto` (default interactive)
- `--image-mode thumbnail|full` (default thumbnail; thumbnail keeps `game-images.json` smaller)
- `--auto-image-count <number>` (default 3, skips first candidate in auto mode)
- `--past-years <number>` (auto mode only; imports up to `--max` games for each year from the current year backward)
- `--max-image-bytes <number>` (default 200000; 0 disables size skipping)
- `--image-max-width <number>` (default 640)
- `--image-quality <number>` (default 55)
- In auto mode, images are stored as base64 data URLs (self-contained for the library JSON).
- `--no-preview` (keep preview off and only use URLs in text prompts)

## Join / connection troubleshooting

- Confirm both players are on the same room code exactly (uppercase/lowercase accepted by app).
- If join fails with "Negotiation of connection failed", reload both tabs/devices and recreate the lobby from the host.
- Some restrictive networks block direct peer links; try a different network (or Wi-Fi/hotspot) if it keeps happening.
- Check console errors (`peer-unavailable`, `network`, `disconnected`) to verify where the failure occurs.

## Server policy

- You never need to host your own server for signaling or relay.
- The game uses freely available public services only (PeerJS cloud signaling + public STUN servers).
