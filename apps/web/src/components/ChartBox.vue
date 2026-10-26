<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{
  spec: { type: string; x?: string; y?: string } | null
  columns: string[]
  rows: any[]
}>()

const el = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

function render() {
  if (!el.value) return
  if (!chart) chart = echarts.init(el.value)
  const { spec, columns, rows } = props
  if (!spec || !rows?.length) { chart.clear(); return }

  const x = spec.x || columns[0]
  const y = spec.y || columns.find(c => c !== x) || columns[1]
  const xData = rows.map(r => String(r[x] ?? ''))
  const yData = rows.map(r => Number(r[y] ?? 0))
  const type = (spec.type || 'bar') as 'bar' | 'line' | 'pie'

  const base = {
    textStyle: { fontFamily: 'Segoe UI, PingFang SC, Microsoft YaHei', color: '#84827a', fontSize: 11.5 },
    grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis' as const },
  }

  if (type === 'pie') {
    chart.setOption({
      ...base,
      tooltip: { trigger: 'item' as const },
      series: [{
        type: 'pie',
        radius: ['38%', '68%'],
        center: ['50%', '52%'],
        itemStyle: { borderRadius: 5, borderColor: '#fcfbf8', borderWidth: 2 },
        label: { color: '#33312b' },
        data: rows.map(r => ({ name: String(r[x] ?? ''), value: Number(r[y] ?? 0) })),
      }],
    }, true)
  } else {
    chart.setOption({
      ...base,
      xAxis: { type: 'category', data: xData, axisLine: { lineStyle: { color: '#d9d4c8' } }, axisTick: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#efede6' } } },
      series: [{
        type,
        data: yData,
        barMaxWidth: 34,
        itemStyle: type === 'bar' ? { color: '#d97757', borderRadius: [4, 4, 0, 0] } : { color: '#d97757' },
        lineStyle: { width: 2.5, color: '#d97757' },
        symbolSize: 7,
        symbol: 'circle',
        smooth: true,
        areaStyle: type === 'line' ? { color: 'rgba(217,119,87,0.12)' } : undefined,
      }],
    }, true)
  }
}

watch(() => [props.spec, props.rows, props.columns], render, { deep: true })
onMounted(render)
onBeforeUnmount(() => chart?.dispose())

const resize = () => chart?.resize()
onMounted(() => window.addEventListener('resize', resize))
onBeforeUnmount(() => window.removeEventListener('resize', resize))
</script>

<template>
  <div ref="el" style="width: 100%; height: 300px"></div>
</template>
