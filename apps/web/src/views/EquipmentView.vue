<script setup lang="ts">
import CaseBoard from '../components/CaseBoard.vue'

const RISK: Record<string, { label: string; cls: string }> = {
  low: { label: '低风险', cls: 'ok' },
  medium: { label: '中风险', cls: 'warn' },
  high: { label: '高风险', cls: 'danger' },
}
const PRIORITY: Record<string, string> = { routine: '例行保养', urgent: '尽快安排', critical: '立即停机检修' };
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>设备维护</h1>
    </div>
    <CaseBoard scenario="equipment" item-name="台设备" import-label="载入设备（8台）" :grid-min="440">
      <template #empty><h2>设备维护</h2><p class="muted small">载入设备台账 → AI健康评估 → 维护建议卡待审</p></template>
      <template #body="{ c }">
        <div class="eq">
          <div class="top">
            <div class="health" :class="c.analysis.health >= 80 ? 'hi' : c.analysis.health >= 60 ? 'mid' : 'lo'">{{ c.analysis.health }}</div>
            <div class="meta">
              <span class="badge" :class="RISK[c.analysis.failureRisk]?.cls">{{ RISK[c.analysis.failureRisk]?.label ?? c.analysis.failureRisk }}</span>
              <span class="badge warn" v-if="c.analysis.priority">{{ PRIORITY[c.analysis.priority] ?? c.analysis.priority }}</span>
              <div class="small muted">{{ c.payload.equipmentName }} · 运行{{ c.payload.runningHours }}h · 上次保养 {{ c.payload.lastMaintenance }}</div>
            </div>
          </div>
          <div v-if="c.analysis.evidence?.length" class="sec"><h4>依据</h4>
            <div v-for="(e, i) in c.analysis.evidence" :key="i" class="ev">{{ e }}</div>
          </div>
          <div class="plan">
            <div><b>建议：</b>{{ c.analysis.suggestion }}</div>
            <div class="small muted">窗口：{{ c.analysis.window }}<template v-if="c.analysis.spares?.length"> ｜ 备件：{{ c.analysis.spares.join('、') }}</template></div>
            <div v-if="c.analysis.riskWindow" class="small rw">风险窗口：{{ c.analysis.riskWindow }}</div>
          </div>
        </div>
      </template>
      <template #raw="{ c }"><div class="small muted">{{ c.payload.equipmentName }} · 振动{{ c.payload.vibration }} · 温度{{ c.payload.temperature }}℃ · 停机{{ c.payload.downtimeCount }}次</div></template>
    </CaseBoard>
  </div>
</template>

<style scoped>
.eq { display: flex; flex-direction: column; gap: 9px; }
.top { display: flex; gap: 12px; align-items: center; }
.health { width: 54px; height: 54px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 17px; font-family: var(--serif); flex-shrink: 0; }
.health.hi { background: var(--ok-soft); color: var(--ok); }
.health.mid { background: var(--warn-soft); color: var(--warn); }
.health.lo { background: var(--danger-soft); color: var(--danger); }
.meta { display: flex; flex-direction: column; gap: 4px; }
.sec h4, .plan { font-size: 13px; }
.sec h4 { margin: 0 0 4px; font-size: 12px; color: var(--muted); font-weight: 600; }
.ev { font-size: 12.8px; padding: 3px 0 3px 12px; border-left: 2px solid var(--border-strong); color: var(--text); }
.plan { display: flex; flex-direction: column; gap: 3px; background: var(--surface-2); border-radius: 8px; padding: 8px 12px; }
.rw { color: var(--warn); }
</style>
