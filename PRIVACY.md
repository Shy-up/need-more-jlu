# 隐私政策 / Privacy Policy

**need_more_jlu** 尊重并保护所有使用服务用户的个人隐私权。本扩展秉承 **“本地优先（Local-First）”** 与 **“数据最小化”** 的开源理念，绝不上传、出售或转让任何用户的个人敏感信息。

*Last Updated: 2026-09-05*  
*适用于：Edge 外接程序商店、Chrome Web Store 及开源发布版本*

---

## 中文版 (Chinese)

### 1. 数据收集与存储原则
* **无云端中继服务器**：本扩展未架设任何收集用户隐私的外部中转服务器或数据库。
* **本地化存储 (Local-Only)**：用户在插件中配置的偏好设置（如自习室偏好、深浅色主题、楼层筛选等）均仅保存在用户浏览器的本地存储（`chrome.storage.local` / `chrome.storage.sync`）中。
* **不收集账号敏感凭证**：插件不会私自窃取或存储用户的统一身份认证密码。登录状态（Cookie / Session）均由吉林大学官方服务端与浏览器原生安全机制进行维护。

### 2. 网络通信与数据传输
* **仅限校园官方域**：插件的所有网络请求（如教务信息、空闲教室查询、校园网状态验证）均直接且仅与吉林大学官方服务器通信（限定在 `*.jlu.edu.cn` 域名下）。
* **无第三方追踪**：插件内部不集成任何第三方的遥测、统计代码（例如 Google Analytics、百度统计、Sentry 等），不记录用户的浏览轨迹或行为习惯。

### 3. 权限使用说明（Permissions）
为了实现仪表盘直达与校园网增强功能，本扩展在 `manifest.json` 中申请了必要权限，其具体用途如下：
* **`storage` / `unlimitedStorage`**：用于在本地离线缓存教室数据、自习偏好与仪表盘配置。
* **`cookies`**：用于在用户主动登录吉大官方服务（如 IEDU / WebVPN）时，本地读取必要的会话状态，以便为用户显示登录态和连通性。
* **`declarativeNetRequest`**：用于处理校园网系统在特定网络环境下的跨域头与安全网关拦截优化，保障教务直连稳定性。
* **`activeTab` / `tabs` / `scripting`**：用于在吉大官方 OA/VPN 页面注入微型抽屉导航和增强工具栏，不读取除吉大域名以外的任何标签页信息。
* **`host_permissions` (`*.jlu.edu.cn`)**：严格限制插件的网络请求权限仅在吉林大学校内域名范围内生效。

### 4. 源码开源与审计
本扩展代码完全开源透明，任何人均可在 GitHub 仓库审阅所有前端与后台逻辑，监督并验证插件的安全性与隐私合规性。

### 5. 联系与支持
如果您对本隐私政策或数据安全有任何疑问、建议，欢迎通过 GitHub Issues 或邮件与开发者取得联系。

---

## English Version (For Certification & International Users)

### 1. Principles of Data Collection & Storage
* **No Remote Tracking Servers**: *need_more_jlu* does NOT operate any external servers or databases to harvest user information.
* **Local-First Storage**: User preferences (such as study room filters, theme preferences, and local cache) are strictly stored locally within your browser using `chrome.storage.local`.
* **Zero Credential Theft**: We never collect, upload, or log your student credentials (such as NetID passwords). Session cookies are handled natively by your browser and the official Jilin University authentication servers.

### 2. Network Communications
* **Direct Official Endpoints Only**: All network requests made by this extension communicate directly with the official servers of Jilin University (`*.jlu.edu.cn`). No proxy or man-in-the-middle servers are involved.
* **Zero Third-Party Telemetry**: We do not include any tracking, telemetry, or analytics scripts (e.g., Google Analytics, tracking pixels, or third-party ads).

### 3. Purpose of Requested Permissions
This extension requests minimum necessary permissions strictly to enable essential features:
* **`storage` / `unlimitedStorage`**: To cache classroom schedules, study room maps, and theme preferences locally.
* **`cookies`**: To check authentication status when communicating directly with official university portals (IEDU / WebVPN).
* **`declarativeNetRequest`**: To adjust local request headers when interacting with university web systems.
* **`activeTab` / `tabs` / `scripting`**: To inject the lightweight quick-access drawer UI into official university portals (`oa.jlu.edu.cn`, `vpn.jlu.edu.cn`).
* **`host_permissions` (`*://*.jlu.edu.cn/*`)**: Strictly confined to official Jilin University domains.

### 4. Open Source Transparency
The complete source code of this extension is publicly available on GitHub for open inspection and community audit.

### 5. Contact Us
For any inquiries regarding this Privacy Policy, please submit an issue on the official GitHub repository.
