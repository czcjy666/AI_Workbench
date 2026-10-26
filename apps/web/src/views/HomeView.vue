<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { api, subscribe } from '../api'
import type { Stats } from '../api'
import MdView from '../components/MdView.vue'

const stats = ref<Stats | null>(null)
const profile = ref<{ markdown: string; updatedAt?: string } | null>(null)
const flash = ref(false)

let pollTimer: ReturnType<typeof setInterval> | null = null
let unsub: (() => void) | null = null

async function loadStats() {
  try {
    const s = await api<Stats>('/api/stats')
    if (stats.value && (stats.value.online !== s.online || stats.value.usage !== s.usage || stats.value.visitors !== s.visitors)) {
      flash.value = true
      setTimeout(() => (flash.value = false), 600)
    }
    stats.value = s
  } catch {}
}

onMounted(async () => {
  await Promise.all([loadStats(), api('/api/profile').then(p => (profile.value = p)).catch(() => {})])
  pollTimer = setInterval(loadStats, 5000)
  unsub = subscribe(evt => {
    if (evt.type === 'stats:update') stats.value = evt.payload
  })
})
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  unsub?.()
})

const fmt = (n?: number) => (n ?? 0).toLocaleString('zh-CN')
</script>

<template>
  <div class="page home">
    <!-- 实时统计 -->
    <section class="stats card" :class="{ flash }">
      <div class="stat">
        <div class="num">{{ fmt(stats?.visitors) }}</div>
        <div class="lbl">访问人数</div>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <div class="num online-num"><span class="live-dot"></span>{{ fmt(stats?.online) }}</div>
        <div class="lbl">在线人数</div>
      </div>
      <div class="divider"></div>
      <div class="stat">
        <div class="num">{{ fmt(stats?.usage) }}</div>
        <div class="lbl">使用功能次数</div>
      </div>
    </section>

    <!-- 个人简历 -->
    <section class="resume-wrap">
      <div class="resume-head">
        <h1>个人简历</h1>
      </div>
      <div class="resume card">
        <MdView v-if="profile" :text="profile.markdown" />
        <p v-else class="muted small">profile.md 未找到</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home { max-width: 920px; }

.stats {
  display: flex;
  align-items: stretch;
  padding: 26px 8px;
  margin-bottom: 26px;
  transition: box-shadow 0.5s;
}
.stats.flash { box-shadow: 0 0 0 3px var(--accent-soft); }

.stat { flex: 1; text-align: center; padding: 0 14px; }
.divider { width: 1px; background: var(--border); }
.num {
  font-family: var(--serif);
  font-size: 40px;
  font-weight: 600;
  color: var(--text-strong);
  line-height: 1.15;
  transition: color 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.online-num { color: var(--ok); }
.live-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 0 0 rgba(94, 140, 106, 0.5);
  animation: pulse 2s infinite;
}
@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(94, 140, 106, 0.45); }
  70% { box-shadow: 0 0 0 9px rgba(94, 140, 106, 0); }
  100% { box-shadow: 0 0 0 0 rgba(94, 140, 106, 0); }
}
.lbl { margin-top: 8px; font-size: 14px; font-weight: 600; color: var(--text); letter-spacing: 0.5px; }

.resume-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.resume { padding: 30px 38px 36px; }
.resume :deep(.md) { max-width: 100%; }
</style>
