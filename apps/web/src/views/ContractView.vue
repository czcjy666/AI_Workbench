<script setup lang="ts">
import CaseBoard from '../components/CaseBoard.vue'

const RESULT: Record<string, { label: string; cls: string }> = {
  pass: { label: '✓ 符合', cls: 'ok' },
  deviation: { label: '△ 偏差', cls: 'warn' },
  risk: { label: '✕ 高危', cls: 'danger' },
}
const LEVEL: Record<string, { label: string; cls: string }> = {
  low: { label: '低风险', cls: 'ok' },
  medium: { label: '中风险', cls: 'warn' },
  high: { label: '高风险', cls: 'danger' },
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>合同审查</h1>
    </div>
    <CaseBoard scenario="contract" item-name="份合同" import-label="载入合同（3份）" :grid-min="520">
      <template #empty><h2>合同审查</h2><p class="muted small">载入合同 → AI逐条比对标准条款 → 偏差报告待审</p></template>
      <template #body="{ c }">
        <div class="review">
          <div class="top">
            <span class="badge" :class="LEVEL[c.analysis.riskLevel]?.cls ?? 'muted'">{{ LEVEL[c.analysis.riskLevel]?.label ?? c.analysis.riskLevel }}</span>
            <span class="sum">{{ c.analysis.summary }}</span>
          </div>
          <table class="table">
            <thead><tr><th style="width:76px">条款</th><th>合同原文</th><th style="width:80px">结论</th></tr></thead>
            <tbody>
              <tr v-for="(cl, i) in (c.analysis.clauses || [])" :key="i">
                <td><b>{{ cl.clause }}</b></td>
                <td>
                  <div class="orig">"{{ cl.contract }}"</div>
                  <div class="small muted">标准：{{ cl.standard }}<template v-if="cl.note"> ｜ {{ cl.note }}</template></div>
                </td>
                <td><span class="chip2" :class="RESULT[cl.result]?.cls">{{ RESULT[cl.result]?.label ?? cl.result }}</span></td>
              </tr>
            </tbody>
          </table>
          <div v-if="c.analysis.suggestion" class="sug"><b>修改建议：</b>{{ c.analysis.suggestion }}</div>
        </div>
      </template>
      <template #raw="{ c }"><div class="small muted">{{ c.payload.counterparty }} · {{ c.payload.amount }} · {{ c.payload.text.slice(0, 60) }}…</div></template>
    </CaseBoard>
  </div>
</template>

<style scoped>
.review { display: flex; flex-direction: column; gap: 10px; }
.top { display: flex; gap: 10px; align-items: center; }
.sum { font-size: 13.5px; font-weight: 600; color: var(--text-strong); }
.orig { font-size: 12.8px; color: var(--text); }
.chip2 { font-size: 11.5px; font-weight: 700; padding: 2px 8px; border-radius: 99px; }
.chip2.ok { color: var(--ok); background: var(--ok-soft); }
.chip2.warn { color: var(--warn); background: var(--warn-soft); }
.chip2.danger { color: var(--danger); background: var(--danger-soft); }
.sug { font-size: 12.8px; background: var(--surface-2); border-radius: 8px; padding: 8px 12px; }
</style>
