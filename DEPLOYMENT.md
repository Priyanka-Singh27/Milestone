# Milestone deployment guide

Deploy `server/` as the API on Render and `client/` as a Vite static site on Vercel. Use the checked in `render.yaml` blueprint and the Vercel SPA rewrite/security headers in `client/vercel.json`.

## 1. MongoDB Atlas

1. Create a production cluster and a database named `milestone` (or choose another name and use it consistently).
2. Create a database user with read/write access only to this database. Put its encoded username/password and database name in `DATABASE_URL`.
3. In Network Access, allow the Render outbound addresses for your plan, or use `0.0.0.0/0` only if your operational policy accepts that exposure and database credentials are strong. Never commit the connection string.
4. Before first production start, run the duplicate-roadmap cleanup from `server/` with production `DATABASE_URL`: `node scripts/dedupeRoadmaps.js`. Back up the database first; inspect the script output.

## 2. Render API

Create a Web Service from the repo using `render.yaml` (root directory `server`, Node 20+, `npm ci`, `npm start`). Its health check is `/api/v1/health`. Render injects `PORT`.

Set these environment variables in Render:

| Variable | Required | Value |
|---|---:|---|
| `NODE_ENV` | yes | `production` |
| `DATABASE_URL` | yes | Atlas URI for the production database |
| `JWT_SECRET` | yes | Unique cryptographically random secret, at least 32 characters |
| `INTERNAL_API_KEY` | yes | Different random secret, at least 32 characters |
| `TOKEN_ENCRYPTION_KEY` | yes | Separate random secret for Google refresh-token encryption |
| `FRONTEND_URL` | yes | Exact Vercel site origin(s), comma-separated, no path or trailing slash |
| `INTERNAL_API_URL` | yes | Render API origin, with or without `/api/v1` |
| `LLM_PROVIDER` | yes | `groq` for production |
| `LLM_API_KEY` | yes | Groq API key |
| `CLOUDINARY_CLOUD_NAME` | yes for uploads | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | yes for uploads | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | yes for uploads | Cloudinary API secret |
| `GOOGLE_CLIENT_ID` | optional | OAuth client ID; required for Google sign-in and Sheets |
| `GOOGLE_CLIENT_SECRET` | optional | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | optional | `https://<api-host>/api/v1/auth/google/callback` |
| `GOOGLE_SHEETS_REDIRECT_URI` | optional | `https://<api-host>/api/v1/applications/sheets/callback` |

Generate separate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. Do not use the sample values in `.env.example`. `LLM_PROVIDER=mock` is local-only and rejected in production.

The free Render plan may sleep; the client displays a waking-up message after five seconds. The first API request may take around 30–60 seconds.

## 3. Google Cloud (optional)

1. Create a Google Cloud project, configure the OAuth consent screen, and add the required app domain and test/production users.
2. Enable the Google Sheets API.
3. Create a Web application OAuth client. Add the Vercel origin (for example `https://milestone.vercel.app`) under Authorized JavaScript origins.
4. Add both exact API callback URLs under Authorized redirect URIs: `/api/v1/auth/google/callback` and `/api/v1/applications/sheets/callback` on the Render host.
5. Set the four Google variables above. The callback URI in each OAuth flow must match the corresponding Google Cloud entry exactly.

## 4. Vercel frontend

Import the repository into Vercel and set the project Root Directory to `client`, Framework Preset to Vite, Build Command to `npm run build`, and Output Directory to `dist`.

Set `VITE_API_BASE_URL` to `https://<api-host>/api/v1` (no trailing slash). `VITE_API_URL` is accepted as a fallback. The build-time Vite plugin emits a Content-Security-Policy meta tag whose `connect-src` includes only the configured API origin. Do not put secrets in `VITE_*` variables; Vite embeds them in the browser bundle. Fonts use local system fallbacks, and no third-party script is required.

After deployment, set Render `FRONTEND_URL` to the exact Vercel origin and redeploy/restart the API. Add custom domains to both Google Authorized JavaScript origins and Render `FRONTEND_URL` when applicable.

## 5. Local environment and smoke checks

Copy `server/.env.example` to `server/.env`, set the required local values, and use `LLM_PROVIDER=mock` if no Groq key is available. Copy `client/.env.example` to `client/.env` and point it to the local API. Keep `FRONTEND_URL` equal to the exact Vite origin (default `http://localhost:5173`). `.env` files are ignored by git.

After deploy, replace the sample host and run:

```sh
curl -i https://<api-host>/api/v1/health
curl -i https://<api-host>/api/v1/roles
curl -i https://<api-host>/api/v1/profile
```

The health route should return HTTP 200 with `{ "success": true, "data": { "status": "ok" } }`; roles should return HTTP 200; profile without a bearer token should return HTTP 401. Then create a test account in the UI, confirm profile restore, roadmap loading, and logout. Test Google sign-in, Sheets connect/sync, certificate upload, and Groq generation only after their respective provider credentials are configured.

## 6. Date behavior and rollback

The “Today” card uses the student's local calendar date while roadmap dates are stored/derived in UTC. Around timezone boundaries, a local day can differ from the server day; this is a known limitation.

For rollback, use Render's previous successful deploy and Vercel's previous deployment. If a migration or data cleanup was run, restore from the pre-change database backup before rolling application code back. Keep secrets stable during routine deploys so existing sessions and encrypted Google grants remain valid.
