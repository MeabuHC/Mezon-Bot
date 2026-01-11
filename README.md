# Mailzon (Mezon-Bot)

Mailzon is a lightweight bot that sends email alerts to Mezon users. It authenticates users via OAuth (e.g., Gmail), stores tokens securely, and notifies subscribed users when new mail arrives.

## Requirements

- Node.js >= 18
- npm
- A Mezon Developer application (create one at https://dev-developers.nccsoft.vn/)

## Environment variables

Create a `.env` file (copy `.env.example` if present) and set the following variables:

- `MEZON_BOT_TOKEN` — bot token
- `OAUTH_CLIENT_ID` — OAuth client ID (Google)
- `OAUTH_CLIENT_SECRET` — OAuth client secret (Google)
- `OAUTH_REDIRECT_URI` — registered OAuth redirect URI (must match `src/server/oauthCallback.ts`)
- `DATABASE_URL` — database connection string for Prisma (if used)
- `PORT` — server port (default: `3000`)
- `NODE_ENV` — `development` or `production`

Ensure the `OAUTH_REDIRECT_URI` configured in your OAuth provider matches the callback route used by this app.

## Install and run (local)

1. Install dependencies:

```bash
npm install
```

2. Run in development (watch + restart):

```bash
npm run dev
```

3. Build and run for production:

```bash
npm run build
npm run start
```

Note: the repository `package.json` contains `dev`, `build`, and `start` scripts. Adjust if you prefer a `start:prod` variant.

## Prisma (if using database)

If you use Prisma (the project includes a `prisma/` folder), run:

```bash
npm run prisma:generate
# Apply migrations in development
npm run prisma:migrate
# For production migrations you can run
npx prisma migrate deploy
```

## Deploy to Render

This project is configured for Render. The included `render.yaml` sets up a Node web service.

Steps to deploy on Render:

1. Push your repository to a Git provider (GitHub/GitLab).
2. On Render, create a new Web Service and connect the repository and branch (e.g., `dev`).
3. Render will use the commands from `render.yaml`:

```text
buildCommand: npm install && npm run build
startCommand: npm run start
```

4. Add the required environment variables in the Render dashboard (`MEZON_BOT_TOKEN`, `OAUTH_CLIENT_ID`, etc.).
5. Ensure the OAuth redirect URI points to your Render app's URL plus the callback path (e.g., `https://<your-app>.onrender.com/oauth/callback`).

Render will automatically build and deploy on each push to the configured branch if `autoDeploy` is enabled.

## Health check

Render configuration includes a `healthCheckPath: /health`. Verify your service exposes a health endpoint or update the path on Render.

## Troubleshooting

- Check application logs on Render or locally for OAuth errors and migration issues.
- If token issues occur, clear local cache in `mezon-cache/` and re-authorize.

## Where to look in the code

- Main entry: `src/index.ts`
- Server and OAuth callback: `src/server/` (see `oauthCallback.ts`)
- Services: `src/services/`
- Commands and handlers: `src/commands/`, `src/handlers/`

If you want, I can add a `start:prod` script to `package.json` or prepare a small Render-specific checklist and open a PR for these changes.
