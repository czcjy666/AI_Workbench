<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps<{ text: string }>()
const html = computed(() => {
  if (!props.text) return ''
  return marked.parse(props.text, { async: false }) as string
})
</script>

<template>
  <!-- 内容来自本地可信agent，仅做基础展示 -->
  <div class="md" v-html="html"></div>
</template>

<style scoped>
.md :deep(h1), .md :deep(h2), .md :deep(h3), .md :deep(h4) { font-family: var(--serif); margin: 14px 0 6px; }
.md :deep(p) { margin: 6px 0; }
.md :deep(table) { border-collapse: collapse; margin: 10px 0; font-size: 13px; }
.md :deep(th), .md :deep(td) { border: 1px solid var(--border-strong); padding: 5px 12px; }
.md :deep(th) { background: var(--surface-2); font-weight: 600; }
.md :deep(code) { background: var(--code-bg); border-radius: 4px; padding: 1px 5px; }
.md :deep(pre) { background: var(--code-bg); border-radius: 8px; padding: 10px 14px; overflow-x: auto; }
.md :deep(pre code) { background: none; padding: 0; }
.md :deep(ul), .md :deep(ol) { padding-left: 22px; margin: 6px 0; }
.md :deep(blockquote) { border-left: 3px solid var(--accent); margin: 8px 0; padding: 2px 14px; color: var(--muted); }
</style>
