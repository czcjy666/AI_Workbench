<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { trackVisit, trackHeartbeat } from './api'

const route = useRoute()
const activePath = computed(() => route.path)

const G = 'M4 18 L10 12 L14 15 L20 8 M20 8 h-4 m4 0 v4'

const groups = [
  {
    label: '通用', items: [
      { path: '/ask', label: '智能问数', glyph: G },
      { path: '/resume', label: '简历初筛', glyph: 'M7 4 h10 v16 l-5 -3 -5 3 z' },
      { path: '/contract', label: '合同审查', glyph: 'M6 3 h9 l3 3 v15 H6 z M9 9 h6 M9 13 h6 M9 17 h4' },
      { path: '/credit', label: '信贷初审', glyph: 'M12 3 v18 M3 12 h18 M12 3 a9 9 0 1 1 -0.01 0' },
    ],
  },
  {
    label: '互联网', items: [
      { path: '/ugc', label: '内容审核', glyph: 'M4 5 h16 v11 H9 l-5 4 z' },
      { path: '/abtest', label: 'A/B结论', glyph: 'M8 20 V10 M12 20 V4 M16 20 v-8 M4 20 h16' },
    ],
  },
  {
    label: '制造业', items: [
      { path: '/match', label: '三单匹配', glyph: 'M5 5 h5 v5 H5 z M14 5 h5 v5 h-5 z M9.5 14 h5 v5 h-5 z' },
      { path: '/ctp', label: '交期应答', glyph: 'M12 3 v3 M12 18 v3 M3 12 h3 M18 12 h3 M6 6 l2 2 M18 6 l-2 2 M12 8 a4 4 0 1 1 0 8 a4 4 0 0 1 0 -8' },
      { path: '/equipment', label: '设备维护', glyph: 'M14 6 l4 4 -8 8 H6 v-4 z M12 8 l4 4' },
    ],
  },
  {
    label: '政务', items: [
      { path: '/gov', label: '政务预审', glyph: 'M12 3 l8 3 v6 c0 5 -3.5 7.5 -8 9 -4.5 -1.5 -8 -4 -8 -9 V6 z' },
      { path: '/policy', label: '政策匹配', glyph: 'M12 2 l2.4 4.9 5.4 .8 -3.9 3.8 .9 5.4 -4.8 -2.5 -4.8 2.5 .9 -5.4 -3.9 -3.8 5.4 -.8 z' },
      { path: '/ticket', label: '12345分派', glyph: 'M4 4 h16 v12 H10 l-6 5 V4 z M8 9 h8 M8 12 h5' },
    ],
  },
]

// 匿名访问统计：进站上报 + 45秒心跳（页面不可见时暂停）
let hbTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  trackVisit()
  hbTimer = setInterval(() => {
    if (document.visibilityState === 'visible') trackHeartbeat()
  }, 45000)
  document.addEventListener('visibilitychange', onVis)
})
function onVis() { if (document.visibilityState === 'visible') trackHeartbeat() }
onBeforeUnmount(() => {
  if (hbTimer) clearInterval(hbTimer)
  document.removeEventListener('visibilitychange', onVis)
})
</script>

<template>
  <div class="shell">
    <aside class="side">
      <div class="brand">
        <span class="brand-dot"></span>
        <router-link to="/" style="color: inherit; text-decoration: none;">AI协同工作台</router-link>
      </div>

      <div class="nav-scroll">
        <router-link to="/scenarios" class="nav-item nav-scenarios" :class="{ active: activePath === '/scenarios' }">
          <svg class="nav-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4 h7 v7 H4 z M13 4 h7 v7 h-7 z M4 13 h7 v7 H4 z M13 13 h7 v7 h-7 z" />
          </svg>
          全部场景
        </router-link>
        <div v-for="g in groups" :key="g.label" class="nav-group">
          <div class="nav-group-label">{{ g.label }}</div>
          <router-link v-for="n in g.items" :key="n.path" :to="n.path" class="nav-item" :class="{ active: activePath === n.path }">
            <svg class="nav-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path :d="n.glyph" />
            </svg>
            {{ n.label }}
          </router-link>
        </div>
      </div>

      <div class="nav-foot">
        <router-link to="/audit" class="nav-item" :class="{ active: activePath === '/audit' }">
          <svg class="nav-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 4 h12 v16 H6 z M9 9 h6 M9 13 h6 M9 17 h4" />
          </svg>
          审计日志
        </router-link>
        <div class="side-foot">
          AI提案 · 人类裁决<br />
          全程留痕 · opencode 驱动
        </div>
      </div>
    </aside>
    <main class="main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
/* 三段式：品牌固定 / 导航区可滚动 / 底部固定 */
.side {
  overflow: hidden;
}
.nav-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
  scrollbar-width: thin;
}
.nav-scroll::-webkit-scrollbar { width: 7px; }
.nav-scroll::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 6px; border: 2px solid var(--surface); }
.nav-group { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
.nav-group-label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: var(--muted);
  padding: 8px 10px 4px;
  text-transform: uppercase;
}
.nav-scenarios { margin-bottom: 2px; }
.nav-foot { flex-shrink: 0; border-top: 1px solid var(--border); padding-top: 6px; }
.side-foot { margin-top: 4px; border-top: none !important; }
</style>
