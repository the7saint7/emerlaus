# Emerlaus

Base scaffold for a Discord Activity card game with:

- a TypeScript web client
- a small Express backend
- shared match and seating logic
- a standalone Python bot AI module for future work

## What exists now

- Discord Activity-ready client bootstrap
- lobby screen with host controls
- table skeleton based on relative seating from the local player's point of view
- in-memory match state keyed by Discord `instanceId`
- host transfer and player-to-bot replacement rules stubbed in on the server
- separate Python file for future difficulty-based bot AI

## Project structure

```text
client/      Frontend Activity app
server/      Express API and in-memory match state
shared/      Shared types and seat-order helpers
bot_ai/      Future Python AI logic
```

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in Discord values when ready.

3. Start the app:

```bash
npm run dev
```

4. Open `http://localhost:5173`.

Without Discord credentials, the client runs in browser mock mode so the UI and seat logic can still be developed.

## Discord notes

- Create a Discord application and enable Activities.
- For local Discord testing, use a tunnel that points at the Vite dev server on `http://localhost:5173`.
- For alpha hosting, deploy the built Express server and built client together so Discord only needs one public base URL.
- For local testing through Discord, run a tunnel such as:

```bash
cloudflared tunnel --url http://localhost:5173
```

- Map `/` in the Discord Developer Portal to the tunnel host.
- The server exposes `POST /api/token` for the OAuth code exchange used by the Embedded App SDK flow.
- After `npm run build`, `npm start` serves the built client and API from one origin.
- See `docs/discord-activity-setup.md` for the exact local test and alpha publication flow for this repo.
