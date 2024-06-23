# ITH<sub>2</sub>Ome

*IT, H<sub>2</sub>O, and me.*

This extension is provided for those who can read **Chinese**.

IT之家第三方插件，划水特供版。

- [功能](#功能)
  - [视图](#视图)
  - [启动](#启动)
- [账户与隐私](#账户与隐私)
- [常见问题](#常见问题)
  - [给文章打分后人数没有增加/分数不对](#给文章打分后人数没有增加分数不对)
  - [已支持/反对的评论，刷新之后仍显示未操作](#已支持反对的评论刷新之后仍显示未操作)
- [更新日志](#更新日志)
- [帮助本项目](#帮助本项目)
- [许可证](#许可证)

## 功能
### 视图

本插件包含“通行证”，“最新”，“热榜”与“热评”四个视图。

* 通行证：通过 `cookie` 登录，可显示登录天数、经验等级、签到等信息。自动刷新时间间隔为 `1` 小时，即 `3600` 秒。
* 最新：IT之家最新发布信息，可自定义屏蔽词与关键词。
* 热榜：分为“日榜”、“周榜”与“月榜”三个榜单，可点击按钮切换子榜单，每个榜单显示12条内容，点击右侧图标可在浏览器中查看完整内容。自动刷新时间间隔为 `1` 天，即 `86400` 秒。
* 热评：标题数字为该条评论点赞数。自动刷新时间间隔为 `1` 天，即 `86400` 秒。

对于“最新”，“热榜”与“热评”三个视图，点击各视图标题右侧刷新按钮可手动刷新榜单，并重置下次自动刷新时间；鼠标悬浮可预览新闻相关信息，点击可在 VS Code 内查看内容，点击每条内容右侧图标可在浏览器中查看完整内容（建议将IT之家网址加入受信任的域以避免弹窗）。

### 启动

本插件仅在打开视图时触发启动。

## 账户与隐私

您可通过以下步骤获取您的账户 `cookie`：

1. 在浏览器中打开 [https://my.ruanmei.com/](https://my.ruanmei.com/)；
2. 登录您的账户；
3. 在通行证页面打开开发者工具，并选择控制台（Console）；
4. 输入 `document.cookie`；
5. 复制 `user=hash=` 之后的部分，例如 `user=hash=20110515TOPOSINF`，则复制 `20110515TOPOSINF`；
6. 粘贴至插件输入框中，或是手动修改 `ith2ome.account` 设置。

除上述 `cookie` 外，本插件**不保存**任何用户信息，**不记录、上传、保存**任何用户使用数据。请您妥善保管您的设置，以防个人信息泄露。分享时，本插件会将文本内容写入系统剪贴板，**不包含**读取剪贴板功能。[VS Code 插件市场](https://marketplace.visualstudio.com/items?itemName=astro-tai.ith2ome)发布版本的上传均由 [GitHub Action](.github/workflows/publish.yml) 完成，与本页面公开代码内容一致。

## 常见问题
### 给文章打分后人数没有增加/分数不对

之家服务器会有一定的延迟，还请您稍后刷新确认。若打分失败，本插件会弹出错误提示。

### 已支持/反对的评论，刷新之后仍显示未操作

目前使用的接口只有传递用户 Bearer Token 时，才能在页面刷新时获取用户评论投票状态。您可通过再次点击，刷新投票状态。

本插件目前没有使用 Bearer Token 的计划。

## 更新日志

您可以点击查看[更新日志](CHANGELOG.md)。

## 帮助本项目

作者为学习了解 `TypeScript` 而创建了本项目，并以“面向搜索引擎编程”（Search Engine Oriented Programming, SEOP）和“面向人工智能编程”（Artificial Intelligence Oriented Programming, AIOP）的方法实现。首次接触 `TypeScript` 与 VS Code 插件开发，漏洞与错误在所难免，敬请谅解。您可以通过[创建 issue](https://github.com/Tai-Zhou/ITH2Ome/issues/new/choose) 或是[提交 PR](https://github.com/Tai-Zhou/ITH2Ome/compare) 的方式帮助改进本项目。如果您喜欢本项目，还请您在 [GitHub 项目主页](https://github.com/Tai-Zhou/ITH2Ome)给一颗星星，或是在 [VS Code 插件市场](https://marketplace.visualstudio.com/items?itemName=astro-tai.ith2ome)留下您的评论。作者会在工作学业之余更新维护本项目，还请您保持耐心。

## 许可证

本项目基于 [MIT 许可证](LICENSE)发行。
