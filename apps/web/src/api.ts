// 网关API层
export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `${res.status}`)
  }
  return res.json()
}

export const post = <T = any>(path: string, body: any) =>
  api<T>(path, { method: 'POST', body: JSON.stringify(body) })

// SSE订阅（自动重连）
export function subscribe(handler: (evt: { type: string; payload: any; ts: number }) => void) {
  let es: EventSource | null = null
  let closed = false
  const connect = () => {
    if (closed) return
    es = new EventSource('/api/events')
    es.onmessage = e => {
      try { handler(JSON.parse(e.data)) } catch {}
    }
    es.onerror = () => {
      es?.close()
      setTimeout(connect, 3000)
    }
  }
  connect()
  return () => { closed = true; es?.close() }
}

export const STATUS_META: Record<string, { label: string; tone: 'muted' | 'warn' | 'ok' | 'danger' | 'info' }> = {
  drafting: { label: '分析中', tone: 'muted' },
  proposing: { label: '待人审批', tone: 'warn' },
  pending: { label: '待人审批', tone: 'warn' },
  approved: { label: '已批准', tone: 'ok' },
  rejected: { label: '已驳回', tone: 'danger' },
  executed: { label: '已执行', tone: 'ok' },
  failed: { label: '失败', tone: 'danger' },
  auto_passed: { label: '自动通过', tone: 'info' },
  expired: { label: '已过期', tone: 'muted' },
  analyzing: { label: '分析中', tone: 'muted' },
}

export const SCENARIO_NAMES: Record<string, string> = {
  ask: '智能问数', resume: '简历初筛', match: '三单匹配', gov: '政务预审',
}

// ── 匿名访客标识（仅用于统计UV/在线，不含任何个人身份信息）
export function getVisitorId(): string {
  const KEY = 'aw_visitor_id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = (crypto.randomUUID?.() ?? `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`).replace(/-/g, '').slice(0, 32)
    localStorage.setItem(KEY, id)
  }
  return id
}

export const trackVisit = () => post('/api/track/visit', { visitorId: getVisitorId() }).catch(() => {})
export const trackHeartbeat = () => post('/api/track/heartbeat', { visitorId: getVisitorId() }).catch(() => {})

export interface Stats { visitors: number; visits: number; online: number; usage: number }
