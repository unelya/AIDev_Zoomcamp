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

Build and run both services inside a single container:

```bash
docker build -t oci .
docker run --rm -p 4000:4000 -p 5173:5173 oci
```

This runs the backend on `4000` and the Vite dev server on `5173` via `npm run dev`.

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
