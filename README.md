# 小刀飞飞飞 / 旋转飞刀

同一款竖屏切物闯关游戏，分为微信小游戏、网页试玩和哔哩哔哩 Toy 三套交付。三端同步普通关、无尽、每日挑战、空中狂潮、刀具和道具等公共玩法；各自管理菜单、平台接口、存档和发布。

[打开网页试玩](https://cxcboss.github.io/spinning-knife/) · [双端与多平台同步规范](必读.md)

| 目录 | 内容 | 运行或发布 |
| --- | --- | --- |
| [wechat/](wechat/README.md) | 微信小游戏工程、本地运营素材与截图、备案软著、密钥、历史包 | 微信开发者工具打开 `wechat/game/`；微信预览、上传及审核独立操作 |
| [web/](web/README.md) | 网页试玩入口、图标、网页回归测试 | 直接打开 `web/index.html`；主分支的 Pages 工作流发布在线试玩 |
| [bilibili/](bilibili/README.md) | 哔哩哔哩 Toy 适配、封面图标和本地上传 ZIP | `node bilibili/build.cjs`；B站后台提审独立操作 |
| `tests/` | 跨平台专项回归，检查试玩专属功能是否混入非网页发布包 | 下述统一验证命令 |
| `.github/workflows/` | GitHub Pages 构建与部署 | **只发布**网页试玩的 HTML 和图标 |

**自动玩和隐藏试玩设置仅网页试玩版允许。** 微信和 B站包既不显示入口，也不内置这些功能。微信密钥、备案资料和历史发布材料只放在本地，GitHub 不包含这些文件；不同平台不共用存档。

## 验证

在项目根目录运行，需安装 Node.js、`zip` 和 `unzip`。

```sh
node wechat/tools/init-config.cjs
node wechat/tools/build-wechat.cjs --check
node --test web/tests/*.test.cjs wechat/tests/*.test.cjs tests/*.test.cjs
```
