# 粉蹄闯关记 · 本地启动说明

> 第一阶段：项目基础骨架工程（Vue 3 + Vite + Element Plus）
> 面向小白：照下面 4 步走，复制到 VS Code 里就能跑起来看到效果。

---

## 第一步：安装 Node.js（只需装一次）

如果电脑没装过 Node.js：

1. 打开官网 https://nodejs.org/zh-cn ，下载 **LTS 长期支持版**
2. 双击安装，一路点"下一步"即可（全部用默认选项）
3. 装完后，在 VS Code 里按 `` Ctrl + ` `` 打开终端，输入：

   ```bash
   node -v
   ```

   能显示版本号（如 `v20.x.x`）就说明装好了。

---

## 第二步：用 VS Code 打开项目

1. 打开 VS Code → 菜单栏 `文件` → `打开文件夹`
2. 选择本项目文件夹：`粉蹄闯关记`
3. 按 `` Ctrl + ` `` 打开 VS Code 内置终端

---

## 第三步：安装依赖（只需执行一次）

在终端里输入：

```bash
npm install
```

这一步会根据 `package.json` 自动下载项目需要的所有第三方库
（下载到 `node_modules` 文件夹，约 1~3 分钟，取决于网速）。

> 💡 如果 `npm install` 很慢，可以换国内镜像再试：
> `npm config set registry https://registry.npmmirror.com` 然后重新执行安装。

---

## 第四步：启动项目

在终端里输入：

```bash
npm run dev
```

看到类似下面的输出就说明启动成功了：

```
  ➜  Local:   http://localhost:7100/
```

然后按住 `Ctrl` 键点击（或直接复制到浏览器打开）`http://localhost:7100/`
，就能看到**骨架演示页**：配色规范色卡、粉蹄 5 状态动画、3 个扩展接口的实机演示。

- 按 `` Ctrl + C `` 可以停止项目
- 改代码后页面会自动刷新，不用手动重启

---

## 上线部署（项目开发完成后）

项目已内置 Vercel 免费部署配置（`vercel.json` + `api/sync.js` 云函数），
把项目传到 GitHub 再导入 Vercel 即可拿到公开网址。照下面三份文档操作：

1. **[部署指引](docs/部署指引.md)** —— 3 步小白指引：传代码 → 一键部署 → 开通云端数据同步
2. **[数据备份规则](docs/数据备份规则.md)** —— 用户学习数据如何自动备份、断网续传、多端合并
3. **[上线运维常见问题手册](docs/上线运维常见问题手册.md)** —— 404 / 白屏 / 同步失败等报错对照修复

---

## 常见问题

| 问题 | 解决办法 |
| --- | --- |
| `npm 不是内部或外部命令` | Node.js 没装好，或装完没重启 VS Code，重启 VS Code 再试 |
| 端口 7100 被占用 | 终端会提示换端口，按提示的新地址打开即可；也可以关掉占用 7100 的程序 |
| 页面打开是白屏 | 按 `F12` 打开浏览器控制台，把红色报错截图发给开发同学 |
| 手机上想看效果 | 电脑和手机连同一个 Wi-Fi，启动时终端里会显示 `Network` 地址，手机浏览器打开那个地址 |

---

## 项目结构速览（每个模块是做什么的）

```
粉蹄闯关记/
├── index.html                  网页入口（浏览器第一个加载的文件）
├── vite.config.js              构建工具配置（路径别名 @ = src）
├── package.json                项目清单（项目名、依赖、启动命令）
│
└── src/
    ├── main.js                 应用总开关：创建 Vue 应用、注册插件、挂载页面
    ├── App.vue                 根组件（所有页面的"相框"）
    │
    ├── assets/styles/          【样式层】全局配色和通用样式
    │   ├── tokens.css          ★ 配色总开关：全部颜色/间距/字号/动画时长变量
    │   ├── base.css            浏览器样式重置 + 通用工具类（卡片、气泡）
    │   ├── ft-animation.css   粉蹄 5 状态动画的关键帧定义
    │   └── index.css           样式总入口（只负责按顺序引入上面三个）
    │
    ├── components/             【组件层】可复用的界面零件
    │   └── FtAvatar/          ★ 粉蹄海星组件：5 个状态动画，全站统一调用
    │
    ├── core/                   【核心接口层】★ 三大预留扩展接口都在这里
    │   ├── floatingSlot/       接口① 悬浮功能插槽：新功能注册后自动出现在悬浮栏
    │   ├── gamification/       接口② 游戏化数值总账：金币/体重/成就/图鉴统一改
    │   └── planRules/          接口③ 计划调整规则池：新规则往池里丢即可生效
    │
    ├── router/index.js         路由："网址 ↔ 页面"对照表
    └── views/
        └── SkeletonDemo.vue    骨架演示页（第一阶段验收展台）
```

## 三个扩展接口速查（后续开发直接调用，不改底层）

| 接口 | 文件 | 一个调用例子 |
| --- | --- | --- |
| ① 悬浮功能插槽 | `src/core/floatingSlot/index.js` | `registerFloatingSlot({ id, title, icon, onClick })` |
| ② 游戏化数值 | `src/core/gamification/index.js` | `addCoins(1, '原因')` / `changeWeight(-0.5, '原因')` |
| ③ 计划规则池 | `src/core/planRules/index.js` | `registerPlanRule({ id, when, adjust })` |

每个接口文件头部都有完整的中文注释和"照抄改改就能用"的接入示例。
