# 《小海星上岸记》Cloudflare 部署指引（国内可直接访问版）

> 适合人群：完全没接触过服务器、没部署过网站的小白。
> 为什么用 Cloudflare：Vercel 免费域名 `xxx.vercel.app` 在国内被网络封锁打不开，
> 而 Cloudflare 给的网址**国内可以直接访问**，所以改用 Cloudflare 部署，效果一模一样，不用花钱买域名。
>
> ⏱ 全程约 15 分钟。本文档按 2026 年新版 Cloudflare 界面逐步编写（Pages 已并入 Workers，
> 全程没有 "Framework preset" 下拉框，属正常现象，照填即可）。

---

## 开始前准备（一次性，2 分钟）

注册 **Cloudflare** 免费账号：

1. 打开 <https://dash.cloudflare.com/sign-up>
2. 用**邮箱**注册（不需要 GitHub 登录），收验证邮件点链接激活。
3. （可选）在账号设置里把语言切换成**简体中文**。

> 📌 代码仓库还是原来那个 GitHub：`Kening95/xiaohaixingshanganji`，不用重新传。

---

## 第 1 步：导入 GitHub 仓库并部署（约 5 分钟）

1. Cloudflare 控制台左侧 **「Workers 和 Pages」** → 点 **「Create application」**（创建应用）
2. 点 **「Import a repository」**（导入仓库）→ **「Connect GitHub」**
3. 浏览器里登录 Kening95 → 授权页选 **「All repositories」**（或只选 `xiaohaixingshanganji`）→ **「Install」**
4. 回到 Cloudflare，选 **`xiaohaixingshanganji`** → 点 **「Next」**（下一步）
5. 进入 **「Set up your application」** 页面，照下面填（其他地方不动）：

   | 页面字段（英文） | 填什么 |
   |---|---|
   | Project name | `xiaohaixingshanganji`（自动带出的，别改） |
   | Build command（构建命令） | `npm run build` |
   | Deploy command（部署命令） | `npx wrangler@4.149.0 deploy` ⚠️ 必须带 `@4.149.0`（固定新版部署工具，避开旧版解析 bug） |
   | Preview command | 留空不管 |

6. 同页找到 **Environment variables / Variables** 区域 → **「Add」** 添加一个变量：
   - **Variable name**：`NODE_VERSION`
   - **Value**：`22` ⚠️ 必须 22 及以上（新版 wrangler 要求 Node.js ≥ 22，写 20 部署最后一步必报错）
7. 点 **「Deploy」**（部署）→ 等 2 分钟
8. 成功后页面上会出现你的网址（形如 `https://xiaohaixingshanganji.xxx.workers.dev`，**以页面实际显示的为准**），手机流量网络也能直接打开！

> 📌 以后每次改进：本地 `git add . && git commit -m "说明" && git push`，
> Cloudflare 检测到变化会**自动重新构建部署**，什么都不用点。

---

## 第 2 步：先自己验证一遍（1 分钟）

打开部署成功的网址，玩一圈：地图、关卡、扫题、电台、商店、个人中心。
- 直接输 `网址/map` 能打开（不会 404）✅ 说明页面路由正常
- 此时个人中心会显示"同步失败"——**这是正常的**，云端数据库还没配，接着做第 3 步。

---

## 第 3 步：开通云端数据同步（约 5 分钟，强烈建议）

不配这步网站也能玩，但学习数据只存在各人浏览器里（换设备/清缓存就丢）。
配好后：任何操作 3 秒内自动备份云端，换手机换电脑登录自动恢复。

### 3.1 创建云端数据库（KV）

1. 左侧菜单 **「Storage & Databases」→「KV」** → **「Create a namespace」**
2. 名字填 `shanganji-kv` → **「Add」**

### 3.2 把数据库绑定到网站

1. **「Workers 和 Pages」** 里点你的项目 `xiaohaixingshanganji`
2. 左侧 **「Settings」→「Bindings」** → **「Add」** → 类型选 **「KV Namespace」**
3. 填两项：
   - **Variable name**：必须一字不差填 `SYNC_KV`（代码里写死了这个名）
   - **Namespace**：选刚创建的 `shanganji-kv`
4. 保存（环境选 Production 即可）

### 3.3 设置同步地址环境变量

1. 左侧 **「Settings」→「Environment variables」** → **「Add」**
2. 填两项（网址用第 1 步第 8 小步实际拿到的）：

   | Variable name | Value |
   |---|---|
   | `VITE_SYNC_ENDPOINT` | `https://你的实际网址/api/sync` |

### 3.4 重新部署一次（关键！）

环境变量和绑定都要重新部署才生效：

1. 左侧 **「Deployments」** → 最新一条右边 **「⋯」→「Retry deployment」**
2. 等 1~2 分钟

### 3.5 验证同步是否成功

打开网站 → 登录（手机号验证码演示码 `888888`）→ 个人中心看「同步状态」显示**已同步** ✅；
回地图勾选任意任务，等 3 秒刷新页面，进度还在 = 云端备份生效 🎉

---

## 部署完成检查清单

- [ ] 手机流量（不开代理）能打开网站并正常显示地图
- [ ] 直接输入 `网址/map`、`网址/dashboard` 等子页面不会 404
- [ ] 登录（888888）→ 勾选任务 → 刷新，进度不丢
- [ ] 个人中心「云端备份记录」能看到同步记录

---

## 常见问题速查

| 现象 | 原因 | 解决 |
|---|---|---|
| 部署日志报 `Error parsing file: vite.config.js` | 部署工具（wrangler）版本旧，解析配置文件有 bug | Deploy command 固定写成 `npx wrangler@4.149.0 deploy`，重试部署 |
| 部署日志报 `Wrangler requires at least Node.js v22` | Node 版本不够 | 环境变量 `NODE_VERSION` 改成 `22`，重试部署 |
| 部署日志打印一大段 npm 帮助文字后失败 | `npm ci` 校验锁文件失败（package-lock 与 package.json 不同步） | 本地运行一次 `npm install`，`git add . && git commit && git push` 后再重试部署 |
| 个人中心显示"同步失败" | KV 没绑定或绑定名不是 `SYNC_KV` | 回 3.2 检查，绑定后重试部署 |
| 打开子页面 404 | 部署的代码不是最新（缺 SPA 路由配置 `not_found_handling`） | 确认 `git push` 了最新代码（含 `wrangler.toml`），等自动部署完成 |
| 改了环境变量/绑定但不生效 | 没重新部署 | 回 3.4 重试部署 |
| 导入仓库时报 `Must be a GitHub or GitLab repository URL` | GitHub 没授权或没给该仓库权限 | 先点 Connect GitHub 完成授权；或到 github.com/settings/installations 给 Cloudflare 加上该仓库权限 |

---

> 📌 说明：项目里的 Vercel 配置（`vercel.json`、`api/`）**原样保留，没有删**，
> 海外网络环境照样能用 Vercel 部署。Cloudflare 侧是双保险结构：
> `worker.js` + `wrangler.toml`（新版 Workers 流程使用）和 `functions/api/sync.js`（老版 Pages 流程使用），
> 两套互不冲突，用哪个流程部署都能跑。
