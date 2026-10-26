<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api, post, subscribe } from '../api'
import ApprovalCard from '../components/ApprovalCard.vue'
import StatusBadge from '../components/StatusBadge.vue'

const cases = ref<any[]>([])
const loading = ref(false)
const analyzing = ref(false)
const progress = ref({ done: 0, total: 0 })
const filter = ref<'all' | 'auto_passed' | 'proposing' | 'decided'>('all')

let unsub: (() => void) | null = null

async function load() {
  cases.value = await api('/api/match/cases')
}

async function importCases() {
  loading.value = true
  try { await post('/api/match/import', {}) } finally { loading.value = false }
  await load()
}

async function analyze() {
  analyzing.value = true
  progress.value = { done: 0, total: cases.value.filter(c => c.status === 'pending').length }
  await post('/api/match/analyze', {})
}

const stats = computed(() => ({
  total: cases.value.length,
  auto: cases.value.filter(c => c.status === 'auto_passed').length,
  pending: cases.value.filter(c => c.status === 'pending').length,
  proposing: cases.value.filter(c => c.status === 'proposing').length,
  done: cases.value.filter(c => ['approved', 'rejected'].includes(c.status)).length,
}))

const shown = computed(() => {
  if (filter.value === 'all') return cases.value
  if (filter.value === 'auto_passed') return cases.value.filter(c => c.status === 'auto_passed')
  if (filter.value === 'proposing') return cases.value.filter(c => c.status === 'proposing' || c.status === 'pending')
  return cases.value.filter(c => ['approved', 'rejected'].includes(c.status))
})

const DISP_NAMES: Record<string, string> = {
  auto_pass: '自动通过', exempt: '豁免入账', reject_invoice: '退回换开', hold: '暂挂等待', adjust: '调整重匹',
}
const CASE_STATUS: Record<string, string> = {
  auto_passed: 'auto_passed', pending: 'proposing', proposing: 'proposing', approved: 'executed', rejected: 'rejected',
}

onMounted(async () => {
  await load()
  unsub = subscribe(evt => {
    if (evt.type === 'match:progress') progress.value = evt.payload
    else if (evt.type === 'match:done') { analyzing.value = false; load() }
    else if (evt.type === 'approval:decided' && evt.payload?.refType === 'match_case') load()
  })
})
onBeforeUnmount(() => unsub?.())
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>三单匹配</h1>
    </div>

    <div class="toolbar card">
      <button class="btn" :disabled="loading" @click="importCases">{{ loading ? '导入中…' : '导入演示数据（20组）' }}</button>
      <button class="btn btn-primary" :disabled="analyzing || !stats.pending" @click="analyze">
        {{ analyzing ? `AI归因中 ${progress.done}/${progress.total}` : `AI差异归因（${stats.pending}组）` }}
      </button>
      <div class="spacer"></div>
      <span class="small muted">一致自动过 · 差异转人工</span>
    </div>

    <div v-if="cases.length" class="statbar">
      <span>共 {{ stats.total }}</span>
      <span class="dot info"></span><span>自动通过 {{ stats.auto }}</span>
      <span class="dot warn"></span><span>待人审 {{ stats.proposing }}</span>
      <span class="dot ok"></span><span>已处置 {{ stats.done }}</span>
      <div class="spacer"></div>
      <button v-for="f in (['all','auto_passed','proposing','decided'] as const)" :key="f" class="chip" :class="{ on: filter === f }" @click="filter = f">
        {{ { all: '全部', auto_passed: '自动通过', proposing: '差异待审', decided: '已处置' }[f] }}
      </button>
    </div>

    <div v-if="!cases.length" class="empty card">
      <h2>三单匹配</h2>
      <p class="muted small">导入演示数据 → 规则引擎匹配 → AI差异归因 → 人工裁决</p>
    </div>

    <div class="case-list">
      <div v-for="c in shown" :key="c.id" class="case card">
        <div class="case-head">
          <span class="case-no">{{ c.po?.poNo }} / {{ c.invoice?.invoiceNo }}</span>
          <span class="small muted">{{ c.po?.supplier }}</span>
          <div class="spacer"></div>
          <span v-if="c.disposition" class="badge" :class="c.status === 'auto_passed' ? 'info' : c.status === 'approved' ? 'ok' : 'warn'">
            {{ DISP_NAMES[c.disposition] ?? c.disposition }}
          </span>
          <StatusBadge :status="CASE_STATUS[c.status] ?? c.status" />
        </div>

        <!-- 三单对比表 -->
        <table class="table cmp">
          <thead>
            <tr><th>商品</th><th>PO数量</th><th>收货数量</th><th>发票数量</th><th>PO单价</th><th>发票单价</th><th>税率</th></tr>
          </thead>
          <tbody>
            <tr v-for="pi in (c.po?.items || [])" :key="pi.name">
              <td>{{ pi.name }}</td>
              <td>{{ pi.qty }}</td>
              <td :class="{ bad: (c.receipt?.items?.find((r: any) => r.name === pi.name)?.qty ?? '—') !== pi.qty }">
                {{ c.receipt?.items?.find((r: any) => r.name === pi.name)?.qty ?? '—' }}
              </td>
              <td :class="{ bad: (c.invoice?.items?.find((i: any) => i.name === pi.name)?.qty ?? '—') !== pi.qty }">
                {{ c.invoice?.items?.find((i: any) => i.name === pi.name)?.qty ?? '—' }}
              </td>
              <td>{{ pi.unitPrice }}</td>
              <td :class="{ bad: c.invoice?.items?.find((i: any) => i.name === pi.name)?.unitPrice !== pi.unitPrice }">
                {{ c.invoice?.items?.find((i: any) => i.name === pi.name)?.unitPrice ?? '—' }}
              </td>
              <td>{{ (pi.taxRate * 100).toFixed(0) }}%</td>
            </tr>
          </tbody>
        </table>

        <!-- 差异清单 -->
        <div v-if="c.diff?.length" class="diffs">
          <div v-for="(d, i) in c.diff" :key="i" class="diff-item">
            <span class="diff-type">{{ d.type }}</span>
            <span>{{ d.detail }}</span>
          </div>
        </div>
        <div v-else class="small muted ok-line">✓ 三单一致，容差内自动通过</div>

        <!-- AI处置提案 -->
        <ApprovalCard
          v-if="c.approval && c.analysis"
          :approval="{
            id: c.approval.id, scenario: 'match', title: c.approval ? `${c.po?.poNo} · 差异处置` : '',
            card: c.analysis, status: c.approval.status,
            decided_by: c.approval.decided_by, decided_at: c.approval.decided_at, reject_reasons: null,
          }"
          @decided="load()"
        >
          <div class="analysis">
            <div class="an-row"><span class="an-k">差异原因</span><span>{{ c.analysis.cause }}</span></div>
            <div class="an-row"><span class="an-k">依据</span><span class="muted">"{{ c.analysis.evidence }}"</span></div>
            <div class="an-row">
              <span class="an-k">处置建议</span>
              <span class="disp" :class="c.analysis.disposition">{{ DISP_NAMES[c.analysis.disposition] ?? c.analysis.disposition }}</span>
            </div>
            <div class="an-row"><span class="an-k">理由</span><span>{{ c.analysis.reasoning }}</span></div>
          </div>
        </ApprovalCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 12px; padding: 12px 14px; margin-bottom: 14px; align-items: center; }
.spacer { flex: 1; }
.statbar { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--muted); margin-bottom: 14px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot.info { background: var(--info); } .dot.warn { background: var(--warn); } .dot.ok { background: var(--ok); }
.chip { border: 1px solid var(--border-strong); background: var(--surface); border-radius: 99px; padding: 3px 12px; font-size: 12px; cursor: pointer; font-family: var(--sans); }
.chip.on { background: var(--accent-soft); color: var(--accent-strong); border-color: var(--accent); font-weight: 600; }
.empty { padding: 70px; text-align: center; }

.case-list { display: flex; flex-direction: column; gap: 14px; }
.case { padding: 14px 16px; }
.case-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.case-no { font-weight: 600; font-size: 13.5px; color: var(--text-strong); font-family: var(--mono); }

.cmp td.bad { color: var(--danger); font-weight: 700; background: var(--danger-soft); }

.diffs { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; }
.diff-item { display: flex; gap: 8px; align-items: baseline; font-size: 12.8px; padding: 5px 10px; background: var(--danger-soft); border-radius: 8px; }
.diff-type { font-size: 11px; font-weight: 700; color: var(--danger); flex-shrink: 0; white-space: nowrap; }
.ok-line { margin-top: 8px; color: var(--ok); }

.analysis { display: flex; flex-direction: column; gap: 7px; }
.an-row { display: flex; gap: 10px; font-size: 13px; }
.an-k { width: 62px; flex-shrink: 0; color: var(--muted); font-size: 12px; font-weight: 600; }
.disp { font-weight: 700; }
.disp.exempt { color: var(--ok); }
.disp.reject_invoice { color: var(--danger); }
.disp.hold, .disp.adjust { color: var(--warn); }
</style>
