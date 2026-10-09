/**
 * ============================================================================
 * 粉蹄金币商店 —— core/shop/index.js（第 6 阶段新增）
 * ----------------------------------------------------------------------------
 * 金币的"消费出口"：之前各功能赚的金币，在这里换成真实的助力道具。
 *
 * 商品设计原则（每条都有真实效果，不做纯摆设）：
 *   · 免增重卡（5 币）：今日有任务没完成时，抵消 +1 斤的增重（当日一次性）
 *   · 海星投喂（12 币）：粉蹄立刻减重 1 斤（走 gamification.changeWeight）
 *   · 幸运 buff 签（8 币）：解锁一组考前幸运 buff 文案，壁纸生成器可用
 *   · 星空粉主题（15 币）：壁纸生成器的限定配色主题
 *
 * 交易全部走游戏化统一接口②（addCoins 负数扣款），库存与购买记录存
 * localStorage（key = 'fenti-shop-v1'），刷新不丢。
 * ============================================================================
 */
import { reactive, computed } from 'vue'
import { addCoins, useGamification, changeWeight } from '@/core/gamification'

const STORAGE_KEY = 'fenti-shop-v1'

/** 商品目录（新增商品 = 往数组里加一个对象，界面自动出现） */
export const SHOP_ITEMS = [
  {
    id: 'shield-card', icon: '🛡️', name: '免增重卡', price: 5,
    desc: '今天有任务没完成也不增重，当日有效',
    effect: 'shield'
  },
  {
    id: 'feed-star', icon: '🍙', name: '海星投喂', price: 12,
    desc: '投喂粉蹄一根海草，立刻减重 1 斤',
    effect: 'feed'
  },
  {
    id: 'lucky-buff', icon: '🍀', name: '幸运 buff 签', price: 8,
    desc: '解锁 6 条考前幸运 buff 文案，生成壁纸时可选用',
    effect: 'buff'
  },
  {
    id: 'theme-starry', icon: '🌌', name: '星空粉主题', price: 15,
    desc: '解锁壁纸生成器的限定「星空粉」配色',
    effect: 'theme'
  }
]

/** 商店仓库（响应式） */
const store = reactive({
  owned: {},        // { 商品id: 购买次数 }
  shieldDate: ''    // 免增重卡生效的日期（当日有效）
})

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ owned: store.owned, shieldDate: store.shieldDate }))
  } catch (error) {
    console.error('[shop] 商店存档失败：', error)
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      store.owned = data.owned || {}
      store.shieldDate = data.shieldDate || ''
    }
  } catch (error) {
    console.error('[shop] 读取商店存档失败：', error)
  }
}

load()

/**
 * 购买商品。
 * @param {string} itemId SHOP_ITEMS 里的商品 id
 * @returns {{ ok: boolean, reason?: string, message: string }}
 */
export function purchase(itemId) {
  const item = SHOP_ITEMS.find((i) => i.id === itemId)
  if (!item) return { ok: false, reason: 'not-found', message: '没有这个商品哦' }

  const game = useGamification()
  if (game.coins < item.price) {
    return { ok: false, reason: 'no-coins', message: `金币不够啦（还差 ${item.price - game.coins} 枚），去闯关赚一点再来～` }
  }

  // 扣款走游戏化统一接口（负数为消费），全站金币栏自动同步
  addCoins(-item.price, `粉蹄商店购买：${item.name}`)

  // 各商品的真实效果
  let extra = ''
  if (item.effect === 'feed') {
    changeWeight(-1, '海星投喂：粉蹄吃了海草')
    extra = '，粉蹄减重 1 斤！'
  } else if (item.effect === 'shield') {
    store.shieldDate = new Date().toLocaleDateString('sv-SE')
    extra = '，今天就算没全勤也不会增重'
  }

  store.owned[itemId] = (store.owned[itemId] || 0) + 1
  save()
  console.log(`[shop] 🛒 已购买「${item.name}」（-${item.price} 金币）`)
  return { ok: true, message: `已购入「${item.name}」${extra}` }
}

/**
 * 今日是否有免增重保护（反馈弹窗的体重联动会查询这里）。
 * 第 3 阶段的核心逻辑不需要改：它只需在"未完成 +1 斤"之前多问这一句。
 */
export function hasShieldToday() {
  return store.shieldDate === new Date().toLocaleDateString('sv-SE')
}

/** 消费掉护盾（反馈结算 +1 斤前调用一次，防止一卡保多天） */
export function consumeShield() {
  store.shieldDate = ''
  save()
}

/* ---------------- 查询（响应式） ---------------- */

export function useShop() {
  return computed(() => ({
    items: SHOP_ITEMS.map((i) => ({ ...i, ownedCount: store.owned[i.id] || 0 })),
    shieldToday: hasShieldToday()
  }))
}

/** 某商品是否已拥有（主题/buff 这类解锁型商品用） */
export function owns(itemId) {
  return (store.owned[itemId] || 0) > 0
}
