# 《小海星上岸记》Cloudflare Pages 部署指引（国内可直接访问版）

> 适合人群：完全没接触过服务器、没部署过网站的小白。
> 为什么有这份文档：Vercel 免费域名 `xxx.vercel.app` 在国内被网络封锁，打不开。
> 而 Cloudflare 的 `xxx.pages.dev` 域名**国内可以直接访问**，所以改用 Cloudflare 部署，
> 效果一模一样，还不用花钱买域名。
>
> ⏱ 全程约 15 分钟，跟着点就能拿到公开链接。

---

## 开始前准备（一次性，2 分钟）

注册一个 **Cloudflare** 免费账号：

1. 打开 <https://dash.cloudflare.com/sign-up>
2. 用**邮箱**注册即可（不需要 GitHub 登录），收到验证邮件后点链接激活。
3. （可选）登录后，页面右下角/设置里可以把语言切换成**简体中文**。

> 📌 代码仓库还是原来那个 GitHub：`Kening95/xiaohaixingshanganji`，不用重新传。

---

## 第 1 步：把 GitHub 仓库导入 Cloudflare Pages（约 3 分钟）

1. 登录 Cloudflare 控制台，左侧菜单点 **「Workers 和 Pages」** → 点 **「创建」**（Create）
2. 选 **「Pages」** 标签页 → 点 **「连接到 Git」**（Connect to Git）
3. 第一次用会要求授权 GitHub：点 **「Connect GitHub」**，浏览器里登录
   Kening95 → 授权页面里选 **「All repositories」**（或只选 `xiaohaixingshanganji`）→ 点 **「Install」**
4. 回到 Cloudflare，选 **`xiaohaixingshanganji`** 仓库 → 点 **「开始设置」**
5. **构建配置只改三处**，其他不动：
   | 配置项 | 填什么 |
   |---|---|
   | Framework 预设（框架预设） | 选 **Vite** |
   | 构建命令（Build command） | `npm run build` |
   | 构建输出目录（Build output directory） | `dist` |
6. 点 **「保存并部署」**（Save and Deploy）
7. 等 1~2 分钟，看到 🎉 成功提示，页面上 `https://xiaohaixingshanganji.pages.dev`
   就是你的公开网址，**手机流量网络下也能直接打开**！

> 📌 以后每次改进：本地 `git add . && git commit -m "说明" && git push`，
> Cloudflare 检测到变化会**自动重新构建部署**，什么都不用点。

---

## 第 2 步：先自己验证一遍（1 分钟）

直接访问 `https://xiaohaixingshanganji.pages.dev`，玩一圈：地图、关卡、扫题、电台、商店、个人中心。
- 直接输 `https://xiaohaixingshanganji.pages.dev/map` 能打开（不会 404）✅ 说明页面路由正常
- 此时个人中心会显示"同步失败"——**这是正常的**，因为云端数据库还没配，接着做第 3 步。

---

## 第 3 步：开通云端数据同步（约 5 分钟，强烈建议）

不配这步网站也能玩，但学习数据只存在各人浏览器里。配好后：任何操作 3 秒内自动备份云端，换手机换电脑登录自动恢复。

### 3.1 创建云端数据库（KV）

1. Cloudflare 控制台左侧菜单 **「Workers 和 Pages」→「KV」** → 点 **「创建命名空间」**（Create a namespace）
2. 名字填 `shanganji-kv` → 点 **「添加」**

### 3.2 把数据库绑定到网站

1. 回到 **「Workers 和 Pages」**，点你的网站项目 `xiaohaixingshanganji`
2. 左侧菜单 **「设置」→「Functions」→「KV 命名空间绑定」** → 点 **「添加绑定」**
3. 填两项：
   - **变量名称**：必须一字不差填 `SYNC_KV`（代码里写死了这个名）
   - **KV 命名空间**：选刚创建的 `shanganji-kv`
4. 保存（环境选 Production 即可）

### 3.3 设置同步地址环境变量

1. 项目左侧菜单 **「设置」→「环境变量」** → 点 **「添加」**
2. 填两项：
   | 名称（Key） | 值（Value） |
   |---|---|
   | `VITE_SYNC_ENDPOINT` | `https://xiaohaixingshanganji.pages.dev/api/sync` |

### 3.4 重新部署一次（关键！）

环境变量和绑定都要重新部署才生效：

1. 项目左侧菜单 **「部署」**（Deployments）
2. 最新一条记录右边点 **「⋯」→「重试部署」**（Retry deployment）
3. 等 1~2 分钟部署完成

### 3.5 验证同步是否成功

打开网站 → 登录（手机号验证码演示码 `888888`）→ 个人中心看「同步状态」显示**已同步** ✅；
回地图勾选任意任务，等 3 秒刷新页面，进度还在 = 云端备份生效 🎉

---

## 部署完成检查清单

- [ ] 手机流量（不开代理）能打开 `https://xiaohaixingshanganji.pages.dev` 并正常显示地图
- [ ] 直接输入 `.../map`、`.../dashboard` 等子页面不会 404
- [ ] 登录（888888）→ 勾选任务 → 刷新，进度不丢
- [ ] 个人中心「云端备份记录」能看到同步记录

---

## 常见问题速查

| 现象 | 原因 | 解决 |
|---|---|---|
| 个人中心显示"同步失败" | KV 没绑定或绑定名不是 `SYNC_KV` | 回第 3.2 步检查，绑定后重试部署 |
| 打开 `/map` 页面 404 | 部署的代码不是最新（缺 `_redirects` 文件） | 确认本地 `git push` 了最新代码，等自动部署完成 |
| 构建（Build）失败 | Node 版本问题 | 项目设置 → 构建 → 环境变量加 `NODE_VERSION` = `20` |
| 改了环境变量但不生效 | 没重新部署 | 回第 3.4 步重试部署 |

---

> 📌 说明：项目里的 Vercel 配置（`vercel.json`、`api/`）**原样保留，没有删**。
> 哪天你在海外网络环境，Vercel 版照样能部署使用；两边代码互不干扰。
> 本项目的部署体系 = 前端一套代码 + 双平台同步接口（用哪个平台就配哪个）。
