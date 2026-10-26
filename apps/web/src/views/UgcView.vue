<script setup lang="ts">
import CaseBoard from '../components/CaseBoard.vue'

const LEVEL: Record<string, { label: string; cls: string }> = {
  pass: { label: '通过', cls: 'ok' },
  suspicious: { label: '可疑·转人工', cls: 'warn' },
  high_risk: { label: '高危', cls: 'danger' },
}
const ACTION: Record<string, string> = { none: '无需处置', review: '转人工复核', delete: '删除', limit: '限流' };
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>内容审核</h1>
    </div>
    <CaseBoard
      scenario="ugc" item-name="条内容" import-label="载入待审内容（30条）"
      :batch-filter="(c: any) => c.analysis?.level === 'pass'" batch-label="批量确认通过级"
      :grid-min="400"
    >
      <template #empty><h2>内容审核</h2><p class="muted small">载入内容 → AI分级（通过/可疑/高危）→ 转人工队列处置</p></template>
      <template #body="{ c }">
        <div class="ugc">
          <div class="quote">"{{ c.payload.content }}"</div>
          <div class="small muted">{{ c.payload.author }} · {{ c.payload.channel }}</div>
          <div class="tags">
            <span class="chip2" :class="LEVEL[c.analysis.level]?.cls">{{ LEVEL[c.analysis.level]?.label ?? c.analysis.level }}</span>
            <span v-for="t in (c.analysis.tags || [])" :key="t" class="chip2 muted2">{{ t }}</span>
            <span class="small muted">建议：{{ ACTION[c.analysis.suggestedAction] ?? c.analysis.suggestedAction }}</span>
          </div>
          <div class="small reason">{{ c.analysis.reason }}</div>
        </div>
      </template>
      <template #raw="{ c }"><div class="small">"{{ c.payload.content.slice(0, 50) }}…"</div></template>
    </CaseBoard>
  </div>
</template>

<style scoped>
.ugc { display: flex; flex-direction: column; gap: 7px; }
.quote { font-size: 13.5px; color: var(--text-strong); background: var(--surface-2); border-radius: 8px; padding: 8px 12px; line-height: 1.6; }
.tags { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.chip2 { font-size: 11.5px; font-weight: 700; padding: 2px 9px; border-radius: 99px; }
.chip2.ok { color: var(--ok); background: var(--ok-soft); }
.chip2.warn { color: var(--warn); background: var(--warn-soft); }
.chip2.danger { color: var(--danger); background: var(--danger-soft); }
.chip2.muted2 { color: var(--muted); background: var(--surface-2); font-weight: 500; }
.reason { color: var(--muted); }
</style>
