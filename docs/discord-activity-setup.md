# Discord Activity Setup

This project is already close to a Discord Activity. The missing operational piece is making Discord point at the right public URL and keeping the frontend and API on the same origin.

## 1. Discord App Setup

In the Discord Developer Portal:

1. Create or open your application.
2. Copy the Application ID into `DISCORD_CLIENT_ID`.
3. Copy the Client Secret into `DISCORD_CLIENT_SECRET`.
4. Under `Activities -> Settings`, enable `Activities`.
5. Leave the default `Launch` entry point command enabled unless you plan to replace it yourself.

Notes:

- `DISCORD_PUBLIC_KEY` is useful for future interaction validation, but this codebase does not currently depend on it for Activity launch.
- `DISCORD_REDIRECT_URI` is optional in this repo. Leave it blank unless you intentionally configure a matching redirect URI in Discord.

## 2. Local Development Outside Discord

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

If `DISCORD_CLIENT_ID` is empty or the app is not inside Discord, the client falls back to browser mock mode.

## 3. Local Testing Inside Discord

Start the app locally:

```bash
npm run dev
```

Start a tunnel to the Vite server:

```bash
cloudflared tunnel --url http://localhost:5173
```

Then in the Discord Developer Portal:

1. Open `Activities -> URL Mappings`.
2. Add `/` -> `<your cloudflared host>`.
3. Save.

Then in Discord:

1. Join a test server where your developer account can use the app.
2. Open a text or voice channel.
3. Launch the app from the App Launcher.

How this repo works in local Discord testing:

- Discord loads the Activity from the tunnel URL on port `5173`.
- Vite proxies `/api/*` requests to the local Express server on `3001`.
- The Embedded App SDK handles the authorize/authenticate flow.

If the Activity opens but auth fails:

- Verify `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.
- Clear `DISCORD_REDIRECT_URI` unless you explicitly registered the same value in Discord.
- Confirm the tunnel is still alive and the URL mapping still points at the current tunnel hostname.

## 4. Alpha Deployment

This repo now supports a single-origin deployment:

```bash
npm run build
npm start
```

`npm start` runs `dist/server/server/index.js`, and the Express server serves:

- the built frontend from `dist/client`
- the API from `/api/*`

That means your hosting target only needs to expose one public HTTPS base URL.

Recommended alpha shape:

1. Deploy the app to one HTTPS host.
2. Set `PORT`, `DISCORD_CLIENT_ID`, and `DISCORD_CLIENT_SECRET` in the host environment.
3. Point Discord `Activities -> URL Mappings` `/` at that host.
4. Set the Discord application Terms of Service URL to `https://<your-host>/terms`.
5. Set the Discord application Privacy Policy URL to `https://<your-host>/privacy`.
6. Launch the Activity from Discord and verify multiplayer joins, chat, and game state updates.

## 5. What To Put In Discord

For this codebase, the important Discord configuration is:

- `Activities -> Settings`: enable Activities
- `Activities -> URL Mappings`: map `/` to your public Activity host
- `General Information` or the relevant review form: use `https://<your-host>/terms` as the Terms of Service URL
- `General Information` or the relevant review form: use `https://<your-host>/privacy` as the Privacy Policy URL

You do not need a separate public backend hostname if you deploy this repo as one service.

## 6. Before Wider Testing

Check these before inviting more people:

- The host is HTTPS.
- The deployed build starts with `npm start`.
- At least two Discord users can join the same Activity instance.
- `/api/token` succeeds in Discord.
- Your hosting platform allows long-lived HTTP connections for SSE on `/api/matches/:instanceId/events`.

## 7. Practical Recommendation

For the next step, do this:

1. Leave `DISCORD_REDIRECT_URI` blank.
2. Run `npm run dev`.
3. Create a `cloudflared` tunnel to `http://localhost:5173`.
4. Map `/` to that tunnel host in the Developer Portal.
5. Launch from Discord.

If that works, deploy the built app as one service and replace the tunnel mapping with your real alpha URL.
