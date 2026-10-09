<script setup>
/**
 * ============================================================================
 * 粉蹄备考周报弹窗 —— components/WeeklyReportModal.vue（第 5 阶段新增）
 * ----------------------------------------------------------------------------
 * 展示 core/report 生成的周报数据：
 *   7 天学习柱状图 → 总量数据 → 薄弱模块 → 下周优化建议 → 本周亮点
 * 「导出长图」用 html2canvas 把周报内容截成一张 PNG 下载保存，
 * 方便发给督学群或存手机相册。
 *
 * 弹窗里的图表全部用普通 DOM（div 柱条）而不是 canvas 绘制，
 * 就是为了能被 html2canvas 完整截图。
 * ============================================================================
 */
import { computed, ref, nextTick } from 'vue'
import { ElDialog } from 'element-plus'
import { useThisWeekReport } from '@/core/report'

const props = defineProps({
  /** 是否显示弹窗（v-model） */
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

/** 本周周报（进入大盘时 maybeAutoWeeklyReport 已自动生成，这里兜底取） */
const fallback = useThisWeekReport()
const report = computed(() => fallback.value)

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 柱状图高度：以 7 天里学得最久的一天为 100% */
const maxMinutes = computed(() =>
  Math.max(60, ...(report.value?.days.map((d) => d.minutes) || [0]))
)

/* ---------------- 一键导出长图 ---------------- */
const reportBody = ref(null)
const exporting = ref(false)

async function exportLongImage() {
  if (!reportBody.value || exporting.value) return
  exporting.value = true
  try {
    // 懒加载 html2canvas（约 100KB，点导出才下载）
    const { default: html2canvas } = await import('html2canvas')
    // 等一帧确保弹窗过渡动画结束、布局稳定再截图
    await nextTick()
    const canvas = await html2canvas(reportBody.value, {
      backgroundColor: '#ffffff',
      scale: 2 // 2 倍清晰度，手机上放大也不糊
    })
    const link = document.createElement('a')
    link.download = `粉蹄备考周报_${report.value?.weekLabel || ''}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text: '📸 周报长图已保存到下载目录～' } }))
  } catch (error) {
    console.error('[report] 长图导出失败：', error)
    window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text: '长图导出失败，可以试试右键另存为截图～' } }))
  } finally {
    exporting.value = false
  }
}

const fmtHours = (min) => (Math.round(min / 6) / 10).toFixed(1)
</script>

<template>
  <el-dialog v-model="visible" width="640px" :show-close="true" class="report-dialog">
    <template #header>
      <span class="report__header-title">📰 粉蹄备考周报</span>
    </template>

    <!-- 截图范围 = reportBody（导出长图只截这一块，不含底部按钮） -->
    <div v-if="report" ref="reportBody" class="report">
      <div class="report__brand">🌊 小海星上岸记 · 每周一自动汇总</div>
      <h2 class="report__week">{{ report.weekLabel }}</h2>
      <p class="report__gen">生成时间：{{ report.generatedAt.slice(0, 16).replace('T', ' ') }}</p>

      <!-- 总量数据卡 -->
      <div class="report__stats">
        <div class="stat"><b>{{ fmtHours(report.totals.studyMinutes) }}</b><span>学习时长(小时)</span></div>
        <div class="stat">
          <b>{{ report.totals.avgAccuracy == null ? '—' : Math.round(report.totals.avgAccuracy * 100) + '%' }}</b>
          <span>小测平均正确率</span>
        </div>
        <div class="stat"><b>{{ report.totals.wrongAdded }}</b><span>新收录错题</span></div>
        <div class="stat"><b>{{ report.totals.radioMinutes }}</b><span>电台收听(分钟)</span></div>
        <div class="stat"><b>{{ report.totals.fullAttendance }}/7</b><span>坚持学习(天)</span></div>
      </div>

      <!-- 7 天学习柱状图（纯 DOM，方便长图截图） -->
      <h3 class="report__section">📈 过去 7 天学习时长</h3>
      <div class="bars">
        <div v-for="d in report.days" :key="d.date" class="bars__col">
          <span class="bars__value">{{ d.minutes ? Math.round(d.minutes / 60 * 10) / 10 + 'h' : '' }}</span>
          <div class="bars__track">
            <div class="bars__fill" :style="{ height: Math.round(d.minutes / maxMinutes * 100) + '%' }"></div>
          </div>
          <span class="bars__day">{{ WEEKDAY_NAMES[d.weekday] }}</span>
          <span class="bars__date">{{ d.date.slice(5) }}</span>
        </div>
      </div>

      <!-- 薄弱模块 + 下周建议 -->
      <h3 class="report__section">🔍 薄弱模块诊断</h3>
      <p class="report__weak">
        {{ report.weakSubjects.length ? `本周重点薄弱：${report.weakSubjects.join('、')}` : '本周没有明显薄弱模块，继续保持！' }}
      </p>

      <h3 class="report__section">💡 下周优化建议</h3>
      <ul class="report__suggestions">
        <li v-for="(s, i) in report.suggestions" :key="i">{{ s }}</li>
      </ul>

      <!-- 亮点 -->
      <div v-if="report.highlights.length" class="report__highlights">
        <h3 class="report__section">✨ 本周亮点</h3>
        <div class="report__chips">
          <span v-for="(h, i) in report.highlights" :key="i" class="report__chip">{{ h }}</span>
        </div>
      </div>

      <p class="report__footer">—— 粉蹄陪你，一题一题上岸 ——</p>
    </div>

    <div v-else class="report report--empty">
      <p>本周数据还在收集中，学习一天后就有周报啦～</p>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :loading="exporting" :disabled="!report" @click="exportLongImage">
        📸 一键导出长图
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* ---------- 弹窗整体 ---------- */
.report__header-title { font-weight: bold; }
.report {
  background: #fff;
  border-radius: var(--radius-md);
  padding: var(--space-md);
}
.report--empty { text-align: center; color: var(--color-text-secondary); }

/* 头部 */
.report__brand { font-size: var(--font-size-sm); color: var(--color-accent-deep); }
.report__week { font-size: var(--font-size-lg); margin: 4px 0; }
.report__gen { font-size: 12px; color: var(--color-text-secondary); margin-bottom: var(--space-md); }

/* 总量数据卡：5 格等宽 */
.report__stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--color-bg-bubble);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
}
.stat b { font-size: 20px; color: var(--color-accent-deep); }
.stat span { font-size: 12px; color: var(--color-text-secondary); }

/* 柱状图 */
.report__section { font-size: var(--font-size-md); margin: var(--space-md) 0 var(--space-sm); }
.bars { display: flex; gap: var(--space-sm); align-items: flex-end; height: 140px; }
.bars__col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; }
.bars__value { font-size: 11px; color: var(--color-text-secondary); min-height: 14px; }
.bars__track {
  flex: 1;
  width: 100%;
  max-width: 36px;
  display: flex;
  align-items: flex-end;
  background: var(--color-primary);
  border-radius: 6px 6px 0 0;
  overflow: hidden;
}
.bars__fill {
  width: 100%;
  background: linear-gradient(180deg, var(--color-accent), var(--color-accent-deep));
  border-radius: 6px 6px 0 0;
  transition: height var(--duration-base) var(--easing-soft);
  min-height: 0;
}
.bars__day { font-size: 11px; margin-top: 4px; }
.bars__date { font-size: 10px; color: var(--color-text-secondary); }

/* 建议与亮点 */
.report__weak {
  background: #fff7ec;
  border: 2px solid var(--color-accent);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
}
.report__suggestions { padding-left: 1.2em; line-height: 1.8; }
.report__chips { display: flex; flex-wrap: wrap; gap: var(--space-sm); }
.report__chip {
  background: var(--color-primary);
  border-radius: var(--radius-round);
  padding: var(--space-xs) var(--space-md);
  font-size: var(--font-size-sm);
}
.report__footer {
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  margin-top: var(--space-lg);
}
</style>
