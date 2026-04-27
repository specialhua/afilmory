import { defineConfig } from 'nbump'

export default defineConfig({
  mode: 'monorepo',
  packages: ['apps/*', 'packages/*', 'be/apps/*', 'be/packages/*'],

  // 不打 git tag
  tag: false,

  // 不自动 push，手动控制
  push: false,

  // 不自动 publish，手动控制
  publish: false,

  // 自定义 commit message
  // eslint-disable-next-line no-template-curly-in-string
  commit_message: 'chore(release): bump @afilmory/viewer-motion to v${NEW_VERSION}',

  // bump 前执行
  leading: ['pnpm install'],

  // 允许的分支
  allowed_branches: ['main', 'master'],
})
