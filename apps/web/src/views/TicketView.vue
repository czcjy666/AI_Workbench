<script setup lang="ts">
import CaseBoard from '../components/CaseBoard.vue'

const URGENCY: Record<string, { label: string; cls: string }> = {
  normal: { label: '普通', cls: 'muted2' },
  urgent: { label: '急件', cls: 'warn' },
  emergency: { label: '紧急', cls: 'danger' },
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>12345工单分派</h1>
    </div>
    <CaseBoard
      scenario="ticket" item-name="条工单" import-label="载入工单（15条）"
      :batch-filter="(c: any) => c.analysis?.urgency === 'normal'" batch-label="批量确认普通件"
      :grid-min="460"
    >
      <template #empty><h2>12345分派</h2><p class="muted small">载入工单 → AI分类定责 → 座席长确认分派</p></template>
      <template #body="{ c }">
        <div class="tk">
          <div class="quote">"{{ c.payload.content }}"</div>
          <div class="small muted">{{ c.payload.ticketNo ?? c.payload.caseNo }} · {{ c.payload.source }} · 诉求人：{{ c.payload.caller }}</div>
          <div class="assign">
            <span class="dept">{{ c.analysis.department }}</span>
            <span class="chip2" :class="URGENCY[c.analysis.urgency]?.cls">{{ URGENCY[c.analysis.urgency]?.label ?? c.analysis.urgency }}</span>
            <span class="small">分类：{{ c.analysis.category }}</span>
            <span class="chip2 sla">时限 {{ c.analysis.slaHours }}h</span>
          </div>
          <div class="small reason">{{ c.analysis.reason }}</div>
          <div v-if="c.analysis.similarCase" class="similar small">相似案例：{{ c.analysis.similarCase }}</div>
          <div v-if="c.analysis.transferNote" class="note small">转办备注：{{ c.analysis.transferNote }}</div>
        </div>
      </template>
      <template #raw="{ c }"><div class="small">"{{ c.payload.content.slice(0, 50) }}…"</div></template>
    </CaseBoard>
  </div>
</template>

<style scoped>
.tk { display: flex; flex-direction: column; gap: 7px; }
.quote { font-size: 13.5px; color: var(--text-strong); background: var(--surface-2); border-radius: 8px; padding: 8px 12px; line-height: 1.6; }
.assign { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.dept { font-weight: 700; font-size: 14px; color: var(--accent-strong); }
.chip2 { font-size: 11.5px; font-weight: 700; padding: 1px 9px; border-radius: 99px; }
.chip2.warn { color: var(--warn); background: var(--warn-soft); }
.chip2.danger { color: var(--danger); background: var(--danger-soft); }
.chip2.muted2 { color: var(--muted); background: var(--surface-2); }
.chip2.sla { color: var(--info); background: var(--info-soft); }
.reason { color: var(--text); }
.similar { color: var(--muted); background: var(--surface-2); border-radius: 6px; padding: 5px 10px; }
.note { color: var(--warn); }
</style>
