// PM2 processes for production. Start with: pm2 start ecosystem.config.cjs
// Memory caps keep QuickPrint from starving other apps on a small server.
const path = require('node:path');

const shared = {
  interpreter: 'none',
  script: 'node',
  autorestart: true,
  exp_backoff_restart_delay: 500,
  kill_timeout: 8000,
  time: true,
};

module.exports = {
  apps: [
    {
      ...shared,
      name: 'seedhaprint-api',
      cwd: path.join(__dirname, 'apps/api'),
      args: '--max-old-space-size=512 --env-file=.env --import tsx src/server.ts',
      max_memory_restart: '450M',
    },
    {
      ...shared,
      name: 'seedhaprint-web',
      cwd: path.join(__dirname, 'apps/web'),
      args: '--max-old-space-size=256 ../../node_modules/next/dist/bin/next start -p 3100 -H 127.0.0.1',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '400M',
    },
  ],
};
