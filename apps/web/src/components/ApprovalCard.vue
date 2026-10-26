<script setup lang="ts">
import { ref, computed } from 'vue'
import { post } from '../api'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{
  approval: {
    id: number
    scenario: string
    title?: string
    card: any
    status: string
    decided_by?: string | null
    decided_at?: string | null
    reject_reasons?: string[] | null
  }
  compact?: boolean
}>()

const emit = defineEmits<{ decided: [] }>()

const REJECT_REASONS: Record<string, string[]> = {
  ask: ['口径理解错误', '时间范围不对', 'SQL逻辑有误', '需要补充解释', '其他'],
  resume: ['评估过严', '评估过松', '匹配依据不足', '风险点误判', '其他'],
  match: ['差异原因判断有误', '处置建议不当', '金额核对不符', '其他'],
  gov: ['材料清单核对有误', '形式要求判断有误', '补正项遗漏', '其他'],
  contract: ['条款提取有误', '标准比对不当', '风险等级误判', '修改建议不可行', '其他'],
  credit: ['核查项遗漏', '风险点误判', '额度建议不当', '利率建议不当', '其他'],
  ugc: ['分级过严', '分级过松', '处置建议不当', '其他'],
  abtest: ['结论判断有误', '风险识别遗漏', '样本评估不当', '其他'],
  equipment: ['健康评估有误', '风险等级误判', '维护窗口不合理', '其他'],
  policy: ['政策条件核对有误', '边界判断不当', '材料预检有误', '其他'],
  ticket: ['定责部门有误', '紧急度误判', '分类不准', '其他'],
  ctp: ['测算有误', '方案不可行', '交期承诺过于激进', '其他'],
}

const busy = ref(false)
const rejecting = ref(false)
const selected = ref<string[]>([])
const custom = ref('')

const reasonOptions = computed(() => REJECT_REASONS[props.approval.scenario] ?? ['其他'])

async function decide(verdict: 'approved' | 'rejected') {
  if (verdict === 'rejected' && !selected.value.length && !custom.value.trim()) return
  busy.value = true
  try {
    const reasons = [...selected.value]
    if (custom.value.trim()) reasons.push(custom.value.trim())
    await post(`/api/approvals/${props.approval.id}/decide`, { verdict, reasons })
    emit('decided')
  } finally {
    busy.value = false
    rejecting.value = false
  }
}

function toggle(r: string) {
  const i = selected.value.indexOf(r)
  i >= 0 ? selected.value.splice(i, 1) : selected.value.push(r)
}
</script>

<template>
  <div class="ap-card" :class="[`ap-${approval.status}`]">
    <div class="ap-head">
      <span class="ap-tag">{{ { ask: '问数', resume: '简历', match: '三单', gov: '政务', contract: '合同', credit: '信贷', ugc: '内容', abtest: '实验', equipment: '设备', policy: '政策', ticket: '工单', ctp: '交期' }[approval.scenario] ?? approval.scenario }}</span>
      <span class="ap-title">{{ approval.title }}</span>
      <StatusBadge :status="approval.status" />
    </div>

    <div class="ap-body">
      <slot />
    </div>

    <!-- 待裁决：操作区 -->
    <div v-if="approval.status === 'pending'" class="ap-actions">
      <template v-if="!rejecting">
        <button class="btn btn-ok" :disabled="busy" @click="decide('approved')">通过并执行</button>
        <button class="btn btn-danger-ghost" :disabled="busy" @click="rejecting = true">驳回</button>
      </template>
      <template v-else>
        <div class="ap-reasons">
          <button v-for="r in reasonOptions" :key="r" class="reason-chip" :class="{ on: selected.includes(r) }" @click="toggle(r)">{{ r }}</button>
          <input v-model="custom" class="input ap-custom" placeholder="补充说明…" />
        </div>
        <div class="ap-reason-actions">
          <button class="btn btn-danger-ghost" :disabled="busy || (!selected.length && !custom.trim())" @click="decide('rejected')">确认驳回</button>
          <button class="btn" :disabled="busy" @click="rejecting = false; selected = []; custom = ''">取消</button>
        </div>
      </template>
    </div>

    <!-- 已裁决：结果区 -->
    <div v-else-if="['approved', 'rejected', 'expired'].includes(approval.status)" class="ap-verdict">
      <template v-if="approval.status === 'approved'">
        <span class="v-ok">✓ {{ approval.decided_by || '已' }}批准 · {{ (approval.decided_at || '').slice(0, 19) }}</span>
      </template>
      <template v-else-if="approval.status === 'rejected'">
        <span class="v-no">✕ {{ approval.decided_by || '' }}驳回 · {{ (approval.reject_reasons || []).join('；') }}</span>
      </template>
      <template v-else>
        <span class="muted small">等待超时，提案已失效</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ap-card {
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: var(--surface);
  overflow: hidden;
}

.ap-pending { border-color: color-mix(in srgb, var(--warn) 45%, var(--border-strong)); box-shadow: 0 0 0 3px var(--warn-soft); }
.ap-approved { border-color: color-mix(in srgb, var(--ok) 40%, var(--border)); }
.ap-rejected { border-color: color-mix(in srgb, var(--danger) 40%, var(--border)); }

.ap-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.ap-tag {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--muted);
  text-transform: uppercase;
}

.ap-title { font-weight: 600; font-size: 13.5px; color: var(--text-strong); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ap-body { padding: 14px; }

.ap-actions { padding: 12px 14px; border-top: 1px solid var(--border); display: flex; gap: 10px; align-items: center; }

.ap-reasons { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; align-items: center; }

.reason-chip {
  font-size: 12px;
  padding: 4px 11px;
  border-radius: 99px;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  cursor: pointer;
  color: var(--text);
  font-family: var(--sans);
}

.reason-chip.on { border-color: var(--danger); color: var(--danger); background: var(--danger-soft); font-weight: 600; }

.ap-custom { width: 150px; padding: 4px 10px; font-size: 12px; }

.ap-reason-actions { display: flex; gap: 8px; }

.ap-verdict { padding: 9px 14px; border-top: 1px solid var(--border); font-size: 12.5px; }

.v-ok { color: var(--ok); font-weight: 600; }
.v-no { color: var(--danger); font-weight: 600; }
</style>
