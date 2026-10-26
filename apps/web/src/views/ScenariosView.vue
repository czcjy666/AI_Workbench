<script setup lang="ts">
const groups = [
  {
    label: '通用', items: [
      { path: '/ask', name: '智能问数', line: '业务问题 → SQL → 审批 → 图表', glyph: 'M4 18 L10 12 L14 15 L20 8 M20 8 h-4 m4 0 v4' },
      { path: '/resume', name: '简历初筛', line: '批量解析 · 匹配卡片 · 盲筛', glyph: 'M7 4 h10 v16 l-5 -3 -5 3 z' },
      { path: '/contract', name: '合同审查', line: '条款提取 · 模板比对 · 偏差高亮', glyph: 'M6 3 h9 l3 3 v15 H6 z M9 9 h6 M9 13 h6 M9 17 h4' },
      { path: '/credit', name: '信贷初审', line: '政策核查 · 疑点清单 · 授信建议', glyph: 'M12 3 v18 M3 12 h18' },
    ],
  },
  {
    label: '互联网', items: [
      { path: '/ugc', name: '内容审核', line: 'AI预审分级 · 高危转人工', glyph: 'M4 5 h16 v11 H9 l-5 4 z' },
      { path: '/abtest', name: 'A/B结论', line: '护栏检查 · 全量决策', glyph: 'M8 20 V10 M12 20 V4 M16 20 v-8 M4 20 h16' },
    ],
  },
  {
    label: '制造业', items: [
      { path: '/match', name: '三单匹配', line: '订单 · 收货 · 发票 差异处置', glyph: 'M5 5 h5 v5 H5 z M14 5 h5 v5 h-5 z M9.5 14 h5 v5 h-5 z' },
      { path: '/ctp', name: '交期应答', line: '产能 × 物料核算 · 方案选择', glyph: 'M12 8 a4 4 0 1 1 0 8 a4 4 0 0 1 0 -8 M12 3 v3 M12 18 v3' },
      { path: '/equipment', name: '设备维护', line: '健康评估 · 维护窗口建议', glyph: 'M14 6 l4 4 -8 8 H6 v-4 z' },
    ],
  },
  {
    label: '政务', items: [
      { path: '/gov', name: '政务预审', line: '材料齐套性 · 补正告知书', glyph: 'M12 3 l8 3 v6 c0 5 -3.5 7.5 -8 9 -4.5 -1.5 -8 -4 -8 -9 V6 z' },
      { path: '/policy', name: '政策匹配', line: '"政策找企" · 材料预检', glyph: 'M12 2 l2.4 4.9 5.4 .8 -3.9 3.8 .9 5.4 -4.8 -2.5 -4.8 2.5 .9 -5.4 -3.9 -3.8 5.4 -.8 z' },
      { path: '/ticket', name: '12345分派', line: '分类定责 · 批量确认', glyph: 'M4 4 h16 v12 H10 l-6 5 V4 z' },
    ],
  },
]
</script>

<template>
  <div class="page">
    <div class="hero">
      <h1>AI提案，人类裁决</h1>
      <p class="hero-line">12个场景，同一套流水线：AI给方案与依据，人拍板，全程留痕</p>
    </div>
    <div v-for="g in groups" :key="g.label" class="group">
      <div class="group-label">{{ g.label }}</div>
      <div class="grid">
        <router-link v-for="s in g.items" :key="s.path" :to="s.path" class="sc-card">
          <svg class="sc-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path :d="s.glyph" />
          </svg>
          <div>
            <h2>{{ s.name }}</h2>
            <p class="sc-line">{{ s.line }}</p>
          </div>
          <span class="sc-arrow">→</span>
        </router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hero { padding: 22px 0 24px; }
.hero-line { color: var(--muted); margin: 10px 0 0; font-size: 14.5px; }
.group { margin-bottom: 22px; }
.group-label { font-family: var(--serif); font-size: 13px; font-weight: 700; letter-spacing: 2px; color: var(--muted); margin-bottom: 10px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.sc-card {
  display: flex; align-items: center; gap: 15px; padding: 18px 20px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 13px;
  color: inherit; text-decoration: none; transition: all 0.15s;
}
.sc-card:hover { border-color: var(--accent); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(120, 100, 80, 0.08); text-decoration: none; }
.sc-glyph { width: 27px; height: 27px; color: var(--accent); flex-shrink: 0; }
.sc-line { margin: 3px 0 0; color: var(--muted); font-size: 12.5px; }
.sc-arrow { margin-left: auto; color: var(--muted); font-size: 17px; }
.sc-card:hover .sc-arrow { transform: translateX(3px); color: var(--accent); }
</style>
