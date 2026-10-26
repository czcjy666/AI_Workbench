<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { api, post, subscribe } from '../api'
import ApprovalCard from '../components/ApprovalCard.vue'
import StatusBadge from '../components/StatusBadge.vue'

const cases = ref<any[]>([])
const running = ref<number[]>([])

let unsub: (() => void) | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

async function load() {
  cases.value = await api('/api/gov/cases')
}

async function importCases() {
  await post('/api/gov/cases', {})
  await load()
}

async function precheck(id: number) {
  running.value.push(id)
  await post(`/api/gov/${id}/precheck`, {})
}

onMounted(async () => {
  await load()
  unsub = subscribe(evt => {
    if (evt.type === 'approval:decided' && evt.payload?.refType === 'gov_case') load()
    else if (evt.type === 'oc-event' && evt.payload?.scenario === 'gov') load()
  })
  pollTimer = setInterval(() => {
    // 预审中的案例轮询刷新
    const active = cases.value.filter(c => ['analyzing', 'proposing'].includes(c.status))
    if (active.length) load()
  }, 4000)
})
onBeforeUnmount(() => { unsub?.(); if (pollTimer) clearInterval(pollTimer) })

function statusOf(c: any): string {
  if (c.status === 'auto_passed') return 'auto_passed'
  if (c.approval?.status === 'pending') return 'proposing'
  if (c.approval?.status === 'approved') return 'approved'
  if (c.approval?.status === 'rejected') return 'rejected'
  if (c.status === 'analyzing') return 'drafting'
  return 'pending'
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>政务预审</h1>
    </div>

    <div class="toolbar card">
      <button class="btn" @click="importCases">载入演示案例（3件）</button>
      <div class="spacer"></div>
      <span class="small muted">事项：个体工商户设立登记</span>
    </div>

    <div v-if="!cases.length" class="empty card">
      <h2>政务预审</h2>
      <p class="muted small">载入案例 → AI预审 → 窗口人员复核 → 补正告知书</p>
    </div>

    <div class="case-list">
      <div v-for="c in cases" :key="c.id" class="gcase card">
        <div class="g-head">
          <div>
            <span class="g-no">{{ c.files?.caseNo }}</span>
            <span class="g-name">{{ c.applicant }}</span>
            <span class="small muted">{{ c.files?.businessType }}</span>
          </div>
          <div class="spacer"></div>
          <StatusBadge :status="statusOf(c)" />
          <button v-if="!c.approval && !['analyzing', 'proposing'].includes(c.status)" class="btn btn-primary" @click="precheck(c.id)">AI预审</button>
        </div>

        <!-- 材料清单 -->
        <div class="files">
          <div v-for="f in (c.files?.files || [])" :key="f.name" class="file-item" :class="{ miss: f.required && !f.ok && f.status === 'missing' }">
            <span class="f-icon">{{ f.required ? '必' : '选' }}</span>
            <span class="f-name">{{ f.name }}</span>
            <span v-if="f.issue" class="f-issue">{{ f.issue }}</span>
          </div>
        </div>

        <!-- 预审报告审批卡 -->
        <ApprovalCard
          v-if="c.approval && c.report"
          :approval="{
            id: c.approval.id, scenario: 'gov', title: `${c.files?.caseNo} · 预审报告`,
            card: c.report, status: c.approval.status,
            decided_by: c.approval.decided_by, decided_at: c.approval.decided_at, reject_reasons: null,
          }"
          @decided="load()"
        >
          <div class="report">
            <div class="verdict" :class="c.report.verdict">
              {{ ({ pass: '✓ 齐全合规，建议受理', need_correction: '⚠ 需补正', reject: '✕ 不予受理' } as Record<string, string>)[c.report.verdict] ?? c.report.verdict }}
            </div>

            <div v-if="c.report.completeness?.length" class="sec">
              <h4>齐套性核对</h4>
              <div v-for="it in c.report.completeness" :key="it.item" class="row">
                <span class="st" :class="it.status">{{ it.status === 'ok' ? '✓' : '✕' }}</span>
                <span>{{ it.item }}</span>
                <span class="muted small">{{ it.note }}</span>
              </div>
            </div>

            <div v-if="c.report.formChecks?.length" class="sec">
              <h4>形式合规</h4>
              <div v-for="it in c.report.formChecks" :key="it.item" class="row">
                <span class="st" :class="it.status">{{ it.status === 'ok' ? '✓' : '!' }}</span>
                <span>{{ it.item }}</span>
                <span class="muted small">{{ it.note }}</span>
              </div>
            </div>

            <div v-if="c.report.consistency?.length" class="sec">
              <h4>信息一致性</h4>
              <div v-for="it in c.report.consistency" :key="it.item" class="row">
                <span class="st" :class="it.status">{{ it.status === 'ok' ? '✓' : '✕' }}</span>
                <span>{{ it.item }}</span>
                <span class="muted small">{{ it.note }}</span>
              </div>
            </div>

            <div v-if="c.report.correctionNotice" class="notice">
              <h4>补正告知书（草案）</h4>
              <pre class="notice-text">{{ c.report.correctionNotice }}</pre>
            </div>
          </div>
        </ApprovalCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 12px; padding: 12px 14px; margin-bottom: 14px; align-items: center; }
.spacer { flex: 1; }
.empty { padding: 70px; text-align: center; }
.case-list { display: flex; flex-direction: column; gap: 14px; }
.gcase { padding: 14px 16px; }
.g-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.g-no { font-family: var(--mono); font-size: 12.5px; color: var(--muted); }
.g-name { font-weight: 600; color: var(--text-strong); }

.files { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.file-item { display: flex; gap: 8px; align-items: baseline; font-size: 12.8px; padding: 4px 8px; border-radius: 6px; }
.file-item.miss { background: var(--danger-soft); }
.f-icon { font-size: 10px; border: 1px solid var(--border-strong); border-radius: 4px; padding: 0 4px; color: var(--muted); flex-shrink: 0; }
.f-name { color: var(--text); }
.f-issue { color: var(--danger); font-size: 12px; }

.report { display: flex; flex-direction: column; gap: 12px; }
.verdict { font-weight: 700; font-size: 14px; font-family: var(--serif); }
.verdict.pass { color: var(--ok); }
.verdict.need_correction { color: var(--warn); }
.verdict.reject { color: var(--danger); }

.sec h4 { margin: 0 0 4px; font-size: 12px; color: var(--muted); font-weight: 600; }
.row { display: flex; gap: 8px; align-items: baseline; font-size: 13px; padding: 2px 0; }
.st { width: 16px; flex-shrink: 0; font-weight: 700; }
.st.ok { color: var(--ok); }
.st.missing, .st.mismatch { color: var(--danger); }
.st.issue { color: var(--warn); }

.notice h4 { margin: 0 0 6px; font-size: 12px; color: var(--muted); font-weight: 600; }
.notice-text { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; font-family: var(--serif); font-size: 13.5px; line-height: 1.9; white-space: pre-wrap; margin: 0; color: var(--text-strong); }
</style>
