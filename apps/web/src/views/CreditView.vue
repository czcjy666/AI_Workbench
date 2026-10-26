<script setup lang="ts">
import CaseBoard from '../components/CaseBoard.vue'

const VERDICT: Record<string, { label: string; cls: string }> = {
  approve: { label: '建议足额授信', cls: 'ok' },
  reduce: { label: '建议降额', cls: 'warn' },
  reject: { label: '建议拒绝', cls: 'danger' },
}
const CHECK: Record<string, string> = { pass: '✓', fail: '✕', warn: '!' }
const CHECK_CLS: Record<string, string> = { pass: 'ok', fail: 'no', warn: 'wn' }
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>信贷初审</h1>
    </div>
    <CaseBoard scenario="credit" item-name="位借款人" import-label="载入申请（5位）" :grid-min="420">
      <template #empty><h2>信贷初审</h2><p class="muted small">载入借款人档案 → AI核查授信政策 → 授信建议卡待审</p></template>
      <template #body="{ c }">
        <div class="credit">
          <div class="top">
            <div class="score" :class="c.analysis.score >= 75 ? 'hi' : c.analysis.score >= 55 ? 'mid' : 'lo'">{{ c.analysis.score }}</div>
            <div class="verdict">
              <span class="badge" :class="VERDICT[c.analysis.verdict]?.cls">{{ VERDICT[c.analysis.verdict]?.label ?? c.analysis.verdict }}</span>
              <div class="amt">建议额度 <b>{{ c.analysis.suggestedAmount }}</b> 万 · 利率 {{ c.analysis.rate }}</div>
              <div class="sum">{{ c.analysis.summary }}</div>
            </div>
          </div>
          <div v-if="c.analysis.checks?.length" class="sec">
            <h4>政策核查</h4>
            <div v-for="(k, i) in c.analysis.checks" :key="i" class="row">
              <span class="st" :class="CHECK_CLS[k.result]">{{ CHECK[k.result] }}</span>
              <span class="k-item">{{ k.item }}</span>
              <span class="small muted">{{ k.evidence }}</span>
            </div>
          </div>
          <div v-if="c.analysis.riskPoints?.length" class="sec">
            <h4>疑点</h4>
            <div v-for="(k, i) in c.analysis.riskPoints" :key="i" class="risk">
              <b>{{ k.point }}</b>
              <span class="small muted">{{ k.evidence }}</span>
            </div>
          </div>
        </div>
      </template>
      <template #raw="{ c }"><div class="small muted">{{ c.payload.applicant }} · 申请{{ c.payload.appliedAmount }}万 · {{ c.payload.purpose }}</div></template>
    </CaseBoard>
  </div>
</template>

<style scoped>
.credit { display: flex; flex-direction: column; gap: 10px; }
.top { display: flex; gap: 14px; }
.score { width: 54px; height: 54px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; font-family: var(--serif); flex-shrink: 0; }
.score.hi { background: var(--ok-soft); color: var(--ok); }
.score.mid { background: var(--warn-soft); color: var(--warn); }
.score.lo { background: var(--danger-soft); color: var(--danger); }
.verdict { display: flex; flex-direction: column; gap: 3px; }
.amt { font-size: 13.5px; color: var(--text-strong); }
.sum { font-size: 12.8px; color: var(--muted); }
.sec h4 { margin: 0 0 4px; font-size: 12px; color: var(--muted); font-weight: 600; }
.row { display: flex; gap: 8px; align-items: baseline; font-size: 13px; padding: 2px 0; }
.st { width: 15px; font-weight: 700; flex-shrink: 0; }
.st.ok { color: var(--ok); } .st.no { color: var(--danger); } .st.wn { color: var(--warn); }
.k-item { font-weight: 600; }
.risk { display: flex; flex-direction: column; padding: 6px 10px; background: var(--danger-soft); border-radius: 8px; margin-bottom: 5px; font-size: 13px; }
</style>
