# QuickBite

QuickBite is a food ordering demo with a redesigned frontend and a local Node backend.

## Features

- Responsive restaurant discovery UI
- Backend-powered restaurant catalog
- Account signup and login with persisted JSON storage
- Session-based authentication using bearer tokens
- Cart, checkout, and saved order history
- Seeded restaurant and menu data

## Run locally

1. Open the project root.
2. Start the backend server:

```bash
npm start
```

3. Open:

```text
http://localhost:3000
```

## Backend API

- `GET /api/health`
- `GET /api/restaurants`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/session`
- `GET /api/orders`
- `POST /api/orders`

## Notes

- User data, sessions, and orders are stored in `backend/data/*.json`.
- This app should be served through `backend/server.js` so the frontend can call the backend APIs.
