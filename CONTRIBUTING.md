# need_more_jlu 贡献指南 (Contribution Guide)

感谢你关注并有意愿为 **need_more_jlu（吉大工具箱）** 贡献力量！  
无论是补充你常去自习室的真实体验、校正教室数据、提交新功能，还是报告一个 Bug，你的每一份贡献都能帮助到全校同学。

---

## 目录
- [一、使用 AI / 智能体协同贡献](#一使用-ai--智能体协同贡献)
- [二、Issue 提交规范](#二issue-提交规范)
- [三、代码风格与开发规范](#三代码风格与开发规范)

---

## 一、使用 AI / 智能体协同贡献

推荐使用 AI / 个人 Agent（如 GitHub Copilot、ChatGPT、Claude、Antigravity 或任意编程 Agent）辅助完成贡献。

你可以直接复制以下提示词模板发送给你的 AI 助手：

```plaintext
根据开源仓库：https://github.com/Shy-up/need-more-jlu

我希望为该项目贡献：[规范增加我的自习教学楼推荐: xxx / 你的具体需求]

请阅读该项目的代码结构与规范，带我完成代码编写与测试，并指导我向 main 分支提交 Pull Request。
```

> 💡 **典型贡献场景**：
> - **自习推荐与体验评价**：直接修改 [`data/recommendations.json`](data/recommendations.json)，各校区代码与楼栋编号可参考 [`data/campuses.json`](data/campuses.json)。
> - **功能改进与 Bug 修复**：请确保遵循 Manifest V3 规范与最小权限原则，零构建依赖，纯原生 ESM。

---

## 二、Issue 提交规范

如果你在使用中遇到了 Bug、闪退、数据拉取失败，或者有新功能建议，欢迎提出 Issue。

### 如何提交一个高效的 Issue？
1. 前往 [**Issues 页面**](https://github.com/Shy-up/need-more-jlu/issues)，点击 **`New issue`**；
2. **标题简明扼要**，例如：`[Bug] 南岭校区逸夫楼在校园网下无法加载数据`；
3. **内容请尽量包含以下关键信息**（直接复制填空即可）：

```markdown
- **所在校区**：南岭 / 前卫 / 新民 / 朝阳 / 南湖 / 和平
- **网络环境**：校园网直连 (JLU.PC / JLU.WLAN) / WebVPN / 外部宽带
- **浏览器类型与版本**：Chrome 120+ / Edge / 其他
- **问题描述**：点击查询后提示什么，或者出现了什么不符合预期的情况
- **截图（非常重要）**：
  - 界面出错截图
  - 按键盘 `F12` 打开控制台（Console），若有红字报错请截图一并附上
```

---

## 三、代码风格与开发规范

1. **Manifest V3 最小权限原则**：严禁随意新增 `permissions` 或泛滥配置 `host_permissions`，所有权限均需严格遵循商店审核最小化要求。
2. **零构建依赖架构**：保持运行时无 npm 打包工具链（如 Webpack/Vite），采用原生浏览器 ESM，确保源码直接可读可审。
3. **DOM 安全性**：动态拼接 HTML 时，凡涉及外部或可变文本输入，必须经过 HTML 实体转义（防止 DOM-XSS）。
4. **双通道韧性保障**：核心网络请求必须考虑校内直连与 WebVPN 代理两种场景，网络请求务必配置合理的超时中断机制（默认 5s），杜绝页面卡死。
