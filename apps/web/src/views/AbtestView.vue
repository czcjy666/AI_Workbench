<script setup lang="ts">
import CaseBoard from '../components/CaseBoard.vue'

const CONCLUSION: Record<string, { label: string; cls: string }> = {
  positive: { label: '实验正向', cls: 'ok' },
  negative: { label: '实验负向', cls: 'danger' },
  inconclusive: { label: '结论不显著', cls: 'warn' },
}
const RECOM: Record<string, string> = { rollout: '建议全量上线', hold: '建议继续观察', iterate: '建议迭代再验', stop: '建议停止' };
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>A/B实验结论</h1>
    </div>
    <CaseBoard scenario="abtest" item-name="个实验" import-label="载入实验（4个）" :grid-min="500">
      <template #empty><h2>A/B实验结论</h2><p class="muted small">载入实验数据 → AI出具结论卡 → 负责人裁决是否全量</p></template>
      <template #body="{ c }">
        <div class="ab">
          <div class="top">
            <span class="badge" :class="CONCLUSION[c.analysis.conclusion]?.cls">{{ CONCLUSION[c.analysis.conclusion]?.label ?? c.analysis.conclusion }}</span>
            <span class="badge warn" v-if="c.analysis.recommendation">{{ RECOM[c.analysis.recommendation] ?? c.analysis.recommendation }}</span>
          </div>
          <table class="table">
            <thead><tr><th>指标</th><th>实验组</th><th>对照组</th><th>变化</th><th>类型</th></tr></thead>
            <tbody>
              <tr v-for="m in (c.payload.metrics || [])" :key="m.name">
                <td><b>{{ m.name }}</b></td>
                <td>{{ m.treatment }}</td>
                <td>{{ m.control }}</td>
                <td :style="{ color: String(m.lift).startsWith('-') && m.isPrimary ? 'var(--danger)' : 'var(--text)' }">{{ m.lift }}</td>
                <td><span class="chip2" :class="m.isPrimary ? 'pri' : 'guard'">{{ m.isPrimary ? '核心' : '护栏' }}</span></td>
              </tr>
            </tbody>
          </table>
          <div class="facts small">
            <span>置信度：{{ c.analysis.confidence }}</span><span>护栏：{{ c.analysis.guards }}</span>
          </div>
          <div v-if="c.analysis.risks?.length" class="risks">
            <div v-for="(r, i) in c.analysis.risks" :key="i">⚠ {{ r }}</div>
          </div>
          <div class="small reasoning">{{ c.analysis.reasoning }}</div>
        </div>
      </template>
      <template #raw="{ c }"><div class="small muted">{{ c.payload.experiment }} · {{ c.payload.days }}天</div></template>
    </CaseBoard>
  </div>
</template>

<style scoped>
.ab { display: flex; flex-direction: column; gap: 9px; }
.top { display: flex; gap: 8px; }
.facts { display: flex; gap: 16px; color: var(--muted); }
.risks { display: flex; flex-direction: column; gap: 3px; font-size: 12.8px; color: var(--warn); background: var(--warn-soft); border-radius: 8px; padding: 8px 12px; }
.reasoning { color: var(--muted); }
.chip2 { font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 99px; }
.chip2.pri { color: var(--accent-strong); background: var(--accent-soft); }
.chip2.guard { color: var(--info); background: var(--info-soft); }
</style>
