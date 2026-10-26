<script setup lang="ts">
// 推理过程流式面板：把网关经SSE推来的 reasoning delta 实时渲染出来
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{ text: string; done?: boolean; title?: string; live?: boolean }>()
const collapsed = ref(false)
const el = ref<HTMLElement | null>(null)

watch(() => props.text, async () => {
  if (collapsed.value) return
  await nextTick()
  if (el.value) el.value.scrollTop = el.value.scrollHeight
})

function toggle() { collapsed.value = !collapsed.value }
</script>

<template>
  <div v-if="text" class="think card">
    <div class="think-head" @click="toggle">
      <span class="think-label">{{ title ?? 'AI 思考过程' }}</span>
      <span v-if="live && !done" class="think-live">思考中</span>
      <span class="caret">{{ collapsed ? '展开' : '收起' }}</span>
    </div>
    <pre v-show="!collapsed" ref="el" class="think-body">{{ text }}<span v-if="live && !done" class="cursor">▋</span></pre>
  </div>
</template>

<style scoped>
.think { padding: 0; overflow: hidden; margin-bottom: 14px; }
.think-head { display: flex; gap: 10px; align-items: center; padding: 9px 14px; cursor: pointer; user-select: none; }
.think-label { font-size: 12.5px; font-weight: 700; color: var(--muted); letter-spacing: .02em; }
.think-live { font-size: 11.5px; color: var(--accent-strong); display: inline-flex; align-items: center; gap: 5px; }
.think-live::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: blink 1s infinite; }
.caret { margin-left: auto; font-size: 11px; color: var(--muted); }
.think-body { margin: 0; padding: 11px 14px; max-height: 300px; overflow-y: auto; font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace; font-size: 12px; line-height: 1.65; color: var(--muted); white-space: pre-wrap; word-break: break-word; background: var(--surface-2); border-top: 1px solid var(--border); }
.cursor { animation: blink 1s infinite; color: var(--accent); }
@keyframes blink { 50% { opacity: 0.25; } }
</style>
