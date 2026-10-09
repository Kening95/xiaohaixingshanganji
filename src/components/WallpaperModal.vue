<script setup>
/**
 * ============================================================================
 * 幸运 buff 壁纸生成弹窗 —— components/WallpaperModal.vue（第 6 阶段新增）
 * ----------------------------------------------------------------------------
 * 选 buff 文案（可随机）→ 选主题（商店限定主题未解锁时显示锁）→
 * 实时预览 → 一键下载 PNG 壁纸。
 * 数据全在 core/wallpaper，本组件只做交互。
 * ============================================================================
 */
import { computed, ref, watch } from 'vue'
import { ElDialog } from 'element-plus'
import { availableBuffs, availableThemes, generateWallpaper, downloadWallpaper } from '@/core/wallpaper'
import { owns } from '@/core/shop'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const buffs = availableBuffs()
const themes = availableThemes()

const selectedBuff = ref('')
const selectedTheme = ref('morning')
const preview = ref('')

/** 换一条随机 buff */
function rollBuff() {
  const pool = availableBuffs()
  selectedBuff.value = pool[Math.floor(Math.random() * pool.length)]
}

/** 重新生成预览（选项变化即刷新） */
function refresh() {
  preview.value = generateWallpaper({ buff: selectedBuff.value, themeId: selectedTheme.value })
}
watch([selectedBuff, selectedTheme], refresh)
watch(visible, (open) => { if (open) { rollBuff(); refresh() } })

function onDownload() {
  downloadWallpaper(preview.value, selectedTheme.value === 'starry' ? '_星空粉' : '')
  window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text: '🖼️ 幸运壁纸已保存到下载目录，设为手机壁纸接好运～' } }))
}
</script>

<template>
  <el-dialog v-model="visible" width="440px">
    <template #header>
      <span class="wp__title">🖼️ 考前幸运 buff 壁纸</span>
    </template>

    <!-- 预览：壁纸比例 9:16 -->
    <div class="wp__preview">
      <img v-if="preview" :src="preview" alt="幸运壁纸预览" class="wp__img" />
    </div>

    <!-- buff 文案选择 -->
    <div class="wp__row">
      <span class="wp__label">buff 文案</span>
      <el-select v-model="selectedBuff" class="wp__select" placeholder="选一条幸运 buff">
        <el-option v-for="b in buffs" :key="b" :label="b" :value="b" />
      </el-select>
      <el-button size="small" @click="rollBuff">🎲 随机</el-button>
    </div>

    <!-- 主题选择（商店限定未解锁显示锁） -->
    <div class="wp__row">
      <span class="wp__label">主题</span>
      <el-radio-group v-model="selectedTheme">
        <el-radio-button
          v-for="t in themes"
          :key="t.id"
          :value="t.id"
        >{{ t.name }}</el-radio-button>
      </el-radio-group>
    </div>
    <p v-if="!owns('theme-starry')" class="wp__lock-tip">
      🔒 「星空粉」主题可在金币商店购买解锁
    </p>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :disabled="!preview" @click="onDownload">⬇️ 下载壁纸</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.wp__title { font-weight: bold; }
.wp__preview {
  display: flex;
  justify-content: center;
  background: var(--color-primary);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
  margin-bottom: var(--space-md);
}
.wp__img {
  height: 380px; /* 按 9:16 等比展示 */
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-card);
}
.wp__row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);
}
.wp__label { font-size: var(--font-size-sm); white-space: nowrap; }
.wp__select { flex: 1; }
.wp__lock-tip { font-size: 12px; color: var(--color-text-secondary); }
</style>
