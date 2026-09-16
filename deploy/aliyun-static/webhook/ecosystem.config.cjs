// pm2 配置。所有业务配置都在 deploy/aliyun-static/.env 中，由 server.mjs 自行加载。
// 启动：pm2 start deploy/aliyun-static/webhook/ecosystem.config.cjs

const path = require('node:path')

module.exports = {
  apps: [
    {
      name: 'afilmory-webhook',
      script: path.join(__dirname, 'server.mjs'),
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
}
