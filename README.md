# QuickBite

QuickBite is a food ordering demo with a redesigned frontend and a local Node backend. It includes deployment paths for Vercel and Netlify.

## Features

- Responsive restaurant discovery UI
- Backend-powered restaurant catalog
- Account signup and login with persisted JSON storage
- Session-based authentication using bearer tokens with persisted user records
- Cart, checkout, and saved order history
- Order history with restaurant names, delivery info, and reorder support
- Admin order review dashboard with quick status updates
- Seeded restaurant and menu data
- Vercel and Netlify serverless compatibility with durable GitHub-backed storage

## Run locally

1. Open the project root.
2. Start the backend server:

```bash
npm start
```

3. Open from the same machine:

```text
http://127.0.0.1:3000
```

To allow access from other devices, the Node server now binds to `0.0.0.0` by default. Open it with your machine's LAN IP or a deployed public domain, for example `http://192.168.1.10:3000`.

The local Node server reads and writes JSON files in `backend/data/*.json` by default.

## Environment variables

Copy from `.env.example`.

Common:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

For Vercel and Netlify durable storage:

- `GITHUB_TOKEN`
- `STORE_SECRET`
- `GITHUB_REPO`
- `DATA_BRANCH`
- `DATA_PATH`

## Deploy to Vercel

1. Push the repo to GitHub.
2. Import the repo in Vercel.
3. Add these project environment variables:
   - `GITHUB_TOKEN`
   - `STORE_SECRET`
   - `GITHUB_REPO`
   - `DATA_BRANCH`
   - `DATA_PATH`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
4. Deploy.

Static assets are served from the repo root. API requests are handled by `api/[...path].js`, which forwards to `netlify/functions/api.js`.

## Deploy to Netlify

1. Push the repo to GitHub.
2. Import the repo in Netlify.
3. Netlify will read `netlify.toml`.
4. Add these site environment variables:
   - `GITHUB_TOKEN`
   - `STORE_SECRET`
   - `GITHUB_REPO`
   - `DATA_BRANCH`
   - `DATA_PATH`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
5. Deploy.

## Backend API

- `GET /api/health`
- `GET /api/restaurants`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/session`
- `GET /api/orders`
- `POST /api/orders`

## Notes

- The repository now ships with empty `users`, `sessions`, `orders`, and `admin-sessions` data files so no local personal data is exposed.
- User accounts remain stored in the backend data store until you remove them manually.
- Signed up users remain stored in the JSON database until you manually remove them, so they can log in again later even after long gaps.
- Local development should be served through `backend/server.js`.
- Vercel and Netlify use the shared handler in `netlify/functions/api.js`.
