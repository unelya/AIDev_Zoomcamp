# Online Coding Interviews

End-to-end platform for running collaborative coding interviews with live sharing, syntax highlighting, and in-browser execution.

## Features

- Create shareable sessions from the dashboard and invite candidates with a single link.
- Real-time collaborative editing powered by Socket.IO with per-user presence and cursor tracking.
- Monaco-based editor with syntax highlighting for JavaScript, TypeScript, and Python.
- Safe in-browser execution using sandboxed Web Workers (JS/TS) and Pyodide (Python running entirely in WASM).
- Participant list, live run results, and copy-to-clipboard helpers for invites.

## Tech Stack

- **Frontend:** React (Vite), @monaco-editor/react, Socket.IO client, Pyodide, TypeScript transpilation for execution.
- **Backend:** Node.js, Express, Socket.IO. Sessions are stored in-memory for simplicity.

## Getting Started

### Backend (`02-OnlineCodingInterviews/backend`)

```bash
cd backend
npm install              # first run only
PORT=4000 CLIENT_URL=http://localhost:5173 npm run dev
```

Environment variables:

- `PORT` – HTTP port (default `4000`).
- `CLIENT_URL` – origin used when generating shareable links.

### Frontend (`02-OnlineCodingInterviews/frontend`)

```bash
cd frontend
cp .env.example .env.local   # optional
npm install                  # first run only
npm run dev                  # serves at http://localhost:5173
```

The `.env` file lets you customize:

- `VITE_API_BASE_URL` – REST base URL (default `http://localhost:4000`).
- `VITE_SOCKET_URL` – Socket.IO endpoint (default `http://localhost:4000`).

Visit `http://localhost:5173`, create a session, and open the link in another tab/window to simulate multiple participants.

#### Verifying local runtimes

- The Execution console now displays which runtime is used (e.g., “Runs in-browser through Pyodide (WASM)” for Python).  
- Stop the backend process after loading the page and run Python again—the code still executes locally, proving it never touches the server.  
- In DevTools → Network, you should only see the one-time Pyodide download; subsequent runs generate no REST calls.

### Run everything together

From `02-OnlineCodingInterviews/` you can boot both services at once:

```bash
npm install          # first run only (installs the root orchestrator deps)
npm run dev          # starts backend and frontend concurrently
```

Logs from the two processes will be interleaved in the same terminal.

### Docker

Build a production image that serves the compiled frontend from Express:

```bash
docker build -t oci .
docker run --rm -p 4000:4000 -e CLIENT_URL=http://localhost:4000 oci
```

Open `http://localhost:4000` to use the app (API + sockets share the same origin). `CLIENT_URL` ensures share links point to the correct host; set it to your public URL in hosted environments.

### Deploying on Render

1. Push this repo (with the Dockerfile) to GitHub/GitLab.  
2. In Render, create a new **Web Service** and choose the Docker environment.  
3. Point it at your repo/branch; no extra build/start commands are needed (the Dockerfile handles everything).  
4. Add an environment variable `CLIENT_URL=https://<your-service>.onrender.com`. Render automatically provides `PORT`, so the server listens on that value.  
5. Deploy. Render will build the frontend, serve it from Express, and expose a single HTTPS endpoint.

### Production build

Frontend: `npm run build` (outputs to `frontend/dist`).  
Backend: `npm run start` (after setting `PORT`/`CLIENT_URL`).

## Testing

Backend integration tests spin up the Express + Socket.IO stack, issue REST calls with Supertest, and exchange real-time events with `socket.io-client`.

```bash
npm run test:backend
```

Frontend tests (Vitest + Testing Library) exercise the React screens, mocking Monaco and sockets to ensure session creation UI works and that the session view emits/receives collaborative events correctly.

```bash
npm run test:frontend
```

## How It Works

1. **Session creation:** Backend issues a short session id and returns a shareable URL. Sessions live in memory until the server restarts.
2. **Collaboration:** Clients connect over Socket.IO, receive the current document snapshot, and broadcast editor/language/cursor changes.
3. **Execution:** Code runs entirely in the browser. JavaScript and TypeScript run inside an isolated web worker. Python runs through Pyodide (WebAssembly). Results are pushed to other participants via sockets for shared visibility.

## Notes & Next Steps

- The in-memory store keeps things simple for demos. Swap in Redis/Postgres for persistence and horizontal scalability.
- Authentication/authorization is intentionally light. Layer in auth if you need interviewer-only actions (e.g., ending a session).
- Code execution currently supports JS/TS/Python. Additional languages can be added by plugging in another WASM/interpreter runtime.

## Deployed at https://onlinecodinginterviews.onrender.com.