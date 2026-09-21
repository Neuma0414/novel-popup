# 资讯阅读器（novel-popup）

[![双平台同步](https://github.com/Neuma0414/novel-popup/actions/workflows/sync.yml/badge.svg)](https://github.com/Neuma0414/novel-popup/actions/workflows/sync.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Gitee](https://img.shields.io/badge/Gitee-mirror-c71d23.svg)](https://gitee.com/neuma/novel-popup)

把本地 TXT 小说伪装成一条右下角的「新闻资讯推送」，常驻系统托盘、可一键秒隐的 Windows 桌面阅读器。

基于 Electron 开发，无后端、无联网请求，导入的文本只存在本机。

> 本项目仅供个人学习与自用。请确保你导入的文本拥有合法使用权，不要用于传播侵权内容。

---

## 功能特性

| 功能 | 说明 |
| --- | --- |
| 资讯化伪装 | 章节名藏在「来源」行，标题栏用虚拟资讯标题，整体样式仿新闻推送卡片 |
| 定时弹出 | 右下角按设定间隔自动弹出，间隔可在设置中调整 |
| 托盘常驻 | 点「×」或 `Alt+F4` 只是收进托盘，不会真正退出，托盘图标右键可退出 |
| Boss 键 | 全局快捷键（默认 `Ctrl+Shift+K`），随时秒隐 / 还原弹窗，无需弹窗处于聚焦状态 |
| 逐段揭示 | 未展开全文时按节奏逐段显示，模拟资讯刷新；不会自动跳章 |
| 阅读全文 | 一键展开整章并显示滚动进度，滚动位置会被记住 |
| TXT 导入 | 自动按 `第N章` 切分章节，兼容中文数字章节号与 CRLF 换行 |
| 进度记忆 | 章节、已读段落、滚动位置、上次导入的文件，重启后自动恢复 |
| 快捷键自定义 | 上一章 / 下一章 / 上下滚动均可自行录入组合键 |
| 开机自启 | 可在设置中开关 |

## 快速开始

需要 Node.js 18+。

```bash
git clone https://github.com/Neuma0414/novel-popup.git
cd novel-popup
npm install
npm start
```

## 打包

生成可直接双击运行的免安装版（输出到 `dist/`）：

```bash
npm run pack      # electron-packager，产物为 dist/资讯阅读器-win32-x64/
```

如需生成单文件 portable 版本：

```bash
npm run dist      # electron-builder
```

图标由 PNG 现场生成（无第三方依赖）：

```bash
npm run gen-icon  # assets/tray-icon.png -> assets/tray-icon.ico
```

## 快捷键

| 场景 | 默认按键 | 说明 |
| --- | --- | --- |
| Boss 键 | `Ctrl+Shift+K` | 全局生效，不用先点弹窗 |
| 上一章 | `Alt+↑` | 弹窗聚焦时生效 |
| 下一章 | `Alt+↓` | 弹窗聚焦时生效 |
| 向上滚动 | `↑` | 弹窗聚焦时生效 |
| 向下滚动 | `↓` | 弹窗聚焦时生效 |

上一章 / 下一章默认要求带修饰键，避免误触。设置面板中点输入框后按下组合键即可重新录入。

## 目录结构

```
.
├── main.js               # 主进程：窗口 / 托盘 / 全局快捷键 / 定时器 / IPC
├── preload.js            # contextBridge 白名单，向渲染进程暴露 window.api
├── src
│   ├── popup.html        # 弹窗骨架（标题栏 / 菜单 / 正文 / 相关推荐 / 设置面板）
│   ├── popup.css         # 资讯卡片样式
│   ├── popup.js          # 渲染进程：翻章 / 逐段揭示 / 导入 / 设置 / 快捷键录入
│   ├── novel-parser.js   # 纯 Node 模块：TXT -> 章节数组，不依赖 Electron
│   └── sample-novel.json # 内置示例小说
├── assets                # 托盘与应用图标
├── scripts
│   ├── gen-icon.js       # 由 PNG 生成最小尺寸 ICO（带覆盖保护）
│   ├── sync.sh           # GitHub ⇄ Gitee 同步核心逻辑
│   └── keepalive.sh      # 定时任务保活心跳
├── .github
│   ├── workflows/sync.yml # 同步 workflow
│   └── keepalive.txt     # 心跳文件（由 workflow 自动更新）
└── test                  # novel-parser 单元测试（node --test）
```

> `assets/tray-icon.ico` 随源码提供的是 **4 层多分辨率**版本（48 / 32 / 16 / 256），Windows 会按当前 DPI 挑选合适的一层。
> `npm run gen-icon` 生成的只是由 PNG 内嵌而来的单层最小 ICO，体积更小但高分屏效果较差，因此该脚本默认带覆盖保护；确实需要替换时用 `npm run gen-icon:force`。

`novel-parser.js` 不依赖 Electron，可以单独在 Node 中调用或做单元测试：

```js
const { parseNovel } = require('./src/novel-parser');
const chapters = parseNovel('第一章 开始\n正文……', '书名');
// => [{ title: '第一章 开始', paragraphs: ['正文……'] }]
```

## 测试

```bash
npm test
```

## 数据与权限

- 配置文件写入 Electron 的 `userData` 目录下的 `config.json`（Windows 通常为 `%APPDATA%/novel-popup/config.json`），只保存间隔、快捷键、进度、上次打开的文件路径。
- 应用本身不发起任何网络请求，也不会把导入的文本上传到任何地方。
- 开机自启通过 `app.setLoginItemSettings` 写入系统登录项，可在设置里关闭。

## 多平台同步

本仓库在 GitHub 与 Gitee 之间保持双向自动同步，两端内容一致：

- GitHub 侧提交 → 秒级同步到 Gitee
- Gitee 侧提交 → 10 分钟内同步回 GitHub
- 无需自建服务器，无需 Gitee 付费镜像功能，**配置完成后不需要任何定期人工维护**

定时任务自带保活心跳，会自动规避 GitHub「公开仓库 60 天无活动即禁用定时任务」的限制。机制、配置步骤与排查表见 [docs/SYNC.md](docs/SYNC.md)。

## 开源协议

[MIT](LICENSE)
