# macOS 朋友自助安装版

这个版本由每位使用人使用自己的网易云账号、Spotify Developer App、GitHub 账号、仓库和 Secrets。没有作者托管后台，不共用作者的 Client ID、令牌或配额。

## 使用人流程

1. 下载适合自己 Mac 架构的 ZIP，解压并双击 `Daily Relay.app`。内置 Node.js 与 GitHub CLI，无需终端。
2. 网易云扫码登录。二维码过期可重新生成。
3. 按页面逐步创建自己的 Spotify 应用，添加 `http://127.0.0.1:18787/auth/spotify/callback`，只选择 Web API，粘贴自己的 Client ID 并授权。开发模式要求应用所有者拥有有效 Premium。这一步需要本人操作 Spotify 后台，助手不能代替接受条款。
4. 确认 GitHub 权限提示，用自己的账号输入一次性设备码并授权官方 GitHub CLI。
5. 选择私有或公开仓库，确认部署。助手创建独立仓库、私密歌单、Secrets 和加密状态，安装定时工作流，最后提交首次同步。
6. 查看页面上的真实同步日期和曲目数量。GitHub 任务绿色、已部署、已提交都不等于同步成功。可刷新、手动同步、重新登录、暂停或恢复。

默认私有仓库使用账号已有 Actions 免费额度；超额行为取决于用户 GitHub 账单设置，助手不启用付费额度。公开仓库的标准 GitHub-hosted runner 当前免费，但源码和加密状态公开可见。两种方式均不上传明文凭证。GitHub 定时不保证准点，账号登录和 API 配额也可能需要人工处理。

## 账号与安全

- 配置存放在 `~/Library/Application Support/Daily Relay`，与开发项目 `.data` 完全隔离；目录权限 0700、状态文件 0600。
- GitHub CLI 使用独立 `GH_CONFIG_DIR`，清除继承的 GH_TOKEN/GITHUB_TOKEN，不借用电脑上已有的 GitHub CLI 登录。官方 CLI 授权请求 repo/workflow，权限范围比单一仓库更广；页面明确说明。令牌保存在专属目录内的本地文件，不使用系统钥匙串。只在可信个人电脑使用。
- 程序只向当前授权用户本人创建的 `daily-relay-<随机标识>` 仓库部署；记录安装标识并校验仓库所有者及标记。遇到无关同名仓库会停止，绝不覆盖。
- 部署期间关闭新仓库 Actions；Secrets、代码和加密初始状态都准备好后才开启。音乐配额记录也转移到云端，不因安装重置。
- 不建立本地音乐同步定时器。云端接管后本机不能直接刷新音乐令牌；重新授权先停用云端工作流、确认没有在运行的任务，再读取最新令牌并更新配置。
- 页面绑定 127.0.0.1，使用随机会话 Cookie、Host/Origin 校验、JSON-only 写接口、CSP 和无外部脚本。没有公开网络管理入口。
- 打包使用白名单，排除 .git、.data、state.enc、GitHub 登录状态和发布者的个人配置。构建完成检查禁止文件名。
- 换电脑前安全备份配置目录，尤其是加密密钥。不要把备份分享给朋友。删除 .app 不会停用云端定时；先点“暂停自动同步”。

## 开发与打包

`pnpm setup` 启动本机引导页。使用 `DAILY_RELAY_DATA_DIR` 和 `DAILY_RELAY_INSTALLER_PORT` 可指定测试专属目录和端口，不要指向作者现有 .data。

在对应架构的 macOS 运行：

```sh
pnpm install --frozen-lockfile --ignore-scripts
node --test
node scripts/prepare-macos-tools.js
node scripts/build-macos.js
```

准备脚本从官方 GitHub CLI v2.100.0 发布下载对应架构并校验官方 SHA-256，同时下载完整 Node.js 与 GitHub CLI 许可证。构建使用当前 Node 可执行文件，产物落在 dist 中的新目录，不覆盖旧包。

这是 ad-hoc 签名的内测包，**未经过 Apple Developer ID 签名和公证**。下载后 macOS 可能要求到“系统设置 → 隐私与安全性”手动批准；不要全局关闭 Gatekeeper。真正无警告的首次双击体验需要发布者提供 Apple Developer 账号与签名、公证配置。公司受管设备可能不允许此版本。

离线自动测试覆盖本地接口安全、账号隔离、凭证非公开、同名仓库保护和模拟完整部署顺序。真实 Spotify / 网易云 / GitHub 授权还需要使用人的账号进行一次验收，不能以模拟测试冒充真实成功。Windows 暂无可交付包。
