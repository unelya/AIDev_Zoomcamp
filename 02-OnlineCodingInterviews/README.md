# Online Coding Interviews

End-to-end platform for running collaborative coding interviews with live sharing, syntax highlighting, and in-browser execution.

## Features

- Create shareable sessions from the dashboard and invite candidates with a single link.
- Real-time collaborative editing powered by Socket.IO with per-user presence and cursor tracking.
- Monaco-based editor with syntax highlighting for JavaScript, TypeScript, and Python.
- Safe in-browser execution using a sandboxed web worker (JS/TS) and the Skulpt interpreter (Python).
- Participant list, live run results, and copy-to-clipboard helpers for invites.

## Tech Stack

- **Frontend:** React (Vite), @monaco-editor/react, Socket.IO client, Skulpt, TypeScript transpilation for execution.
- **Backend:** Node.js, Express, Socket.IO. Sessions are stored in-memory for simplicity.

## Getting Started

### 1. Backend

```bash
cd backend
npm install
npm run dev
```

Environment variables:

- `PORT` – defaults to `4000`.
- `CLIENT_URL` – public origin used when generating share links (defaults to `http://localhost:5173`).

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local   # optional, adjust API URLs if needed
npm install
npm run dev
```

Key env vars:

- `VITE_API_BASE_URL` – REST base URL (default `http://localhost:4000`).
- `VITE_SOCKET_URL` – Socket.IO server URL (default `http://localhost:4000`).

Visit `http://localhost:5173` to create or join a session.

## How It Works

1. **Session creation:** Backend issues a short session id and returns a shareable URL. Sessions live in memory until the server restarts.
2. **Collaboration:** Clients connect over Socket.IO, receive the current document snapshot, and broadcast editor/language/cursor changes.
3. **Execution:** Code runs entirely in the browser. JavaScript and TypeScript run inside an isolated web worker. Python runs through Skulpt with the bundled stdlib. Results are pushed to other participants via sockets for shared visibility.

## Notes & Next Steps

- The in-memory store keeps things simple for demos. Swap in Redis/Postgres for persistence and horizontal scalability.
- Authentication/authorization is intentionally light. Layer in auth if you need interviewer-only actions (e.g., ending a session).
- Code execution currently supports JS/TS/Python. Additional languages can be added by plugging in another WASM/interpreter runtime.
