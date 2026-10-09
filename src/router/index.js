/**
 * ============================================================================
 * 路由配置 —— router/index.js
 * ----------------------------------------------------------------------------
 * 路由 = "网址 ↔ 页面"的对照表。
 *
 * 当前页面清单（对照需求清单 · 页面清单模块）：
 *   /onboarding  三步新手引导页（首次启动必经）
 *   /map         主闯关地图页（全站中枢）
 *   /level/:id   关卡任务详情页（4 关共用这一个组件，按 id 区分）
 *   /dashboard   可视化进度大盘页（第 5 阶段：四科目模块 + 周报入口）
 *   /wrongbook   电子错题本（第 4 阶段）
 *   /demo        骨架演示页（开发调试用，不影响正式流程）
 *
 * 全局守卫规则（需求清单：未完成引导无法进入任何其他功能页面）：
 *   · 没有计划数据时，访问任何功能页都会被弹回 /onboarding
 *   · /demo 是开发调试页，永远可进，方便随时查看组件效果
 * ============================================================================
 */
import { createRouter, createWebHistory } from 'vue-router'
import { loadPlan, hasPlan } from '@/core/plan'

// 应用启动时先从本地恢复计划数据（路由守卫要用它判断）
loadPlan()

const routes = [
  {
    path: '/',
    // 根地址：有计划 → 主地图；没计划 → 引导页
    redirect: () => (hasPlan() ? '/map' : '/onboarding')
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('@/views/OnboardingView.vue'),
    meta: { title: '新手引导' }
  },
  {
    path: '/map',
    name: 'map',
    component: () => import('@/views/MapView.vue'),
    meta: { title: '闯关地图' }
  },
  {
    path: '/level/:id',
    name: 'level',
    component: () => import('@/views/LevelView.vue'),
    meta: { title: '关卡任务' }
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: '可视化大盘' }
  },
  {
    path: '/wrongbook',
    name: 'wrongbook',
    component: () => import('@/views/WrongbookView.vue'),
    meta: { title: '电子错题本' }
  },
  {
    // 个人中心（第 7 阶段）：账号 / 同步状态 / 备份记录 / 数据管理
    path: '/profile',
    name: 'profile',
    component: () => import('@/views/ProfileView.vue'),
    meta: { title: '个人中心' }
  },
  {
    path: '/demo',
    name: 'skeleton-demo',
    // 动态 import（懒加载）：用到这个页面时才下载代码，首屏加载更快（<=2秒验收标准）
    component: () => import('@/views/SkeletonDemo.vue'),
    meta: { title: '骨架演示' }
  },
  {
    // 兜底：访问不存在的地址 → 回首页（首页再按计划有无自动分流）
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

// 开发环境专属：核心逻辑自测页（生产构建中整页不存在）
if (import.meta.env.DEV) {
  routes.push({
    path: '/selftest',
    name: 'selftest',
    component: () => import('@/views/SelfTestView.vue'),
    meta: { title: '自测' }
  })
}

const router = createRouter({
  history: createWebHistory(), // HTML5 路由模式：网址里没有 #，更美观
  routes
})

/* ---------------- 全局前置守卫：没做引导 = 哪也去不了 ---------------- */
router.beforeEach((to) => {
  // /demo 是开发调试页，豁免守卫
  if (to.path === '/demo') return true

  // /selftest 是开发自测页，豁免守卫（生产环境没有这个路由，无需担心）
  if (to.path === '/selftest') return true

  // 引导页本身永远可进（首次启动 / 想重新生成计划都从这里走）
  if (to.path === '/onboarding') return true

  // 个人中心（第 7 阶段）：账号与数据管理页，未做引导也可进（登录/清空数据不该被引导拦住）
  if (to.path === '/profile') return true

  // 其余所有功能页：没有计划数据（= 没完成引导）一律弹回引导页
  if (!hasPlan()) {
    console.log('[router] 尚未完成新手引导， redirected → /onboarding')
    return '/onboarding'
  }

  return true
})

// 关卡页专属守卫：未解锁的关卡直接输 URL 也进不来
router.beforeEach((to) => {
  if (to.name !== 'level' || !hasPlan()) return true
  // 从计划数据里查这一关是否已解锁
  const plan = loadPlan()
  const index = plan.stages.findIndex((s) => s.id === to.params.id)
  if (index === -1) return '/map' // 乱写的 id → 回地图
  // 预览模式：带 ?preview=1 可提前查看任意关卡内容（只读，不影响解锁与进度）
  if (to.query.preview === '1') return true
  // 这一关之前的所有关都要 100% 完成（只查相邻上一关会被"零任务关"绕过）
  const unlocked = plan.stages.slice(0, index).every((s) => s.tasks.every((t) => t.done))
  if (!unlocked) return '/map' // 前置关没打完 → 回地图（地图上会有软萌提示）
  return true
})

// 切换页面后自动修改浏览器标签页标题（小体验优化）
router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 小海星上岸记` : '小海星上岸记'
})

export default router
