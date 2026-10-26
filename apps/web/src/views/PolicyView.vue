<script setup lang="ts">
import CaseBoard from '../components/CaseBoard.vue'

const ELIG: Record<string, { label: string; cls: string }> = {
  yes: { label: '符合', cls: 'ok' },
  borderline: { label: '边界', cls: 'warn' },
  no: { label: '不符', cls: 'danger' },
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>政策匹配</h1>
    </div>
    <CaseBoard scenario="policy" item-name="家企业" import-label="载入企业与政策库" :grid-min="560">
      <template #empty><h2>惠企政策匹配</h2><p class="muted small">载入企业画像 → AI逐条匹配政策 → 推送建议待确认</p></template>
      <template #body="{ c }">
        <div class="pol">
          <div class="head">
            <b>{{ c.payload.company }}</b>
            <span class="small muted">{{ c.payload.industry }} · {{ c.payload.employees }}人 · 年营收{{ c.payload.revenue }}</span>
          </div>
          <div class="sum">{{ c.analysis.summary }}</div>
          <div v-for="(m, i) in (c.analysis.matches || [])" :key="i" class="match">
            <div class="m-top">
              <b>{{ m.policy }}</b>
              <span class="chip2" :class="ELIG[m.eligible]?.cls">{{ ELIG[m.eligible]?.label ?? m.eligible }}</span>
              <span v-if="m.eligible !== 'no' && m.estimatedAmount" class="chip2 amt">预估 {{ m.estimatedAmount }}</span>
            </div>
            <div class="small m-reason">{{ m.reason }}</div>
            <div v-if="m.materialsStatus?.length" class="mats">
              <span v-for="ms in m.materialsStatus" :key="ms.material" class="mat" :class="ms.status">
                {{ ms.status === 'ready' ? '✓' : '✕' }} {{ ms.material }}
              </span>
            </div>
          </div>
        </div>
      </template>
      <template #raw="{ c }"><div class="small muted">{{ c.payload.company }} · {{ c.payload.industry }} · 研发占比{{ c.payload.rdRatio }}</div></template>
    </CaseBoard>
  </div>
</template>

<style scoped>
.pol { display: flex; flex-direction: column; gap: 8px; }
.head { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.sum { font-size: 13px; color: var(--text-strong); font-weight: 600; }
.match { border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; }
.m-top { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 13.5px; }
.m-reason { color: var(--muted); margin-top: 3px; }
.mats { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.mat { font-size: 11.5px; padding: 1px 8px; border-radius: 99px; }
.mat.ready { color: var(--ok); background: var(--ok-soft); }
.mat.missing { color: var(--danger); background: var(--danger-soft); }
.chip2 { font-size: 11.5px; font-weight: 700; padding: 1px 9px; border-radius: 99px; }
.chip2.ok { color: var(--ok); background: var(--ok-soft); }
.chip2.warn { color: var(--warn); background: var(--warn-soft); }
.chip2.danger { color: var(--danger); background: var(--danger-soft); }
.chip2.amt { color: var(--accent-strong); background: var(--accent-soft); }
</style>
