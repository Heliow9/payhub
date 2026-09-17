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
      env: { NODE_ENV: 'production' }
    }
  ]
};
