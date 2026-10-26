<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { api, post, subscribe } from '../api'
import ApprovalCard from '../components/ApprovalCard.vue'
import ThinkStream from '../components/ThinkStream.vue'

const question = ref('')
const busy = ref(false)
const history = ref<any[]>([])
const activeCase = ref<any>(null)
const reasoningText = ref('')
const reasoningDone = ref(true)

let unsub: (() => void) | null = null

async function load() {
  history.value = await api('/api/ctp/cases')
}

async function ask() {
  const q = question.value.trim()
  if (!q || busy.value) return
  busy.value = true
  question.value = ''
  activeCase.value = null
  reasoningText.value = ''
  reasoningDone.value = false
  try {
    const r = await post<{ caseId: number }>('/api/ctp/ask', { question: q })
    await load()
    await openCase(r.caseId)
  } catch (e) {
    alert('分析失败：' + (e as Error).message)
  } finally {
    busy.value = false
    reasoningDone.value = true
  }
}

async function openCase(id: number) {
  const row = history.value.find(h => h.id === id)
  if (row) {
    const ap = await api('/api/approvals?scenario=ctp')
    activeCase.value = { ...row, approval: ap.find((a: any) => a.ref_id === id) ?? null }
  }
}

const ANSWER: Record<string, { label: string; cls: string }> = {
  can: { label: '✓ 可以承诺', cls: 'ok' },
  conditional: { label: '⚠ 有条件可承诺', cls: 'warn' },
  cannot: { label: '✕ 无法承诺', cls: 'danger' },
}

onMounted(async () => {
  await load()
  if (history.value.length) await openCase(history.value[0].id)
  unsub = subscribe(evt => {
    if (evt.type === 'reasoning' && evt.payload?.scenario === 'ctp') {
      if (evt.payload.text) reasoningText.value += evt.payload.text
      if (evt.payload.done) reasoningDone.value = true
    }
    if (evt.type === 'approval:decided' && evt.payload?.refType === 'biz_case') {
      load().then(() => { if (activeCase.value) openCase(activeCase.value.id) })
    }
  })
})
onBeforeUnmount(() => unsub?.())
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>交期应答</h1>
    </div>

    <div class="ctp-layout">
      <div class="ctp-main">
        <ThinkStream v-if="reasoningText" :text="reasoningText" :done="reasoningDone" live />

        <div v-if="activeCase" class="q-block card">
          <div class="q-user"><span class="q-avatar">销售</span><span class="q-text">{{ activeCase.payload?.question }}</span></div>
          <div v-if="activeCase.analysis" class="answer">
            <ApprovalCard
              v-if="activeCase.approval"
              :approval="{ id: activeCase.approval.id, scenario: 'ctp', title: activeCase.title, card: activeCase.analysis,
                status: activeCase.approval.status, decided_by: activeCase.approval.decided_by, decided_at: activeCase.approval.decided_at, reject_reasons: null }"
              @decided="load().then(() => openCase(activeCase!.id))"
            >
              <div class="ans">
                <span class="badge" :class="ANSWER[activeCase.analysis.answer]?.cls">{{ ANSWER[activeCase.analysis.answer]?.label ?? activeCase.analysis.answer }}</span>
                <p class="expl">{{ activeCase.analysis.explanation }}</p>
                <div v-for="(p, i) in (activeCase.analysis.plans || [])" :key="i" class="plan" :class="{ rec: p.plan === activeCase.analysis.recommendedPlan }">
                  <div class="p-head">
                    <b>{{ p.plan }}</b>
                    <span v-if="p.plan === activeCase.analysis.recommendedPlan" class="chip2 rec-chip">AI推荐</span>
                    <span class="chip2 dl">承诺交期：{{ p.deadline }}</span>
                  </div>
                  <div class="small">{{ p.detail }}</div>
                  <div class="small muted">代价：{{ p.cost }}<template v-if="p.tradeoff"> ｜ 取舍：{{ p.tradeoff }}</template></div>
                </div>
                <div v-for="(g, i) in (activeCase.analysis.gaps || [])" :key="i" class="gap">⚠ {{ g }}</div>
              </div>
            </ApprovalCard>
          </div>
        </div>
        <div v-else-if="!busy" class="empty card">
          <h2>问一个交期</h2>
          <p class="muted small">"5000件A产品11月15号能交吗？" · "客户催得急，2000件11月5号前必须要"</p>
        </div>

        <div class="ask-input card">
          <textarea v-model="question" class="input" rows="2" placeholder="输入交期问题…（Enter发送）" @keydown.enter.exact.prevent="ask"></textarea>
          <button class="btn btn-primary" :disabled="!question.trim() || busy" @click="ask">{{ busy ? '核算中…' : '提问' }}</button>
        </div>
      </div>

      <aside class="ctp-side card">
        <h3>产能与物料</h3>
        <div class="small muted">A线 800件/日 · B线 500件/日<br />标准周期12天 ｜ 紧急7天(需审批)<br />主控芯片现货仅850颗<br />11-08到货2000颗</div>
        <h3 style="margin-top:14px">历史应答</h3>
        <button v-for="h in history" :key="h.id" class="hist-item" :class="{ on: activeCase?.id === h.id }" @click="openCase(h.id)">
          <span class="hist-q">{{ h.payload?.question }}</span>
        </button>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ctp-layout { display: flex; gap: 20px; align-items: flex-start; }
.ctp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.q-block { padding: 16px 18px; }
.q-user { display: flex; gap: 10px; align-items: baseline; }
.q-avatar { font-size: 11px; font-weight: 700; color: var(--muted); }
.q-text { font-weight: 600; font-size: 15px; color: var(--text-strong); font-family: var(--serif); }
.answer { margin-top: 14px; }
.ans { display: flex; flex-direction: column; gap: 10px; }
.expl { margin: 0; font-size: 13.5px; line-height: 1.7; }
.plan { border: 1px solid var(--border); border-radius: 10px; padding: 9px 12px; display: flex; flex-direction: column; gap: 3px; }
.plan.rec { border-color: var(--accent); background: var(--accent-soft); }
.p-head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.chip2 { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 99px; }
.rec-chip { color: #fff; background: var(--accent); }
.dl { color: var(--accent-strong); background: var(--accent-soft); }
.gap { font-size: 12.8px; color: var(--warn); background: var(--warn-soft); border-radius: 8px; padding: 6px 10px; }
.ask-input { display: flex; gap: 10px; padding: 12px; align-items: flex-end; }
.ask-input .input { flex: 1; resize: none; }
.ctp-side { width: 260px; flex-shrink: 0; padding: 14px; position: sticky; top: 20px; }
.ctp-side h3 { margin-bottom: 8px; }
.hist-item { display: block; width: 100%; text-align: left; padding: 6px 8px; border: none; background: none; border-radius: 8px; cursor: pointer; font-family: var(--sans); }
.hist-item:hover { background: var(--surface-2); }
.hist-item.on { background: var(--accent-soft); }
.hist-q { font-size: 12.5px; color: var(--text); }
.empty { padding: 60px 30px; text-align: center; }
.empty p { margin-top: 10px; line-height: 1.9; }
</style>
