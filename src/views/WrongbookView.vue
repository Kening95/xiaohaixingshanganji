<script setup>
/**
 * ============================================================================
 * 电子错题本 —— views/WrongbookView.vue
 * ----------------------------------------------------------------------------
 * 需求实现：
 *   · 所有扫题收录的错题按"科目 / 日期"标签展示，可按科目筛选
 *   · 每道未攻克错题 = 1 只存活小怪兽（👾），攻克一只 +1 金币
 *   · 一键导出"空白错题册"：排版适配 A4 纸，题目图 + 大面积空白重做区，
 *     浏览器打印对话框直接打印或另存 PDF
 *
 * 打印实现：动态生成一个仅含打印内容的 HTML 新窗口（@page A4），
 * 加载完成后调起 print()。Chrome / Edge / Safari 均支持。
 * ============================================================================
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWrongbook, useActiveMonsters, useSubjects, markCorrect, removeEntry } from '@/core/wrongbook'
import { unlockAchievement } from '@/core/gamification'

const router = useRouter()
const entries = useWrongbook()
const monsters = useActiveMonsters()
const subjects = useSubjects()

/** 软萌提示 */
function softToast(text) {
  window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text } }))
}

/* ---------------- 筛选 ---------------- */

const filterSubject = ref('全部')
const filterStatus = ref('active') // active=待攻克 / defeated=已攻克 / all=全部

const filtered = computed(() => entries.value.filter((e) => {
  const subjectOk = filterSubject.value === '全部' || e.subject === filterSubject.value
  const statusOk = filterStatus.value === 'all'
    || (filterStatus.value === 'active' ? e.status === 'wrong' : e.status === 'defeated')
  return subjectOk && statusOk
}))

/* ---------------- 攻克 / 删除 ---------------- */

/** 二次标记做对：消除小怪兽 + 1 金币（需求④） */
function onDefeat(entry) {
  const result = markCorrect(entry.id)
  if (result.changed) {
    softToast(`⚔️ 攻克「${entry.subject}」错题！小怪兽 -1，金币 +1～`)
    // 徽章：累计攻克 10 道解锁「小怪兽猎手」（第 5 阶段，幂等）
    const defeatedTotal = entries.value.filter((e) => e.status === 'defeated').length
    if (defeatedTotal >= 10) {
      unlockAchievement('monster-hunter', { title: '小怪兽猎手', description: '累计攻克 10 道错题', icon: '⚔️' })
    }
  } else {
    softToast('这道题已经攻克过啦，金币不重复发哦～')
  }
}

function onRemove(entry) {
  removeEntry(entry.id)
  softToast('已移除这道错题记录～')
}

/* ---------------- 导出 A4 空白错题册 ---------------- */

/**
 * 生成打印窗口并调起打印。
 * 每道"待攻克"错题一页 A4：题图（原比例缩放）+ 大面积横线重做区。
 */
function printBooklet() {
  const targets = monsters.value
  if (!targets.length) {
    softToast('现在没有存活的小怪兽，错题都被攻克啦，不用打印～')
    return
  }

  const today = new Date().toLocaleDateString('sv-SE')
  // 每页内容：页眉（编号/科目/日期）+ 题图 + 重做区
  const pages = targets.map((e, i) => `
    <section class="sheet">
      <header class="sheet__head">
        <span class="sheet__no">错题 ${String(i + 1).padStart(2, '0')}</span>
        <span class="sheet__tag">科目：${e.subject}</span>
        <span class="sheet__tag">收录：${e.date}</span>
        <span class="sheet__tag">重做：____年__月__日</span>
      </header>
      <div class="sheet__image"><img src="${e.image}" alt="错题" /></div>
      <div class="sheet__redo">
        <p class="sheet__redo-title">✏️ 重做区</p>
        <div class="sheet__lines"></div>
      </div>
    </section>`).join('\n')

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<title>粉蹄空白错题册 ${today}</title>
<style>
  /* A4 纸：210mm × 297mm，页边距 15mm，每题独立一页 */
  @page { size: A4 portrait; margin: 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #333; }

  .sheet {
    page-break-after: always; /* 每道错题单独一页 */
    height: 265mm;            /* 留出页边距后的可用高度 */
    display: flex;
    flex-direction: column;
  }
  .sheet:last-child { page-break-after: auto; }

  .sheet__head {
    display: flex;
    gap: 12px;
    align-items: baseline;
    border-bottom: 2px solid #ffb86c;
    padding-bottom: 6px;
    margin-bottom: 10px;
  }
  .sheet__no { font-size: 16px; font-weight: 700; color: #d98317; }
  .sheet__tag { font-size: 12px; color: #666; }

  /* 题图：按比例缩放，最高占半页，居中 */
  .sheet__image {
    text-align: center;
    margin-bottom: 12px;
  }
  .sheet__image img {
    max-width: 100%;
    max-height: 120mm;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  /* 重做区：横线笔记本效果，撑满剩余空间 */
  .sheet__redo { flex: 1; display: flex; flex-direction: column; }
  .sheet__redo-title { font-size: 13px; color: #999; margin-bottom: 4px; }
  .sheet__lines {
    flex: 1;
    background: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 27px,
      #cfe3f5 27px,
      #cfe3f5 28px
    );
    border: 1px dashed #ffc7e0;
    border-radius: 6px;
  }
</style>
</head>
<body>
${pages}
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) {
    softToast('弹窗被拦住了～允许本站的弹出式窗口后重试')
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  // 等图片加载完再调打印，避免打印出空白图
  win.onload = () => {
    win.print()
    softToast(`🖨️ 已生成 ${targets.length} 页空白错题册，在打印对话框里选 A4 纸打印～`)
  }
  // 部分浏览器 onload 先于图片完成，兜底再补一次
  setTimeout(() => { try { win.print() } catch (e) { /* 已打印或用户关闭 */ } }, 2500)
}

function goBack() {
  router.push('/map')
}

/* ---------------- 错题专属模拟卷（第 5 阶段） ----------------
 * 拉取最近 30 天错题去重 → 按行测题型比例组卷 → jsPDF 生成 A4 空白卷下载。
 * 组卷逻辑在 core/mockexam，这里只负责按钮交互。
 */
const examGenerating = ref(false)

async function onMakeMockExam() {
  if (examGenerating.value) return
  examGenerating.value = true
  try {
    const { collectRecentWrongs, assembleMockExam, downloadMockExamPdf } = await import('@/core/mockexam')
    const wrongs = collectRecentWrongs(30)
    if (wrongs.length === 0) {
      softToast('最近 30 天还没有收录错题，先用「粉蹄扫题」收集几道吧～')
      return
    }
    const exam = assembleMockExam(wrongs)
    const ok = await downloadMockExamPdf(exam)
    if (ok) {
      softToast(`📄 模拟卷已生成：共 ${exam.total} 题（${exam.sections.map((s) => `${s.subject}${s.questions.length}题`).join(' / ')}），A4 打印开做！`)
    }
  } catch (error) {
    console.error('[wrongbook] 模拟卷生成失败：', error)
    softToast('模拟卷生成失败，请重试或先用「导出空白错题册」打印～')
  } finally {
    examGenerating.value = false
  }
}
</script>

<template>
  <div class="wb-page">
    <header class="wb-header">
      <el-button @click="goBack">← 返回地图</el-button>
      <h1>📕 电子错题本</h1>
      <div class="wb-header__stats">
        <span class="wb-chip wb-chip--monster">👾 小怪兽 ×{{ monsters.length }}</span>
        <el-button :loading="examGenerating" @click="onMakeMockExam">📄 生成错题模拟卷（A4 PDF）</el-button>
        <el-button type="primary" @click="printBooklet">🖨️ 导出空白错题册（A4 打印）</el-button>
      </div>
    </header>

    <!-- 筛选栏：科目 + 状态 -->
    <div class="wb-filters">
      <el-radio-group v-model="filterStatus">
        <el-radio-button value="active">待攻克（{{ monsters.length }}）</el-radio-button>
        <el-radio-button value="defeated">已攻克</el-radio-button>
        <el-radio-button value="all">全部</el-radio-button>
      </el-radio-group>
      <el-select v-model="filterSubject" class="wb-filters__subject">
        <el-option label="全部科目" value="全部" />
        <el-option v-for="s in subjects" :key="s" :label="s" :value="s" />
      </el-select>
    </div>

    <!-- 错题卡片网格 -->
    <main v-if="filtered.length" class="wb-grid">
      <div v-for="entry in filtered" :key="entry.id" class="wb-card" :class="{ 'wb-card--defeated': entry.status === 'defeated' }">
        <img :src="entry.image" :alt="entry.subject" class="wb-card__img" />
        <div class="wb-card__meta">
          <span class="wb-chip">{{ entry.subject }}</span>
          <span class="wb-chip wb-chip--date">📅 {{ entry.date }}</span>
        </div>
        <!-- 小怪兽状态：存活 = 灰黑小怪兽；攻克 = 消散光效 -->
        <div class="wb-card__status">
          {{ entry.status === 'wrong' ? '👾 小怪兽存活中' : '✨ 已攻克' }}
        </div>
        <div class="wb-card__actions">
          <el-button
            v-if="entry.status === 'wrong'"
            type="primary"
            size="small"
            @click="onDefeat(entry)"
          >我做对了！消灭它 ⚔️</el-button>
          <el-button size="small" @click="onRemove(entry)">移除</el-button>
        </div>
      </div>
    </main>
    <div v-else class="wb-empty">
      <p>{{ filterStatus === 'active' ? '太干净了！现在没有存活的错题小怪兽～' : '还没有这个范围的错题记录' }}</p>
      <p class="wb-empty__tip">用右侧悬浮的「粉蹄扫题」拍照刷题页，错题会自动收进来</p>
    </div>
  </div>
</template>

<style scoped>
.wb-page {
  min-height: 100vh;
  background: var(--color-bg-page);
  padding: var(--space-lg) var(--space-xl);
  max-width: 1000px;
  margin: 0 auto;
}

.wb-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
  flex-wrap: wrap;
}

.wb-header h1 {
  margin: 0;
  font-size: var(--font-size-title);
  color: var(--color-text-primary);
  flex: 1;
}

.wb-header__stats {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

/* 标签小胶囊 */
.wb-chip {
  display: inline-block;
  font-size: var(--font-size-base);
  padding: 2px var(--space-md);
  border-radius: var(--radius-round);
  background: var(--color-primary);
  color: var(--color-text-primary);
  white-space: nowrap;
}

.wb-chip--date {
  background: var(--color-highlight);
}

.wb-chip--monster {
  background: var(--color-highlight);
  border: 2px solid var(--color-highlight-deep);
  font-weight: 700;
}

/* 筛选栏 */
.wb-filters {
  display: flex;
  gap: var(--space-md);
  align-items: center;
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
}

.wb-filters__subject {
  width: 160px;
}

/* 错题网格 */
.wb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-lg);
}

.wb-card {
  background: var(--color-bg-card);
  border: 2px solid transparent;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.wb-card--defeated {
  opacity: 0.7;
}

.wb-card__img {
  width: 100%;
  height: 200px;
  object-fit: contain;
  background: #fff;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.wb-card__meta {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.wb-card__status {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}

.wb-card__actions {
  display: flex;
  gap: var(--space-sm);
}

.wb-empty {
  text-align: center;
  padding: var(--space-xxl) 0;
  color: var(--color-text-secondary);
  font-size: var(--font-size-lg);
}

.wb-empty__tip {
  font-size: var(--font-size-base);
}
</style>
