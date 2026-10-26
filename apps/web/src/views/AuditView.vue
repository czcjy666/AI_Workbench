<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, subscribe, SCENARIO_NAMES } from '../api'
import StatusBadge from '../components/StatusBadge.vue'

const rows = ref<any[]>([])

async function load() {
  rows.value = await api('/api/audit')
}

onMounted(async () => {
  await load()
  subscribe(evt => {
    if (evt.type === 'approval:decided') load()
  })
})

function fmtCard(c: any) {
  try { return JSON.stringify(typeof c === 'string' ? JSON.parse(c) : c, null, 2) } catch { return String(c) }
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h1>审计日志</h1>
    </div>
    <div class="card">
      <table class="table">
        <thead>
          <tr>
            <th style="width: 56px">#</th>
            <th style="width: 80px">场景</th>
            <th>提案</th>
            <th style="width: 100px">状态</th>
            <th style="width: 90px">裁决人</th>
            <th style="width: 150px">时间</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in rows" :key="r.id">
            <tr class="row-main" @click="r._open = !r._open">
              <td>{{ r.id }}</td>
              <td>{{ SCENARIO_NAMES[r.scenario] ?? r.scenario }}</td>
              <td class="t-title">{{ r.title }}</td>
              <td><StatusBadge :status="r.status" /></td>
              <td>{{ r.decided_by || '—' }}</td>
              <td class="small muted">{{ (r.created_at || '').slice(5, 19) }}</td>
            </tr>
            <tr v-if="r._open" class="row-detail">
              <td colspan="6">
                <div v-if="r.reject_reasons?.length" class="small" style="color: var(--danger); margin-bottom: 6px;">
                  驳回原因：{{ r.reject_reasons.join('；') }}
                </div>
                <pre class="sql-block">{{ fmtCard(r.card) }}</pre>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.row-main { cursor: pointer; }
.row-main:hover { background: var(--surface-2); }
.t-title { max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-detail td { background: var(--surface-2); }
</style>
