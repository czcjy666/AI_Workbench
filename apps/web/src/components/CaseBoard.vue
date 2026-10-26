<script setup lang="ts">
// 通用场景看板：导入→AI分析→审批卡网格，8个新场景共用
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api, post, subscribe } from '../api'
import ApprovalCard from './ApprovalCard.vue'
import ThinkStream from './ThinkStream.vue'

const props = defineProps<{
  scenario: string
  itemName: string            // 如 "份合同"
  importLabel?: string        // 导入按钮文案
  analyzeLabel?: string       // 分析按钮文案
  batchFilter?: (c: any) => boolean
  batchLabel?: string
  gridMin?: number            // 卡片最小宽度
}>()

const cases = ref<any[]>([])
const loading = ref(false)
const analyzing = ref(false)
const progress = ref({ done: 0, total: 0 })
const filter = ref<'all' | 'pending' | 'approved' | 'rejected' | 'unanalyzed'>('all')
// 并发推理流：按 caseNo 各自累积，只展示仍在思考的
const thinkByTag = ref<Record<string, { text: string; done: boolean }>>({})
const activeThink = computed(() =>
  Object.entries(thinkByTag.value)
    .filter(([, t]) => !t.done && t.text)
    .map(([tag, t]) => ({ tag, ...t }))
)

let unsub: (() => void) | null = null

async function load() {
  cases.value = await api(`/api/${props.scenario}/cases`)
}

async function importData() {
  loading.value = true
  try { await post(`/api/${props.scenario}/import`, {}) } finally { loading.value = false }
  await load()
}

async function analyze() {
  analyzing.value = true
  thinkByTag.value = {}
  progress.value = { done: 0, total: cases.value.filter(c => c.status === 'pending' && !c.analysis).length }
  await post(`/api/${props.scenario}/analyze`, {})
}

async function batchApprove() {
  const targets = cases.value.filter(c => c.approval_status === 'pending' && props.batchFilter?.(c))
  for (const t of targets) {
    await post(`/api/approvals/${t.approval_id}/decide`, { verdict: 'approved' }).catch(() => {})
  }
  await load()
}

const stats = computed(() => ({
  total: cases.value.length,
  unanalyzed: cases.value.filter(c => c.status === 'pending' && !c.approval_id).length,
  pending: cases.value.filter(c => c.approval_status === 'pending').length,
  approved: cases.value.filter(c => c.approval_status === 'approved').length,
  rejected: cases.value.filter(c => c.approval_status === 'rejected').length,
}))

const shown = computed(() => {
  if (filter.value === 'all') return cases.value
  if (filter.value === 'unanalyzed') return cases.value.filter(c => c.status === 'pending' && !c.approval_id)
  return cases.value.filter(c => c.approval_status === filter.value)
})

const batchTargets = computed(() =>
  props.batchFilter ? cases.value.filter(c => c.approval_status === 'pending' && props.batchFilter!(c)) : []
)

onMounted(async () => {
  await load()
  unsub = subscribe(evt => {
    if (evt.type === 'reasoning' && evt.payload?.scenario === props.scenario) {
      const tag = evt.payload.tag ?? '?'
      const cur = thinkByTag.value[tag] ?? { text: '', done: false }
      thinkByTag.value = {
        ...thinkByTag.value,
        [tag]: { text: cur.text + (evt.payload.text ?? ''), done: !!evt.payload.done },
      }
    }
    else if (evt.type === 'biz:progress' && evt.payload?.scenario === props.scenario) progress.value = evt.payload
    else if (evt.type === 'biz:done' && evt.payload?.scenario === props.scenario) { analyzing.value = false; load() }
    else if (evt.type === 'approval:decided' && evt.payload?.refType === 'biz_case') load()
  })
})
onBeforeUnmount(() => unsub?.())
</script>

<template>
  <div class="board">
    <div class="toolbar card">
      <button class="btn" :disabled="loading" @click="importData">{{ loading ? '导入中…' : (importLabel ?? '载入演示数据') }}</button>
      <button class="btn btn-primary" :disabled="analyzing || !stats.unanalyzed" @click="analyze">
        {{ analyzing ? `AI分析中 ${progress.done}/${progress.total}` : (analyzeLabel ?? `开始AI分析（${stats.unanalyzed} ${itemName}）`) }}
      </button>
      <button v-if="batchTargets.length && batchLabel" class="btn" @click="batchApprove">
        {{ batchLabel }}（{{ batchTargets.length }}）
      </button>
      <div class="spacer"></div>
      <slot name="hint" />
    </div>

    <div v-if="analyzing" class="progress card">
      <div class="progress-bar" :style="{ width: (progress.total ? (progress.done / progress.total) * 100 : 0) + '%' }"></div>
    </div>

    <ThinkStream
      v-for="t in activeThink"
      :key="t.tag"
      :text="t.text"
      :done="t.done"
      :title="`AI 思考 · ${t.tag}`"
      live
    />

    <div v-if="cases.length" class="statbar">
      <span>共 {{ stats.total }}</span>
      <template v-if="stats.unanalyzed"><span class="dot"></span><span>未分析 {{ stats.unanalyzed }}</span></template>
      <span class="dot warn"></span><span>待人审 {{ stats.pending }}</span>
      <span class="dot ok"></span><span>通过 {{ stats.approved }}</span>
      <span class="dot danger"></span><span>驳回 {{ stats.rejected }}</span>
      <div class="spacer"></div>
      <button v-for="f in (['all','unanalyzed','pending','approved','rejected'] as const)" :key="f" class="chip" :class="{ on: filter === f }" @click="filter = f">
        {{ { all: '全部', unanalyzed: '未分析', pending: '待人审', approved: '已通过', rejected: '已驳回' }[f] }}
      </button>
    </div>

    <div v-if="!cases.length && !analyzing" class="empty card">
      <slot name="empty" />
    </div>

    <div class="grid" :style="gridMin ? { gridTemplateColumns: `repeat(auto-fill, minmax(${gridMin}px, 1fr))` } : undefined">
      <div v-for="c in shown" :key="c.id" class="case-cell">
        <ApprovalCard
          v-if="c.approval_id"
          :approval="{
            id: c.approval_id,
            scenario: c.scenario,
            title: c.title,
            card: c.analysis,
            status: c.approval_status,
            decided_by: c.decided_by,
            decided_at: c.decided_at,
            reject_reasons: null,
          }"
          @decided="load()"
        >
          <slot name="body" :c="c" />
        </ApprovalCard>
        <div v-else class="raw-card card">
          <div class="raw-head">{{ c.title }}</div>
          <slot name="raw" :c="c" />
          <div class="small muted raw-wait">未分析</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 12px; padding: 12px 14px; margin-bottom: 14px; align-items: center; flex-wrap: wrap; }
.spacer { flex: 1; }
.progress { height: 6px; padding: 0; overflow: hidden; margin-bottom: 14px; }
.progress-bar { height: 100%; background: var(--accent); transition: width 0.5s; }
.statbar { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--muted); margin-bottom: 14px; flex-wrap: wrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; background: var(--muted); opacity: .5; }
.dot.warn { background: var(--warn); opacity: 1; } .dot.ok { background: var(--ok); opacity: 1; } .dot.danger { background: var(--danger); opacity: 1; }
.chip { border: 1px solid var(--border-strong); background: var(--surface); border-radius: 99px; padding: 3px 12px; font-size: 12px; cursor: pointer; font-family: var(--sans); }
.chip.on { background: var(--accent-soft); color: var(--accent-strong); border-color: var(--accent); font-weight: 600; }
.empty { padding: 70px; text-align: center; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 14px; align-items: start; }
.raw-card { padding: 12px 14px; font-size: 13px; }
.raw-head { font-weight: 600; color: var(--text-strong); margin-bottom: 6px; }
.raw-wait { margin-top: 8px; }
</style>
