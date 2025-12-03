const PORT = process.env.PORT || 4000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const { createServer } = require('./createServer');

const { listen } = createServer({
  clientUrl: CLIENT_URL,
  corsOrigin: '*',
});

listen(PORT);
