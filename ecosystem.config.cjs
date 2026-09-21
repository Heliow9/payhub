module.exports = {
  apps: [
    {
      name: 'payhub-api',
      cwd: __dirname,
      script: 'apps/api/dist/server.js',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'payhub-worker',
      cwd: __dirname,
      script: 'apps/api/dist/worker/main.js',
      restart_delay: 3000,
      min_uptime: '10s',
      max_restarts: 20,
      env: { NODE_ENV: 'production' }
    }
  ]
};
