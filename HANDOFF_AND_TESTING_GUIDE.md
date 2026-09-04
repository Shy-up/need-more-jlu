# need_more_jlu - Agent 交接与闭环测试指导文档

本文档专为接续工作的 Agent 提供，包含项目全景、已完成模块、环境上下文、闭环测试规程及后续迭代开发路线。

---

## 📌 一、 项目全景与网络上下文

* **项目名称**：`need_more_jlu`
* **项目路径**：`b:\workspace\01_active\need_more_jlu`
* **目标定位**：基于 Chrome Extension Manifest V3 的吉林大学校园网/电子校务平台（OA）现代阅读与效率增强插件。
* **网络与访问特殊性**：
  * 吉大 OA 原始内网地址为 `http://oa.jlu.edu.cn/...`（解析为私网 IP `10.100.18.18`）。
  * 校外需通过 WebVPN 代理访问：`https://vpn.jlu.edu.cn/https/48714f71342f7a336d582f7e2857373750cd3d1004df80a0b5971c1b1a/defaultroot/PortalInformation!jldxList.action?channelId=179577`。
  * **当前状态**：用户已在 Antigravity 代理浏览器（活跃页面 ID：`1AF10D6F79A68CE33E62C3316D287A9A`）完成了统一身份认证登录。

---

## 📦 二、 已完成模块与工程架构

```
need_more_jlu/
├── manifest.json              # Manifest V3 配置，已声明 storage, unlimitedStorage, activeTab
├── icons/                     # 16x16, 48x48, 128x128 品牌图标
├── content/
│   ├── theme.css              # 4 套主题变量 (Light, Dark OLED, Sepia, Navy) + 自定义壁纸毛玻璃
│   ├── inject.css             # 现代卡片 UI、呼吸未读灯、时间线分组、抽屉样式
│   ├── drawer.js              # 右侧抽屉式秒开预览控制器，异步提取正文及附件下载
│   └── inject.js              # 核心 DOM 重构、学生视角分类、已读/未读追踪、本地持久化
├── popup/
│   ├── popup.html             # 浏览器右上角快捷面板
│   ├── popup.css              # 面板样式
│   └── popup.js               # 实时未读/收藏计数、主题即刻切换
├── options/
│   ├── options.html           # 高级设置页（支持本地图片拖拽上传与网络 URL、调色盘）
│   ├── options.css
│   └── options.js             # FileReader 图片转存与尺寸智能优化、数据导出
├── background/
│   └── service_worker.js      # 后台服务 Worker
├── README.md                  # 用户使用说明
├── HANDOFF_AND_TESTING_GUIDE.md # 本交接指导
└── generate_icons.ps1         # 图标生成脚本
```

> **语法与合规性检查**：已通过 Node.js 批量校验，所有 JSON 和 JavaScript 文件均为 0 语法错误。

---

## 🧪 三、 下一个 Agent 的闭环测试规程（Test Checklist）

接续的 Agent 可通过以下方式进行直接测试与验证：


1. **界面重塑测试**：
   - 验证原页面 200px 巨幅 Banner、二级菜单、底部快速链接九宫格是否已被完全隐藏。
   - 验证 `#nmj-root` 现代卡片流是否在 1200px 宽度内居中优雅呈现。
2. **时间线分组与新旧通知测试**：
   - 检查「🔥 今日最新发布」、「⭐ 昨日发布」、「📅 近 3 天发布」分段是否正确归集。
   - 检查未读通知是否有蓝色呼吸灯点；点击后是否即时变为柔和灰度已读状态。
   - 测试点击顶部「🔵 只看未读」开关，已读条目应被即时过滤。
3. **学生分类 Tab 过滤测试**：
   - 切换「🎓 教务与学籍」、「🏆 奖助与学工」、「💼 就业招聘」等分类标签，验证列表筛选是否精准。
4. **抽屉式秒开预览测试**：
   - 点击任意通知卡片，右侧是否在 0.3s 内平滑滑出抽屉面板。
   - 检查正文排版是否剔除了古老内嵌样式；检查底部附件区域是否列出 `.doc / .pdf` 等下载卡片。
   - 按 `Esc` 键或点击遮罩，抽屉应即刻关闭。
5. **本地壁纸与主题测试**：
   - 打开 `options/options.html`，拖拽一张本地图片并保存。
   - 检查 `chrome.storage.local` 是否成功存储该 Base64 图片，页面背景是否呈现高斯毛玻璃效果。
   - 切换 4 套预设主题（Light / Dark / Sepia / Navy），确认字体对比度良好。

---

## 🚀 四、 建议的后续迭代开发路线（Roadmap）

1. **跨页无限滚动（Infinite Scroll）**：
   - 目前依赖底部保留的上一页/下一页；可在用户滑到底部时静默预加载下一页列表并追加卡片。
2. **桌面通知与后台静默监控**：
   - 在 `service_worker.js` 中配置 `chrome.alarms` 定时检查今日是否有学生专属（奖学金/放假/推免）新通知，并通过系统桌面弹窗提醒。
3. **多校内系统适配**：
   - 将插件架构扩展至吉大其他古老系统（如教务选课系统 `uims.jlu.edu.cn`、学工系统等）。
