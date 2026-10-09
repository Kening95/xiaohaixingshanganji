<script setup>
/**
 * ============================================================================
 * 个人中心页 —— ProfileView.vue（第 7 阶段新增）
 * ----------------------------------------------------------------------------
 * 四大模块（对照需求）：
 *   1. 账号信息：登录入口 / 已登录信息（手机号脱敏、登录方式、免登剩余天数）、退出登录
 *   2. 同步状态：实时同步状态（已同步/同步中/离线待传）、待传条数、最近同步时间
 *   3. 云端备份记录：最近 20 条同步/备份事件流水
 *   4. 数据管理：本机数据清单 + 一键清空（复用第 6 阶段隐私中心，零改动）
 * ============================================================================
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElTag } from 'element-plus'
import FtAvatar from '@/components/FtAvatar/FtAvatar.vue'
import LoginModal from '@/components/LoginModal.vue'
import { useAccount, logout } from '@/core/account'
import { useSync } from '@/core/sync'
import { listUserDataKeys, wipeAndReset } from '@/core/privacy'

const router = useRouter()
const account = useAccount()
const sync = useSync()

const loginOpen = ref(false)

/** 同步状态 → 展示文案与颜色 */
const SYNC_META = {
  idle:     { text: '待同步', type: 'info' },
  syncing:  { text: '同步中…', type: 'warning' },
  synced:   { text: '已同步 ☁️', type: 'success' },
  offline:  { text: '离线待传 📴', type: 'danger' }
}
const syncMeta = computed(() => SYNC_META[sync.status] || SYNC_META.idle)

/** 本机存了哪些本应用数据（数据管理清单） */
const dataKeys = computed(() => listUserDataKeys())

/** 时间格式化：2026-10-09 00:55:12 */
function fmtTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.toLocaleDateString('sv-SE')} ${d.toLocaleTimeString('zh-CN', { hour12: false })}`
}

/** 备份记录类型 → 图标 */
const KIND_ICON = { push: '⬆️', 'login-sync': '🔁', offline: '📴' }

function onLogout() {
  logout()
  window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text: '已退出登录，本机学习数据保留' } }))
}

/** 一键清空：复用隐私中心的二次确认流程（第 6 阶段已带软萌确认弹窗逻辑） */
function onWipe() {
  wipeAndReset() // 清数据 + 整页刷新回引导页
}
</script>

<template>
  <div class="profile">
    <header class="profile__header">
      <el-button @click="router.push('/map')">← 返回地图</el-button>
      <h1>👤 个人中心</h1>
    </header>

    <main class="profile__grid">
      <!-- ① 账号信息 -->
      <section class="profile-card">
        <h2>账号信息</h2>
        <div v-if="account.isLoggedIn.value" class="profile-card__body">
          <div class="account-row">
            <FtAvatar state="cheer" :size="56" />
            <div class="account-info">
              <b>{{ account.state.user.provider === 'wechat' ? '微信用户' : account.state.user.maskedPhone }}</b>
              <small>登录方式：{{ account.state.user.provider === 'wechat' ? '微信扫码' : '手机号验证码' }}</small>
              <small>登录于 {{ fmtTime(account.state.user.loggedAt) }}</small>
            </div>
          </div>
          <el-tag type="success">🎫 {{ account.daysLeft.value }} 天内自动免登</el-tag>
          <el-button class="profile-card__action" @click="onLogout">退出登录</el-button>
        </div>
        <div v-else class="profile-card__body">
          <p class="profile-tip">登录后 PC 端和手机端的学习数据自动互通，换设备不丢进度～</p>
          <el-button type="primary" class="profile-card__action" @click="loginOpen = true">
            🌊 立即登录
          </el-button>
        </div>
      </section>

      <!-- ② 同步状态 -->
      <section class="profile-card">
        <h2>同步状态</h2>
        <div class="profile-card__body">
          <div class="sync-row">
            <span>当前状态</span>
            <el-tag :type="syncMeta.type">{{ syncMeta.text }}</el-tag>
          </div>
          <div class="sync-row">
            <span>待同步记录</span>
            <b>{{ sync.pendingCount }} 条</b>
          </div>
          <div class="sync-row">
            <span>最近同步</span>
            <b>{{ fmtTime(sync.lastSyncAt) }}</b>
          </div>
          <p class="profile-tip">
            学习操作完成后后台自动静默同步（≤3 秒）；断网时本地暂存，恢复网络自动续传。
          </p>
        </div>
      </section>

      <!-- ③ 云端备份记录 -->
      <section class="profile-card">
        <h2>云端备份记录</h2>
        <div class="profile-card__body">
          <ul v-if="sync.history.length" class="backup-list">
            <li v-for="(item, i) in sync.history" :key="i">
              <span>{{ KIND_ICON[item.kind] || '☁️' }}</span>
              <span class="backup-list__detail">{{ item.detail }}</span>
              <time>{{ fmtTime(item.time) }}</time>
            </li>
          </ul>
          <p v-else class="profile-tip">还没有备份记录，登录后完成一次同步就有了～</p>
        </div>
      </section>

      <!-- ④ 数据管理（复用第 6 阶段隐私中心） -->
      <section class="profile-card profile-card--danger">
        <h2>数据管理</h2>
        <div class="profile-card__body">
          <p class="profile-tip">本机共 {{ dataKeys.length }} 项学习数据：{{ dataKeys.join('、') || '（无）' }}</p>
          <el-button type="danger" class="profile-card__action" @click="onWipe">
            🧹 一键清空所有个人数据
          </el-button>
          <p class="profile-tip">清空后不可恢复：计划、金币、错题、学习记录、背景设置全部归零。</p>
        </div>
      </section>
    </main>

    <!-- 登录浮层 -->
    <LoginModal v-model="loginOpen" />
  </div>
</template>

<style scoped>
.profile {
  min-height: 100vh;
  padding: var(--space-lg);
  background: var(--color-bg-page);
}

.profile__header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.profile__header h1 {
  margin: 0;
  font-size: var(--font-size-title);
  color: var(--color-text-primary);
}

/* 双列卡片布局，窄屏单列 */
.profile__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-lg);
  max-width: 960px;
  margin: 0 auto;
}

.profile-card {
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--space-lg);
}

.profile-card h2 {
  margin: 0 0 var(--space-md);
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
}

.profile-card__body {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  align-items: flex-start;
}

.profile-card__action {
  align-self: stretch;
}

.profile-tip {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: var(--line-height-base);
}

.account-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.account-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.account-info small {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.sync-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.backup-list {
  margin: 0;
  padding: 0;
  list-style: none;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  max-height: 240px;
  overflow-y: auto;
}

.backup-list li {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
}

.backup-list__detail {
  flex: 1;
  color: var(--color-text-primary);
}

.backup-list time {
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.profile-card--danger {
  border: 2px solid var(--color-highlight-deep);
}
</style>
