# qq-cli

一个运行在终端里的 QQ 聊天客户端，基于 OneBot v11 WebSocket 协议连接 QQ 机器人端，使用 Ink 渲染交互式 TUI。

## 产品定位

qq-cli 的界面目标是做成一个低干扰的终端消息工作台，而不是传统聊天软件。视觉方向参考 Codex、OpenCode、IRC 和日志面板：暗色、紧凑、文本优先、命令驱动，让 QQ 会话自然融入日常终端工作流。

设计上优先降低社交软件特征：

- 消息以结构化日志流展示，不使用聊天气泡
- 会话名、群名和联系人信息保持克制，避免在第一眼形成强聊天软件识别
- 图片、回复、@、语音、视频等 CQ 段压缩为短标签，例如 `[image]`、`[reply]`
- 输入区使用 composer / prompt 风格，保持类似 CLI 工具的操作感
- 常用操作通过 `/session`、`/contacts`、`/groups`、`/friends` 等命令完成

这个定位服务于一个实际使用场景：在工作环境里保持消息可读、可回、可切换，同时尽量让界面看起来像普通终端生产力工具。

## 功能

- 通过 OneBot v11 WebSocket 连接 QQ 机器人端
- 加载好友列表和群列表
- 发送私聊和群聊文本消息
- 接收并展示私聊、群聊消息
- 使用 `/session` 临时会话面板切换聊天
- 在会话面板中显示未读数和最近消息摘要
- 压缩 CQ 消息段，例如图片、回复、@、语音、视频等，避免长协议串挤压界面
- 可选展开图片引用或在支持的终端中显示图片缩略图
- 底部 boxed composer 输入框，适合持续对话操作
- JSON 日志落盘，便于排查 WebSocket 和 OneBot API 问题

## 技术栈

- [Ink](https://github.com/vadimdemedes/ink)：React for terminal
- [ink-text-input](https://github.com/vadimdemedes/ink-text-input)：终端文本输入
- [ink-picture](https://github.com/endernoke/ink-picture)：终端图片渲染
- [ws](https://github.com/websockets/ws)：WebSocket 客户端
- TypeScript

## 环境要求

- Node.js 18 或更高版本
- npm
- 一个支持 OneBot v11 正向 WebSocket 的 QQ 机器人端，例如 NapCat

## 安装

```bash
npm install
```

## 启动

默认连接地址是 `ws://localhost:3001`：

```bash
npm run dev
```

如果你的 OneBot WebSocket 地址不同：

```bash
ONEBOT_WS_URL=ws://127.0.0.1:3001 npm run dev
```

如果 OneBot 端配置了 access token：

```bash
ONEBOT_ACCESS_TOKEN=your-token npm run dev
```

也可以组合使用：

```bash
ONEBOT_WS_URL=ws://127.0.0.1:3001 ONEBOT_ACCESS_TOKEN=your-token npm run dev
```

默认情况下图片消息仍压缩为 `[image]`。可以通过 `QQ_CLI_IMAGE_MODE` 修改图片显示模式：

```bash
QQ_CLI_IMAGE_MODE=off npm run dev
QQ_CLI_IMAGE_MODE=inline npm run dev
```

`off` 显示可点击的 `[image]`，`inline` 会在支持的终端中显示缩略图。也可以用 `Shift+Tab` 在两种模式间切换；`off` 时状态栏不显示图片模式。

消息之间默认不留空行。需要恢复更松散的间距时，可以设置 `QQ_CLI_MESSAGE_GAP=1`。

## 使用 NapCat

仓库里提供了一个基础的 `napcat-docker-compose.yaml`：

```bash
NAPCAT_UID=$(id -u) NAPCAT_GID=$(id -g) \
  docker compose -f napcat-docker-compose.yaml up -d
```

该 compose 会暴露：

- `3000`
- `3001`
- `6099`

NapCat 的配置、插件和 QQ 登录数据会分别保存在：

```text
.container-data/napcat/config
.container-data/napcat/plugins
.container-data/napcat/qq
```

这些目录只用于本机运行并已加入 `.gitignore`。删除容器不会删除其中的数据；如需清空 NapCat 的本地状态，请先停止容器，再手动删除 `.container-data/napcat`。

具体 NapCat 登录、OneBot v11 配置和 WebSocket 端口设置，请以你的 NapCat 控制台配置为准。确保 qq-cli 使用的 `ONEBOT_WS_URL` 指向 NapCat 的 OneBot v11 正向 WebSocket 地址。

## 常用命令

在 qq-cli 输入框中使用：

| 命令 | 说明 |
| --- | --- |
| `/session` 或 `/s` | 打开会话选择面板 |
| `/session <名称或 ID>` | 按名称或 ID 搜索并切换会话 |
| `/contacts [关键词]` 或 `/c` | 搜索所有联系人 |
| `/groups [关键词]` 或 `/g` | 搜索群聊 |
| `/friends [关键词]` 或 `/f` | 搜索好友 |
| `/images off\|inline` | 设置图片显示模式 |
| `/reload` | 重新加载登录信息、好友列表和群列表 |
| `/help` | 打开帮助面板 |
| `/exit`、`/quit` 或 `/q` | 正常退出 |

快捷键：

| 快捷键 | 说明 |
| --- | --- |
| `Esc` | 关闭面板或清空输入 |
| `Tab` | 输入 `/` 后补全命令；默认无功能 |
| `Shift+Tab` | 切换内联图片显示状态 |
| `↑` / `↓` | 在会话面板中移动选择 |
| `PageUp` / `PageDown` | 在会话面板中翻页 |
| `Ctrl+C` / `Ctrl+Q` | 退出 |

## 界面说明

主界面不会常驻显示会话列表，保持类似 Codex/OpenCode 的对话流布局：

- 顶部显示连接状态、当前账号和当前会话
- 中间显示当前会话消息
- 底部是固定 composer 输入框
- 只有执行 `/session`、`/contacts`、`/groups`、`/friends` 时才显示临时会话选择面板

会话选择面板会优先展示有未读消息的会话，并显示最近消息摘要，方便快速跳转处理。

## 日志

默认日志目录：

```text
./logs
```

可以通过 `QQ_CLI_LOG_DIR` 修改：

```bash
QQ_CLI_LOG_DIR=/tmp/qq-cli-logs npm run dev
```

日志文件按日期生成，格式类似：

```text
logs/qq-cli-2026-05-20.log
```

## 构建

```bash
npm run build
```

构建后运行：

```bash
npm start
```

## 排障

### 一直显示 Connecting 或 Reconnecting

检查：

- OneBot 端是否已经启动
- `ONEBOT_WS_URL` 是否正确
- NapCat 是否启用了 OneBot v11 正向 WebSocket
- access token 是否和 OneBot 端配置一致
- 端口是否被防火墙或容器网络拦截

### 能连接但没有联系人

检查 OneBot 端是否支持并允许调用：

- `get_login_info`
- `get_friend_list`
- `get_group_list`

也可以查看日志里的 API 返回和 retcode。

### 消息里出现 CQ 内容

qq-cli 会尽量把常见 CQ 段压缩成短标签，例如 `[image]`、`[reply]`、`@123456`。如果遇到未识别的 CQ 类型，会显示为 `[type]`，后续可以按需要继续补映射。

## 当前限制

- 目前主要支持文本发送
- `QQ_CLI_IMAGE_MODE=inline` 或 `/images inline` 会尝试显示缩略图，效果取决于终端对 Kitty、iTerm2 inline image、Sixel 或字符 fallback 的支持
- 语音、视频等消息以摘要形式显示，不做媒体预览
- 历史消息不持久化，重启后只显示本次运行期间收到的消息
- 会话列表来自 OneBot 好友列表和群列表，不包含更复杂的最近会话同步
