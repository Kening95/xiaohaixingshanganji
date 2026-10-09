<script setup>
/**
 * ============================================================================
 * 粉蹄金币商店弹窗 —— components/ShopModal.vue（第 6 阶段新增）
 * ----------------------------------------------------------------------------
 * 商品货架 + 余额展示。购买即时生效：免增重卡写入护盾、投喂立刻减重、
 * buff 签和主题解锁给壁纸生成器用。
 * 入口：主地图顶栏金币按钮（原来占位的 toast 终于转正）。
 * ============================================================================
 */
import { computed, ref } from 'vue'
import { ElDialog } from 'element-plus'
import { useShop, purchase } from '@/core/shop'
import { useGamification } from '@/core/gamification'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const shop = useShop()
const game = useGamification()

function toast(text) {
  window.dispatchEvent(new CustomEvent('fenti:toast', { detail: { text } }))
}

/** 展示余额不足的具体差距，点击后给出软萌反馈 */
function onBuy(item) {
  const result = purchase(item.id)
  toast(result.message)
}
</script>

<template>
  <el-dialog v-model="visible" width="560px">
    <template #header>
      <span class="shop__title">🛒 粉蹄金币商店 · 余额 🪙 {{ game.coins }}</span>
    </template>

    <div class="shop__grid">
      <div v-for="item in shop.items" :key="item.id" class="shop__card">
        <span class="shop__icon">{{ item.icon }}</span>
        <b class="shop__name">{{ item.name }}</b>
        <p class="shop__desc">{{ item.desc }}</p>
        <el-button
          size="small"
          type="primary"
          :disabled="game.coins < item.price"
          @click="onBuy(item)"
        >
          🪙 {{ item.price }} 购买
        </el-button>
        <span v-if="item.ownedCount > 0" class="shop__owned">已购 ×{{ item.ownedCount }}</span>
      </div>
    </div>

    <p class="shop__tip">金币来自：每日全勤 +10、攻克错题 +1、电台 10 分钟 +1、结伴奖励、专注幻境…</p>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.shop__title { font-weight: bold; }
.shop__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-md);
}
.shop__card {
  border: 2px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  background: #fafcff;
}
.shop__icon { font-size: 32px; }
.shop__name { font-size: var(--font-size-base); }
.shop__desc { font-size: var(--font-size-sm); color: var(--color-text-secondary); min-height: 40px; }
.shop__owned { font-size: 12px; color: var(--color-accent-deep); }
.shop__tip { font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-top: var(--space-md); }
</style>
