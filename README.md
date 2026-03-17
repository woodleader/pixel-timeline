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

## Run locally

1. Open the folder in a local static server.
2. Go to `index.html`.
3. Enter a username.
4. Create or join a lobby.

## Deploy to GitHub Pages

1. Push these three files to a GitHub repo.
2. Enable GitHub Pages from the repo root.
3. Share the lobby code from Host and join from a second browser/device.

## Replace assets

`script.js` currently uses seeded placeholder images from `picsum.photos`.
Replace `GAME_CARDS` entries with real screenshots and correct release metadata.

## Join / connection troubleshooting

- Confirm both players are on the same room code exactly (uppercase/lowercase accepted by app).
- If join fails with "Negotiation of connection failed", reload both tabs/devices and recreate the lobby from the host.
- Some restrictive networks block direct peer links; try a different network (or Wi-Fi/hotspot) if it keeps happening.
- Check console errors (`peer-unavailable`, `network`, `disconnected`) to verify where the failure occurs.

## Server policy

- You never need to host your own server for signaling or relay.
- The game uses freely available public services only (PeerJS cloud signaling + public STUN servers).
