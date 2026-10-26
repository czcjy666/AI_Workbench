<script setup lang="ts">
import { STATUS_META } from '../api'

const props = defineProps<{ status: string }>()
const meta = () => STATUS_META[props.status] ?? { label: props.status, tone: 'muted' as const }
</script>

<template>
  <span class="badge" :class="meta().tone">{{ meta().label }}</span>
</template>
