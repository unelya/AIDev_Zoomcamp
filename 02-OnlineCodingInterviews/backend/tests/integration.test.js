const request = require('supertest');
const { io: Client } = require('socket.io-client');
const { createServer } = require('../src/createServer');
const sessionStore = require('../src/store/sessionStore');

describe('backend integration', () => {
  let app;
  let httpServer;
  let ioServer;
  let baseUrl;

  beforeAll(async () => {
    const serverBundle = createServer({
      clientUrl: 'http://client.test',
      corsOrigin: '*',
      logger: { log: () => {} },
    });
    app = serverBundle.app;
    httpServer = serverBundle.server;
    ioServer = serverBundle.io;

    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        const { port } = httpServer.address();
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise((resolve) => {
      ioServer.close(() => resolve());
    });
    await new Promise((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  beforeEach(() => {
    sessionStore.reset();
  });

  const createClient = () =>
    Client(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

  it('creates a session and returns a share URL', async () => {
    const response = await request(app).post('/api/sessions').send({ language: 'python' });
    expect(response.status).toBe(200);
    expect(response.body.session).toMatchObject({
      language: 'python',
    });
    expect(response.body.shareUrl).toMatch(/^http:\/\/client\.test\/session\//);
  });

  it('broadcasts editor updates between participants', async () => {
    const {
      body: { session },
    } = await request(app).post('/api/sessions').send({ language: 'javascript' });

    const host = createClient();
    const guest = createClient();
    const expectedCode = 'console.log("Collaborative hello");';

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for editor update'));
      }, 7000);

      const cleanup = () => {
        clearTimeout(timeout);
        host.disconnect();
        guest.disconnect();
      };

      const handleError = (message) => {
        cleanup();
        reject(new Error(message));
      };

      host.on('connect', () => {
        host.emit('session:join', { sessionId: session.id, username: 'Host' });
      });

      guest.on('connect', () => {
        guest.emit('session:join', { sessionId: session.id, username: 'Guest' });
      });

      host.on('session:error', handleError);
      guest.on('session:error', handleError);

      guest.on('session:init', () => {
        host.emit('editor:update', { sessionId: session.id, code: expectedCode });
      });

      guest.on('editor:update', ({ code, author }) => {
        try {
          expect(code).toBe(expectedCode);
          expect(author).toBe('Host');
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        } finally {
          cleanup();
        }
      });
    });
  });
});
