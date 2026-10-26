<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { api, post, subscribe } from '../api'
import ApprovalCard from '../components/ApprovalCard.vue'
import StatusBadge from '../components/StatusBadge.vue'
import ChartBox from '../components/ChartBox.vue'
import MdView from '../components/MdView.vue'

interface QueryRow {
  id: number
  question: string
  sql_text?: string
  interpretation?: string
  status: string
  rows_returned?: number
  duration_ms?: number
  chart?: { spec: { type: string; x?: string; y?: string } | null; columns: string[]; rows: any[]; total?: number } | null
  reject_reasons?: string[] | null
  created_at: string
}

const queries = ref<QueryRow[]>([])
const metrics = ref<any[]>([])
const active = ref<QueryRow | null>(null)
const activeApproval = ref<any>(null)
const activeMessages = ref<any[]>([])
const question = ref('')
const busy = ref(false)

let pollTimer: ReturnType<typeof setInterval> | null = null
let unsub: (() => void) | null = null

const TOOL_LABELS: Record<string, string> = {
  business_get_schema: '查询表结构与指标口径',
  business_submit_proposal: '生成SQL · 提交审批',
  business_run_sql: '执行已批准的SQL',
  business_get_approval: '核对审批结果',
}

const toolSteps = computed(() => {
  const steps: { tool: string; label: string }[] = []
  for (const m of activeMessages.value || []) {
    if (m.role !== 'assistant') continue
    for (const p of m.parts || []) {
      if (p.type === 'tool' && p.tool && !steps.some(s => s.tool === p.tool + (p as any).state)) {
        steps.push({ tool: p.tool, label: TOOL_LABELS[p.tool] ?? p.tool })
      }
    }
  }
  return steps
})

const finalAnswer = computed(() => {
  const msgs = activeMessages.value || []
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role !== 'assistant') continue
    const texts = (msgs[i].parts || []).filter((p: any) => p.type === 'text' && p.text?.trim()).map((p: any) => p.text)
    if (texts.length) return texts.join('\n\n')
  }
  return ''
})

async function loadQueries() {
  queries.value = await api('/api/queries')
}

async function loadDetail(id: number) {
  const d = await api<QueryRow>(`/api/queries/${id}`)
  active.value = d
  activeApproval.value = (d as any).approval
  activeMessages.value = (d as any).messages || []
}

async function openQuery(q: QueryRow) {
  await loadDetail(q.id)
  ensurePoll()
}

async function ask() {
  const text = question.value.trim()
  if (!text || busy.value) return
  busy.value = true
  question.value = ''
  try {
    const r = await post<{ queryId: number }>('/api/ask', { question: text })
    await loadQueries()
    await loadDetail(r.queryId)
    ensurePoll()
  } finally {
    busy.value = false
  }
}

function ensurePoll() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    const q = active.value
    if (!q) return
    // 活动态才轮询：分析/待审/已批准待执行/驳回后修改中
    if (!['drafting', 'proposing', 'approved', 'rejected'].includes(q.status)) return
    try { await loadDetail(q.id); await loadQueries() } catch {}
  }, 3000)
}

onMounted(async () => {
  await Promise.all([
    loadQueries(),
    api('/api/metrics').then(m => (metrics.value = m.metrics)),
  ])
  if (queries.value.length) await openQuery(queries.value[0])
  unsub = subscribe(evt => {
    if (evt.type === 'query:update' || evt.type === 'approval:decided') {
      loadQueries().catch(() => {})
      if (active.value && (!evt.payload?.queryId || evt.payload.queryId === active.value.id)) {
        loadDetail(active.value.id).catch(() => {})
      }
    }
  })
  ensurePoll()
})

onBeforeUnmount(() => {
  unsub?.()
  if (pollTimer) clearInterval(pollTimer)
})
</script>

<template>
  <div class="page ask-page">
    <div class="ask-main">
      <div class="feed">
        <!-- 查询时间线 -->
        <div v-if="active" class="q-block card">
          <div class="q-head">
            <div class="q-user">
              <span class="q-avatar">你</span>
              <span class="q-text">{{ active.question }}</span>
            </div>
            <StatusBadge :status="active.status" />
          </div>

          <div class="q-timeline">
            <!-- 工具步骤 -->
            <div v-for="(s, i) in toolSteps" :key="i" class="step">
              <span class="step-dot"></span>{{ s.label }}
            </div>
            <div v-if="['drafting'].includes(active.status)" class="step working">
              <span class="spin"></span>AI 正在分析问题、核对指标口径…
            </div>
            <div v-if="active.status === 'approved'" class="step working">
              <span class="spin"></span>SQL 已批准，正在执行…
            </div>

            <!-- 审批卡 -->
            <div v-if="activeApproval" class="q-approval">
              <ApprovalCard :key="activeApproval.id" :approval="activeApproval" @decided="loadDetail(active!.id); loadQueries()">
                <div class="ap-interpretation">"{{ activeApproval.card?.interpretation }}"</div>
                <pre class="sql-block">{{ activeApproval.card?.sql }}</pre>
              </ApprovalCard>
            </div>

            <!-- 驳回后修改中 -->
            <div v-if="active.status === 'rejected'" class="step working">
              <span class="spin"></span>已驳回（{{ (active.reject_reasons || []).join('；') }}），AI 正在修改…
            </div>

            <!-- 执行结果 -->
            <template v-if="active.status === 'executed'">
              <div class="chart-wrap card" v-if="active.chart?.rows?.length">
                <ChartBox :spec="active.chart.spec" :columns="active.chart.columns" :rows="active.chart.rows" />
              </div>
              <div class="md-answer">
                <MdView v-if="finalAnswer" :text="finalAnswer" />
              </div>
              <div class="q-meta small muted">{{ active.rows_returned }} 行 · {{ active.duration_ms }}ms · 已沉淀进示例库</div>
            </template>
            <div v-else-if="active.status === 'failed'" class="fail-banner">执行失败，可重新提问</div>
          </div>
        </div>

        <div v-else class="empty card">
          <h2>问点什么</h2>
          <p class="muted small">"上个月华南区销量Top5的商品" · "今年618和去年双十一GMV对比" · "各会员等级的客单价"</p>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="ask-input card">
        <textarea
          v-model="question"
          class="input ask-textarea"
          rows="2"
          placeholder="用业务语言提问…（Enter 发送）"
          @keydown.enter.exact.prevent="ask"
        ></textarea>
        <button class="btn btn-primary" :disabled="!question.trim() || busy" @click="ask">
          {{ busy ? '提交中…' : '提问' }}
        </button>
      </div>
    </div>

    <!-- 右栏：指标字典 + 历史 -->
    <aside class="ask-side">
      <div class="card dict">
        <h3>指标口径字典</h3>
        <details v-for="m in metrics" :key="m.name" class="dict-item">
          <summary>{{ m.name }}</summary>
          <p class="small">{{ m.definition }}</p>
          <p class="small muted">{{ m.formula }}</p>
          <p v-for="p in m.pitfalls" :key="p" class="small pitfall">· {{ p }}</p>
        </details>
      </div>
      <div class="card history">
        <h3>历史提问</h3>
        <button v-for="q in queries" :key="q.id" class="hist-item" :class="{ on: active?.id === q.id }" @click="openQuery(q)">
          <span class="hist-q">{{ q.question }}</span>
          <StatusBadge :status="q.status" />
        </button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.ask-page { display: flex; gap: 20px; align-items: flex-start; }
.ask-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.feed { display: flex; flex-direction: column; gap: 14px; }

.q-block { padding: 16px 18px; }
.q-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.q-user { display: flex; gap: 10px; align-items: baseline; min-width: 0; }
.q-avatar { font-size: 11px; font-weight: 700; color: var(--muted); flex-shrink: 0; }
.q-text { font-weight: 600; font-size: 15px; color: var(--text-strong); font-family: var(--serif); }

.q-timeline { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; padding-left: 4px; }

.step { display: flex; align-items: center; gap: 9px; font-size: 12.8px; color: var(--muted); }
.step-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); opacity: 0.7; flex-shrink: 0; }
.step.working { color: var(--text); }

.q-approval { margin: 4px 0; }
.ap-interpretation { font-size: 14px; font-family: var(--serif); color: var(--text-strong); margin-bottom: 10px; line-height: 1.6; }

.chart-wrap { padding: 10px 8px; }
.md-answer { margin-top: 4px; }
.q-meta { margin-top: 2px; }
.fail-banner { color: var(--danger); font-size: 13px; background: var(--danger-soft); padding: 8px 12px; border-radius: 8px; }

.empty { padding: 60px 30px; text-align: center; }
.empty p { margin-top: 10px; line-height: 1.9; }

.ask-input { display: flex; gap: 10px; padding: 12px; align-items: flex-end; position: sticky; bottom: 14px; }
.ask-textarea { flex: 1; resize: none; }

.ask-side { width: 280px; flex-shrink: 0; display: flex; flex-direction: column; gap: 14px; position: sticky; top: 20px; }
.dict, .history { padding: 14px; }
.dict h3, .history h3 { margin-bottom: 8px; }
.dict-item summary { font-size: 13px; font-weight: 600; cursor: pointer; padding: 5px 0; color: var(--text-strong); }
.dict-item { border-bottom: 1px dashed var(--border); }
.dict-item p { margin: 3px 0; }
.pitfall { color: var(--warn); }

.history { max-height: 360px; overflow-y: auto; }
.hist-item { display: flex; width: 100%; gap: 8px; align-items: center; justify-content: space-between; padding: 7px 8px; border: none; background: none; border-radius: 8px; cursor: pointer; text-align: left; font-family: var(--sans); }
.hist-item:hover { background: var(--surface-2); }
.hist-item.on { background: var(--accent-soft); }
.hist-q { font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
</style>
