# Microsoft Edge Add-ons 自动化部署配置指南

本项目已配置基于 GitHub Actions 的一键自动部署流水线（`.github/workflows/deploy.yml`）。  
通过该流水线，您只需在 GitHub Actions 页面点击一次按钮，系统即会自动完成**代码校验、ZIP 打包、SHA256 生成、GitHub Release 归档**以及**向 Microsoft Edge Add-ons 官方 API 提交送审**。

---

## 一、 前置条件与所需凭据

在首次使用流水线前，需要在 GitHub 仓库中配置以下 3 个密钥（GitHub Secrets）：

| Secret 名称 | 说明 | 示例 |
| :--- | :--- | :--- |
| `EDGE_PRODUCT_ID` | 您的扩展在微软应用商店的唯一产品 ID (UUID) | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `EDGE_CLIENT_ID` | 微软 Azure AD API 客户端 ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `EDGE_API_KEY` | 微软 Azure AD 客户端密钥 (Client Secret) | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

---

## 二、 如何在 Microsoft Partner Center 获取凭据

### 1. 获取 `EDGE_PRODUCT_ID`
1. 登录 [Microsoft 合作伙伴中心 (Partner Center)](https://partner.microsoft.com/dashboard/microsoftedge/overview)。
2. 在扩展列表中，点击进入 `need_more_jlu`。
3. 观察浏览器地址栏 URL，或进入「扩展概览 (Extension overview)」页面：
   - URL 形如：`https://partner.microsoft.com/dashboard/microsoftedge/.../overview` 其中的 32~36 位 GUID 字符串即为产品 ID；
   - 或在页面中的「产品标识 (Product details)」直接复制 **Product ID**。

### 2. 获取 `EDGE_CLIENT_ID` 与 `EDGE_API_KEY`
微软 Edge Add-ons 采用 Azure Active Directory (Azure AD) 进行 API 身份鉴权：
1. 在 Partner Center 右上角点击 **齿轮图标（设置）** -> 选择 **开发者设置 (Developer settings)**。
2. 在左侧菜单点击 **API 访问权限 (API access)** 或 **用户与应用 (Users / Azure AD applications)**。
3. 点击 **关联 Azure AD 应用程序 (Associate Azure AD application)** 或新建应用：
   - 关联成功后，界面将显示 **客户端 ID (Client ID)** -> 这就是 `EDGE_CLIENT_ID`。
4. 在该应用的「密钥 (Keys / Secrets)」区域，点击 **添加新密钥 (Add key)**：
   - 此时页面会生成一段密钥字符串（Client Secret / API Key）-> 这就是 `EDGE_API_KEY`。
   - ⚠️ **注意**：密钥生成后仅展示一次，离开页面将无法再次查看，请立即复制保存。

---

## 三、 在 GitHub 配置 Secrets

1. 打开 GitHub 仓库：[`Shy-up/need-more-jlu`](https://github.com/Shy-up/need-more-jlu)。
2. 依次点击：**Settings** -> **Secrets and variables** -> **Actions**。
3. 在 **Repository secrets** 区域，点击 **New repository secret**：
   - 创建 `EDGE_PRODUCT_ID`，填入刚才获取的 Product ID；
   - 创建 `EDGE_CLIENT_ID`，填入 Client ID；
   - 创建 `EDGE_API_KEY`，填入 API Key (Client Secret)。

---

## 四、 触发自动化发布流程

### 1. 日常版本准备
1. 当有新版本需要发布时，修改根目录下 [`manifest.json`](../manifest.json) 中的 `"version"`（例如从 `1.0.1` 提升到 `1.0.2`）。
2. 将代码提交并推送到 GitHub 的 `main` 分支。

### 2. 执行一键发布
1. 打开 GitHub 仓库的 **Actions** 选项卡。
2. 在左侧工作流列表中选择 **Deploy to Microsoft Edge Add-ons**。
3. 点击右侧的 **Run workflow** 下拉按钮：
   - **仅上传到草稿箱 (`upload_only`)**：
     - 若勾选（`true`）：仅上传安装包至微软后台，保留在草稿状态，不立即正式送审（适合首次部署验证 API 连通性）；
     - 默认不勾选（`false`）：上传后立即直接提交审核。
   - **提交给微软审核员的附言 (`notes`)**：
     - 可以填写本次更新摘要（如：`Routine optimization, security hardening, and performance improvements.`），审核员会直接看到该备注。
   - **同步创建 GitHub Release (`create_release`)**：
     - 默认开启（`true`），会在 GitHub 自动根据 manifest 版本号创建 Tag（如 `v1.0.2`），并挂载打包好的 ZIP 和 SHA256 文件。
4. 点击绿色的 **Run workflow** 按钮启动流水线。

---

## 五、 流水线执行与安全审计

流水线运行时会执行以下自动化任务：
1. **Manifest 静态规范验证**：检查 MV3 规范、必需字段与版本号有效性；
2. **清洁构建与打包**：排除所有开发文件与本地配置，仅将应用代码目录打包为 `need_more_jlu_v{version}.zip`；
3. **安全哈希计算**：自动生成对应安装包的 `SHA256` 校验和，确保完整性防篡改；
4. **构建产物归档**：在 GitHub Actions Run 页面保留产物 30 天，可随时下载；
5. **官方 API 对接**：调用微软 Edge 开发者发布 API，上传 ZIP 并进入审核队列。
