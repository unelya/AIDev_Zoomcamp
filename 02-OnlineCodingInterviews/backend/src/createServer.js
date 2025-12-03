const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');
const sessionStore = require('./store/sessionStore');

const DEFAULT_CLIENT_URL = 'http://localhost:5173';

const createServer = ({ clientUrl = DEFAULT_CLIENT_URL, corsOrigin = '*', logger = console } = {}) => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/sessions', (req, res) => {
    const { language } = req.body || {};
    const session = sessionStore.createSession(language);
    res.json({
      session,
      shareUrl: `${clientUrl}/session/${session.id}`,
    });
  });

  app.get('/api/sessions/:id', (req, res) => {
    const session = sessionStore.getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    return res.json(session);
  });

  const staticDir = path.join(__dirname, '..', 'public');
  const staticIndex = path.join(staticDir, 'index.html');
  const shouldServeFrontend = fs.existsSync(staticIndex);

  if (shouldServeFrontend) {
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.method !== 'GET') {
        return next();
      }
      return res.sendFile(staticIndex);
    });
  }

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    let activeSessionId = null;

    const removeParticipant = () => {
      if (!activeSessionId) {
        return;
      }
      const session = sessionStore.getSession(activeSessionId);
      if (!session) {
        return;
      }
      if (session.participants[socket.id]) {
        const username = session.participants[socket.id].username;
        delete session.participants[socket.id];
        sessionStore.updateSession(activeSessionId, { participants: session.participants });
        socket.to(activeSessionId).emit('presence:left', {
          id: socket.id,
          username,
        });
      }
    };

    socket.on('session:join', ({ sessionId, username }) => {
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        socket.emit('session:error', 'Session not found');
        return;
      }
      activeSessionId = sessionId;
      socket.join(sessionId);
      const participant = {
        username: username?.trim() || 'Guest',
        joinedAt: Date.now(),
      };
      session.participants[socket.id] = participant;
      sessionStore.updateSession(sessionId, { participants: session.participants });

      socket.emit('session:init', {
        id: session.id,
        code: session.code,
        language: session.language,
        participants: { ...session.participants },
      });

      socket.to(sessionId).emit('presence:join', {
        id: socket.id,
        ...participant,
      });
    });

    socket.on('editor:update', ({ sessionId, code }) => {
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        socket.emit('session:error', 'Session not found');
        return;
      }
      sessionStore.updateSession(sessionId, { code });
      socket.to(sessionId).emit('editor:update', {
        code,
        author: session.participants[socket.id]?.username || 'Unknown',
        timestamp: Date.now(),
      });
    });

    socket.on('language:update', ({ sessionId, language }) => {
      const session = sessionStore.getSession(sessionId);
      if (!session) {
        socket.emit('session:error', 'Session not found');
        return;
      }
      sessionStore.updateSession(sessionId, { language });
      socket.to(sessionId).emit('language:update', {
        language,
        author: session.participants[socket.id]?.username || 'Unknown',
      });
    });

    socket.on('cursor:update', ({ sessionId, cursor }) => {
      if (!sessionId) {
        return;
      }
      socket.to(sessionId).emit('cursor:update', {
        cursor,
        userId: socket.id,
        username: sessionStore.getSession(sessionId)?.participants[socket.id]?.username || 'Guest',
      });
    });

    socket.on('run:result', ({ sessionId, output, error }) => {
      if (!sessionId) {
        return;
      }
      socket.to(sessionId).emit('run:result', {
        output,
        error,
        author: sessionStore.getSession(sessionId)?.participants[socket.id]?.username || 'Guest',
        timestamp: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      removeParticipant();
    });
  });

  const listen = (port, callback) =>
    server.listen(port, () => {
      logger.log(`Backend listening on port ${port}`);
      if (callback) {
        callback();
      }
    });

  return { app, server, io, listen };
};

module.exports = { createServer };
