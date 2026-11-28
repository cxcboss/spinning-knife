# 旋转飞刀 · B站 Toy 版

[上传 ZIP](spinning-knife-bilibili-toy.zip) 的根目录即为 `index.html`，包含游戏脚本、样式和全部运行资源。[本地试玩](dist/index.html) 可以用 Chrome 打开。更新公共玩法后，在仓库根目录运行 `node bilibili/build.cjs` 重新生成 HTML 和 ZIP。

Toy 版保留 60 个普通关、空中切物狂潮、无尽挑战、每日挑战、装备和本机进度。第 36 关限时 40 秒，无尽每日可开 3 局。游戏不需要联网加载资源，不带自动玩、隐藏试玩设置、微信广告或网页好友挑战链接。存档与网页试玩和微信独立。

## 目录

- `build.cjs`：同步公共玩法、应用 Toy 宿主适配并打包。不修改微信和网页文件。
- `dist/` 与 `spinning-knife-bilibili-toy.zip`：本地生成，本仓库不提交。
- `发布素材/`：B站表单使用的封面和图标。

## 发布资料

- 作品名为「旋转飞刀」，分类选「游戏」。
- 简介可填「轻点让小刀起跳，空中再点一次调整落点。切开沿途目标，用刀尖扎稳落点，闯过 60 个关卡。还可以挑战无尽赛道和 45 秒空中切物狂潮。」
- [封面](发布素材/封面.jpg)与[图标](发布素材/图标.png)在表单内单独上传。两张图沿用项目已有素材，裁切以发布页预览为准。

## Toy 上架流程

1. 在 [Toy 介绍页](https://www.bilibili.com/toy/intro)申请发布权限。已申请的账号可通过[官号私信](https://message.bilibili.com/#/whisper/mid1211412540)查看回复。
2. 开通后，用同一个账号进入电脑端[创作中心](https://member.bilibili.com/platform/home)侧栏的 Toy，或打开 [Toy 发布后台](https://www.bilibili.com/toy/publish)。
3. 上传 ZIP，填写作品名、简介、分类和页面地址，再上传封面和图标。先选「链接访问」提交审核，用 B站 App 打开过审链接，检查触摸、存档、音效和画面。
4. 在「发布记录」更新为「所有人可见」。公开后会出现关联动态，并可进入 Toy 广场。需要视频入口时，可在「管理 → 视频绑定」选择本人发布的视频。[官方 Toy FAQ](https://www.bilibili.com/opus/1241171666570051585)

游戏中心的原生小游戏走[游戏开放平台](https://open.biligame.com/)。官方要求企业开发者入驻。创建项目取得 AppID 后，适配原生运行环境，通过开发者工具或 CLI 上传开发版，在后台提交审核并发布。[原生小游戏上传指南](https://miniapp.bilibili.com/small-game-doc/guide/publish)
