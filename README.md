# Daily Relay

把网易云音乐的每日推荐，自动同步到你自己的 Spotify 歌单。

每天更新同一张歌单，保留网易云的歌曲顺序；优先匹配相同录音，未命中时再检查同一歌手的其他版本。不下载音频，不搬运音乐文件。

[下载安装包](https://github.com/aaronsxzhao/neteast-spotify/releases) · [完整安装指引](docs/friend-installer.md) · [云端运行与故障排查](docs/github-actions.md)

## 给朋友：下载、双击、跟着连接

当前提供 **macOS Apple Silicon 内测版**，适用于 M 系列芯片、macOS 13 或更新系统。Intel Mac 和 Windows 暂无已验证的安装包。

1. 在 [Releases](https://github.com/aaronsxzhao/neteast-spotify/releases) 下载附带的 **macOS arm64 ZIP 安装包**，不要选自动生成的 `Source code`。
2. 解压，将 `Daily Relay.app` 放到“应用程序”或自己的文件夹，然后双击。
3. 浏览器会自动打开安装界面。按顺序连接网易云、Spotify，再确认一次 GitHub 授权。
4. 点击“开启我的每日同步”，等待页面显示实际同步日期和匹配数量。**部署完成、任务已提交，不代表首次同步已经成功。**
5. 成功后可以退出 App、关闭电脑。以后再次双击 App，可以查看状态、手动补跑、重新连接或暂停同步。

安装包内置 Node.js 和 GitHub CLI。朋友不需要安装开发工具、打开终端、手动创建仓库、填写 Secrets 或编辑 GitHub 工作流。

> 这是未经过 Apple Developer ID 签名及公证的内测包。首次打开可能被 macOS 拦截：确认来源可信后，先尝试打开，再到“系统设置 → 隐私与安全性”按系统提示允许打开。不要全局关闭系统安全保护。公司受管电脑可能无法运行。

### 需要准备什么？

- 自己的网易云音乐账号，以及手机上的网易云 App，用于扫码登录。
- 自己的 Spotify 账号和自己创建的 Spotify Developer App。Spotify 当前要求开发模式应用所有者拥有有效 Premium，详见 [官方说明](https://developer.spotify.com/documentation/web-api/concepts/quota-modes)。
- 自己的 GitHub 账号，用于承载每日任务。

**并不是完全只点两个登录按钮。** Spotify 的开发者应用仍需本人创建一次，页面提供完整指引；GitHub 也需要本人确认授权。之后的仓库、凭证与定时任务由助手配置。

### Spotify 首次设置

1. 打开 [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)，使用自己的账号创建应用。
2. 添加安装界面显示的 Redirect URI。默认安装版地址为：

   ```text
   http://127.0.0.1:18787/auth/spotify/callback
   ```

3. API / SDK 选择 **Web API**，阅读并确认 Spotify 的条款。
4. 从应用 Settings 复制 **Client ID**，粘贴到安装界面并连接 Spotify。不要填写 Client Secret。
5. 如后台出现 Users and Access，确认自己的 Spotify 登录邮箱在允许用户列表中。

### 为什么浏览器打开的是 localhost？

`localhost` / `127.0.0.1` 指的是**正在使用它的那台电脑**，不是项目作者的电脑。

朋友双击 App 后，内置服务会在朋友的 Mac 上启动，自动打开带有本机会话授权的浏览器页面。无需输入地址，也无需作者保持电脑在线。**分享时发送安装包或 Release 链接，不要发送你自己的 localhost 地址。**

界面复用本项目原有的 Daily Relay 前端，只增加安装引导和云端管理。安装版不运行本地音乐同步定时器；部署后的同步由朋友自己的 GitHub Actions 执行。

## 每个人都使用自己的资源

网易云登录、Spotify 应用和歌单、GitHub 仓库、Secrets、加密状态都属于使用人。没有项目作者托管的账号后台，也不共用作者的音乐凭证。

| 项目 | 保存位置与行为 |
| --- | --- |
| 安装助手的本机配置 | `~/Library/Application Support/Daily Relay`，与开发项目的 `.data` 隔离 |
| GitHub 登录 | 安装助手的独立配置目录，清除继承的 GitHub 令牌，不借用其他程序的 CLI 登录 |
| 音乐凭证与状态加密密钥 | 使用人自己的 GitHub Actions Secrets |
| 云端运行进度与刷新令牌 | 专用 `daily-relay-state` 分支中的 AES-256-GCM 加密文件 |
| Spotify 目标 | 默认创建一张私密歌单，每日替换其内容，而不是不断新建歌单 |

GitHub 官方 CLI 需要仓库和工作流权限，授权范围可能覆盖你有权限的其他仓库；助手只操作自己创建并校验归属的 Daily Relay 仓库。GitHub 登录令牌保存在本机文件中，不使用系统钥匙串。请仅在自己的可信电脑上使用。

不要分享配置目录、`MUSIC_U`、刷新令牌、加密密钥或状态备份。GitHub Secrets 并不防范拥有工作流修改权限的人，请只授予可信协作者仓库权限。换电脑前安全备份本机配置；仅删除 App 不会停止云端任务，停用前应先点击“暂停自动同步”。

## 每天如何同步？

- 默认在北京时间约 **08:17** 运行，09:17、10:17 补查；成功后跳过当天重复同步。
- 每小时第 35 分钟检查遗漏或失败任务。当天早上 08:00 后尚未成功时尝试补跑；已有待恢复任务也会在冷却结束后续跑。
- GitHub 定时可能延迟或漏发，不保证准点。页面中的“立即同步”可提交补跑，但不会强行绕过冷却。
- 关闭电脑不影响已部署的云端任务；首次验证仍须确认 GitHub 运行环境能够访问自己的网易云账号。

### 匹配策略

1. 优先利用网易云的 `tns`、`transNames`、`alia`、`alias` 等翻译和别名。
2. 拆分双语标题，例如 `韩文 (English)`；依次尝试标题与艺人、仅标题等搜索。
3. 结合标题、歌手、时长和专辑判断。跨语言艺人名不同需要更严格的证据，不因歌名相似就接受。
4. 严格匹配仍失败时，再检查**同一主要歌手、同一首歌的不同版本**，例如现场、原声、重录或混音版，并标记为替代版本。
5. 人工别名仅作为最后补充。不确定、无版权或地区不可用的歌曲可能仍未匹配。

匹配依据是元数据，不是音频指纹，不能保证 100% 准确或完整。云端只在完整处理本次推荐后更新歌单；请求暂停不会把半成品写入目标歌单。每日同步会替换歌单内容，手动加到这张专用歌单里的歌曲可能被覆盖。

### 冷却和自动重试

**Spotify 的冷却**与**本程序的安全暂停**不同：

- 收到 Spotify `429` 时保存 `Retry-After`，立即停止，等待期限结束。手动补跑也不能绕过。
- 程序另设请求间隔、每次运行与滚动一小时预算；遇到网络错误或 `5xx` 时使用逐步延长的本地退避。
- 已完成歌曲及成功查询结果会加密保存，后续任务续跑，不在失败后立即从头重复搜索。
- 保守预算可能让首次匹配分多次运行完成，但**不能保证永不触发 Spotify 限流**。

详细规则、同日未匹配修复参数和日志解读见 [GitHub Actions 文档](docs/github-actions.md)。

## 费用和已知限制

- 默认创建私有仓库，使用自己账号已有的 Actions 额度；超额行为取决于 GitHub 账单设置。公开仓库的标准 GitHub-hosted runner 当前免费，但源码和加密状态公开可见。助手不会启用付费额度。参见 [GitHub 官方计费说明](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。
- Spotify Premium 的要求独立于本项目；本项目不提供订阅或账号。
- 网易云每日推荐使用社区维护的 `@neteasecloudmusicapienhanced/api`，不是网易云官方开放 API，接口变化、地区或 IP 限制可能导致失败。
- 音乐授权会失效。安装版请使用“重新连接账号”，由助手先暂停云端再更新凭证，避免本机与云端令牌冲突。
- 当前验证包含 96 项自动化测试、空白账号隔离、安装包启动及重复打开检查。**这不等同于每个朋友的真实账号已通过完整云端同步验收。**
- 当前安装包为内测版本，没有自动升级机制；后续程序变更不会自动更新已部署到朋友账号下的仓库。

## 给开发者：运行现有本地界面

需要 Node.js 22+ 与 pnpm。此模式与上面的朋友安装版不同：本地定时需要进程持续运行。

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm start
```

打开 <http://127.0.0.1:8787>，Spotify 回调地址使用：

```text
http://127.0.0.1:8787/auth/spotify/callback
```

连接网易云和 Spotify，保存设置后手动同步。本地模式支持应用自定义封面，以及扫码失败时手动填写网易云 Cookie；Cookie 是登录凭证，不要发送给其他人。

| 运行方式 | 默认端口 | 本机状态目录 | 是否需要电脑持续开机 |
| --- | --- | --- | --- |
| 朋友安装版 / `pnpm setup` | `18787` | `~/Library/Application Support/Daily Relay` | 云端部署后不需要 |
| 原本地界面 / `pnpm start` | `8787` | 项目下 `.data` | 本地自动同步需要 |

本地模式的 `HOST`、`PORT`、`APP_ORIGIN` 可通过环境变量配置。不要把没有登录界面的开发服务暴露到公网。更改端口后，Spotify 回调地址必须同步修改。

开发者手动配置云端时参见 [GitHub Actions 文档](docs/github-actions.md)。同一套音乐凭证交给云端后，应关闭本地自动同步，不要让两个进程同时管理它们。

## 测试与打包

在目标架构的 macOS 上：

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
node scripts/prepare-macos-tools.js
pnpm build:mac
```

准备脚本下载官方 GitHub CLI、校验 SHA-256 并准备完整依赖许可证。构建内置当前 Node.js 可执行文件及所需依赖，输出 `.app` 和 ZIP 到 `dist/`，仅作 ad-hoc 签名，不进行 Apple 公证。

源码运行安装助手前，先运行准备脚本，并将其输出的 CLI 路径配置为 `DAILY_RELAY_GH_PATH`，然后 `pnpm setup`。测试时用 `DAILY_RELAY_DATA_DIR` 指向独立临时目录，不要指向真实 `.data`。详见 [安装版开发说明](docs/friend-installer.md)。

主要目录：`public/` 为共用前端，`installer/` 为安装引导片段与控制逻辑，`src/` 为账号、匹配、同步及部署逻辑，`scripts/` 为启动和打包工具，`test/` 为回归测试。

Git 仓库只保存源码、文档和静态素材。`.data/`、`node_modules/`、`.build-tools/`、`dist/` 不提交；对外分发的安装包放在 Releases，不包含发布者的登录凭证。

---

Daily Relay 与网易云音乐、Spotify、GitHub 均无隶属关系。仅用于重建 Spotify 已有曲目的歌单，不下载或转移音频。请遵守相关服务条款。
