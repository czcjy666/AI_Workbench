<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api, post, subscribe } from '../api'
import ApprovalCard from '../components/ApprovalCard.vue'

const jds = ref<any[]>([])
const jdId = ref<number | null>(null)
const blind = ref(true)
const resumes = ref<any[]>([])
const results = ref<any[]>([])
const screening = ref(false)
const progress = ref({ done: 0, total: 0 })
const filter = ref<'all' | 'pending' | 'approved' | 'rejected'>('pending')

let unsub: (() => void) | null = null

async function load() {
  const [jdList, rList] = await Promise.all([api('/api/jds'), api('/api/resumes')])
  jds.value = jdList
  if (!jdId.value && jdList.length) jdId.value = jdList[0].id
  resumes.value = rList
  await loadResults()
}

async function loadResults() {
  if (!jdId.value) return
  results.value = await api(`/api/screening?jdId=${jdId.value}`)
}

async function seed() {
  screening.value = true
  try { await post('/api/resumes/seed', {}) } finally { screening.value = false }
  await load()
}

async function start() {
  if (!jdId.value) return
  screening.value = true
  progress.value = { done: 0, total: resumes.value.length || 50 }
  await post('/api/screening/start', { jdId: jdId.value, blind: blind.value })
}

const stats = computed(() => ({
  total: results.value.length,
  pending: results.value.filter(r => r.status === 'pending').length,
  approved: results.value.filter(r => r.status === 'approved').length,
  rejected: results.value.filter(r => r.status === 'rejected').length,
}))

const shown = computed(() =>
  filter.value === 'all' ? results.value : results.value.filter(r => r.status === filter.value)
)

const lowRiskPending = computed(() =>
  results.value.filter(r =>
    r.status === 'pending'
    && (r.score ?? 0) >= 75
    && (r.card?.hardChecks ?? [{ result: 'unclear' }]).every((h: any) => h.result === 'pass')
  )
)

async function batchApproveLowRisk() {
  for (const r of lowRiskPending.value) {
    await post(`/api/approvals/${r.approval_id}/decide`, { verdict: 'approved' }).catch(() => {})
  }
  await loadResults()
}

function exportCsv() {
  window.open(`/api/screening/export?jdId=${jdId.value}`)
}

function scoreTone(score: number) {
  if (score >= 75) return 'ok'
  if (score >= 55) return 'warn'
  return 'danger'
}

onMounted(async () => {
  await load()
  unsub = subscribe(evt => {
    if (evt.type === 'screening:progress') {
      progress.value = evt.payload
    } else if (evt.type === 'screening:done') {
      screening.value = false
      loadResults()
    } else if (evt.type === 'approval:decided' && evt.payload?.refType === 'screening') {
      loadResults()
    }
  })
})

onBeforeUnmount(() => unsub?.())
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>简历初筛</h1>
    </div>

    <div class="toolbar card">
      <select v-model="jdId" class="input jd-select">
        <option v-for="j in jds" :key="j.id" :value="j.id">{{ j.title }}（{{ j.dept }}）</option>
      </select>
      <label class="blind-toggle">
        <input type="checkbox" v-model="blind" />
        盲筛（隐去姓名/性别/年龄）
      </label>
      <div class="spacer"></div>
      <button class="btn" :disabled="screening" @click="seed">载入演示简历库</button>
      <button class="btn btn-primary" :disabled="screening || !resumes.length" @click="start">
        {{ screening ? `AI初筛中 ${progress.done}/${progress.total}` : '开始AI初筛' }}
      </button>
      <button class="btn" :disabled="!stats.approved" @click="exportCsv">导出入围名单</button>
    </div>

    <div v-if="screening" class="progress card">
      <div class="progress-bar" :style="{ width: (progress.total ? (progress.done / progress.total) * 100 : 0) + '%' }"></div>
    </div>

    <div v-if="results.length" class="statbar">
      <span>共 {{ stats.total }}</span>
      <span class="dot warn"></span><span>待审 {{ stats.pending }}</span>
      <span class="dot ok"></span><span>通过 {{ stats.approved }}</span>
      <span class="dot danger"></span><span>驳回 {{ stats.rejected }}</span>
      <div class="spacer"></div>
      <template v-if="filter !== 'all'">
        <button v-for="f in (['all','pending','approved','rejected'] as const)" :key="f" class="chip" :class="{ on: filter===f }" @click="filter=f">
          {{ {all:'全部',pending:'待审',approved:'已通过',rejected:'已驳回'}[f] }}
        </button>
      </template>
      <button v-if="lowRiskPending.length" class="btn" @click="batchApproveLowRisk">
        一键通过 {{ lowRiskPending.length }} 份高分候选（≥75分且硬性条件全过）
      </button>
    </div>

    <div v-if="!results.length && !screening" class="empty card">
      <h2>开始初筛</h2>
      <p class="muted small">载入简历库 → 选择JD → 开始AI初筛</p>
    </div>

    <div class="grid">
      <div v-for="r in shown" :key="r.id" class="cand">
        <ApprovalCard
          :approval="{
            id: r.approval_id,
            scenario: 'resume',
            title: `候选人#${r.resume_id} · ${r.score}分${r.blind ? ' · 盲筛' : ''}`,
            card: r.card,
            status: r.approval_status || r.status,
            decided_by: r.decided_by,
            decided_at: r.decided_at,
            reject_reasons: r.reject_reasons,
          }"
          @decided="loadResults()"
        >
          <div class="cand-body">
            <div class="cand-top">
              <div class="score" :class="scoreTone(r.score)">{{ r.score }}</div>
              <div class="cand-summary">{{ r.card?.summary }}</div>
            </div>

            <div v-if="r.card?.hardChecks?.length" class="checks">
              <span v-for="h in r.card.hardChecks" :key="h.req" class="check" :class="h.result">
                {{ ({ pass: '✓', fail: '✕', unclear: '?' } as Record<string, string>)[h.result] ?? '?' }} {{ h.req }}
              </span>
            </div>

            <div v-if="r.card?.matches?.length" class="sec">
              <h4>匹配点</h4>
              <div v-for="(m, i) in r.card.matches" :key="i" class="ev">
                <span class="ev-p">{{ m.point }}</span>
                <span class="ev-e">"{{ m.evidence }}"</span>
              </div>
            </div>

            <div v-if="r.card?.risks?.length" class="sec">
              <h4>风险点</h4>
              <div v-for="(m, i) in r.card.risks" :key="i" class="ev risk">
                <span class="ev-p">{{ m.point }}</span>
                <span class="ev-e">"{{ m.evidence }}"</span>
                <span v-if="m.question" class="ev-q">面试追问：{{ m.question }}</span>
              </div>
            </div>

            <div v-if="r.card?.questions?.length" class="sec">
              <h4>建议面试问题</h4>
              <ol class="qs"><li v-for="(qq, i) in r.card.questions" :key="i">{{ qq }}</li></ol>
            </div>
          </div>
        </ApprovalCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 12px; padding: 12px 14px; margin-bottom: 14px; flex-wrap: wrap; }
.jd-select { min-width: 220px; }
.spacer { flex: 1; }
.blind-toggle { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--text); cursor: pointer; }

.progress { height: 6px; padding: 0; overflow: hidden; margin-bottom: 14px; }
.progress-bar { height: 100%; background: var(--accent); transition: width 0.5s; }

.statbar { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); margin-bottom: 14px; flex-wrap: wrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.warn { background: var(--warn); } .dot.ok { background: var(--ok); } .dot.danger { background: var(--danger); }
.chip { border: 1px solid var(--border-strong); background: var(--surface); border-radius: 99px; padding: 3px 12px; font-size: 12px; cursor: pointer; font-family: var(--sans); }
.chip.on { background: var(--accent-soft); color: var(--accent-strong); border-color: var(--accent); font-weight: 600; }

.empty { padding: 70px; text-align: center; }
.empty p { margin-top: 8px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; }

.cand-body { display: flex; flex-direction: column; gap: 10px; }
.cand-top { display: flex; gap: 14px; align-items: center; }
.score { width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 17px; flex-shrink: 0; font-family: var(--serif); }
.score.ok { background: var(--ok-soft); color: var(--ok); }
.score.warn { background: var(--warn-soft); color: var(--warn); }
.score.danger { background: var(--danger-soft); color: var(--danger); }
.cand-summary { font-size: 13.5px; line-height: 1.6; color: var(--text-strong); }

.checks { display: flex; flex-wrap: wrap; gap: 6px; }
.check { font-size: 11.5px; padding: 2px 9px; border-radius: 99px; border: 1px solid var(--border); }
.check.pass { color: var(--ok); border-color: color-mix(in srgb, var(--ok) 40%, var(--border)); background: var(--ok-soft); }
.check.fail { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, var(--border)); background: var(--danger-soft); }
.check.unclear { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, var(--border)); background: var(--warn-soft); }

.sec h4 { margin: 0 0 5px; font-size: 12px; color: var(--muted); font-weight: 600; letter-spacing: 0.5px; }
.ev { display: flex; flex-direction: column; gap: 2px; padding: 6px 10px; background: var(--surface-2); border-radius: 8px; margin-bottom: 5px; }
.ev.risk { background: var(--danger-soft); }
.ev-p { font-size: 13px; font-weight: 600; color: var(--text-strong); }
.ev-e { font-size: 12.3px; color: var(--muted); font-style: italic; }
.ev-q { font-size: 12.3px; color: var(--accent-strong); }
.qs { margin: 0; padding-left: 18px; font-size: 12.8px; color: var(--text); }
.qs li { margin: 2px 0; }
</style>
