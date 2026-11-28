# 微信小游戏 · 小刀飞飞飞

微信开发者工具打开 `wechat/game/`，不要导入项目根目录。该目录是当前单机微信工程，含入口、原生界面、宿主适配、引擎和发布资源。

| 目录 | 内容 |
| --- | --- |
| `game/` | `game.js`、`game.json`、开发者工具配置、原生 WebGL/Canvas 界面、平台接口和随包素材。`engine.js` 为生成文件。 |
| `tools/` | 本地配置初始化、公共引擎导出、图标/模型/音频资源烘焙工具。 |
| `tests/` | 微信 UI、游戏逻辑、平台隔离以及旧档兼容回归。 |
| [materials/](materials/README.md) | 本地申报、密钥、宣传美术和截图；不导入开发者工具、不提交 Git。 |
| `archive/` | 停用的联网邀请实现和本地历史交付，不打入当前单机包。 |

在仓库根目录运行：

```sh
node wechat/tools/init-config.cjs
node wechat/tools/build-wechat.cjs
node --test wechat/tests/*.test.cjs
```

初始化脚本只在未配置时运行：有本地广告配置就复制进游戏目录，公开检出则生成空配置。不要在 PR、终端输出或公开资料中粘贴配置内容。模型或图标修改可运行 `node wechat/tools/bake-wechat-assets.cjs --cards-only`；完整烘焙需要 Playwright、Chrome 和 ffmpeg。

微信项目没有自动玩、隐藏试玩控制或网页挑战链接。朋友圈、微信奖励和广告只走本平台逻辑。构建通过不代表已预览、已上传或上线；这三步按每次发布任务单独确认。
