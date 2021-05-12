# ITH<sub>2</sub>Ome

*IT, H<sub>2</sub>O, and me.*

This extension is provided for those who can read **Chinese**.

IT之家第三方插件，划水特供版。

* [功能](#功能)
  * [视图](#视图)
  * [设置](#设置)
  * [启动](#启动)
* [已知问题](#已知问题)
* [更新日志](#更新日志)
* [帮助本项目](#帮助本项目)
* [许可证](#许可证)

## 功能
### 视图

本插件包含“最新”，“热榜”与“热评”三个视图。

* 最新：IT之家最新发布信息，可自定义屏蔽词与关键词。鼠标悬浮可预览完整标题与发布时间，点击可在 `VSCode` 内查看内容，点击右侧图标可在浏览器中查看（建议将IT之家网址加入受信任的域以避免弹窗）。
* 热榜：分为“日榜”、“周榜”与“月榜”三个榜单，可点击按钮切换子榜单，每个榜单显示12条内容。自动刷新时间间隔为 `1` 天，即 `86400` 秒。
* 热评：无限期开发中。

点击视图标题右侧刷新按钮可手动刷新榜单，并重置下次自动刷新时间。

### 设置

* `ith2ome.autoRefresh`：“最新”自动刷新时间间隔，设置为 `0` 时禁用自动刷新，反之为时间间隔（秒）。
* `ith2ome.blockImages`：是否屏蔽图片：默认设置为 `false`，即显示图片。
* `ith2ome.keyWords`：关键词列表，会在标题列表内强调显示。
* `ith2ome.blockWords`：屏蔽词列表，标题含有屏蔽词时将不显示在“最新”列表内。
* `ith2ome.defaultPeriod`：“热榜”默认榜单，设置为 `0` 时默认显示日榜，`1` 为周榜，`2` 为月榜。

### 启动

本插件仅在打开视图时触发启动。

## 已知问题

待发掘。

## 更新日志

您可以点击查看[更新日志](CHANGELOG.md)。

## 帮助本项目

作者为学习了解 `TypeScript` 而创建了本项目，并以“面向搜索引擎编程”（Search Engine Oriented Programming, SEOP）的方法实现。首次接触 `TypeScript` 与 `VSCode` 插件开发，漏洞与错误在所难免，敬请谅解。您可以通过[创建 issue](https://github.com/Tai-Zhou/ITH2Ome/issues/new/choose) 或是在 `develop` 分支[提交 PR](https://github.com/Tai-Zhou/ITH2Ome/compare) 的方式帮助改进本项目。作者会在学业之余维护更新本项目，还请您保持耐心。

## 许可证

本项目基于 [MIT许可证](LICENSE) 发行。
