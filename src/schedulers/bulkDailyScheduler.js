import { useTokenStore } from '@/stores/tokenStore'
import { performBulkDailyTask } from '@/tasks/taskRunner'

const RUN_RECORD_KEY = 'bulkDailyRunRecords_v1'
const LOCK_KEY = 'bulkDailyScheduler_lock'
const LOCK_TTL = 10 * 60 * 1000 // 10 minutes
let intervalId = null
let isDailyScheduledRunning = false
const sessionId = 'scheduler_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)

const getRunRecords = () => {
  try {
    const raw = localStorage.getItem(RUN_RECORD_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Normalize legacy shapes: prefer array, otherwise extract string-like values
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') {
      const out = []
      Object.values(parsed).forEach(v => {
        if (typeof v === 'string') out.push(v)
        else if (Array.isArray(v)) out.push(...v.filter(x => typeof x === 'string'))
      })
      return out
    }
    return []
  } catch (e) {
    console.warn('读取运行记录失败', e)
    return []
  }
}

const saveRunRecords = (records) => {
  try {
    localStorage.setItem(RUN_RECORD_KEY, JSON.stringify(records))
  } catch (e) {
    console.warn('保存运行记录失败', e)
  }
}

const hasRunForToday = (timeStr = '14:00') => {
  const records = getRunRecords() || []
  const today = new Date().toISOString().slice(0, 10)
  const key = `daily:${today}:${timeStr}`
  return Array.isArray(records) && records.includes(key)
}

const recordRunForToday = (timeStr = '14:00') => {
  const records = getRunRecords() || []
  const today = new Date().toISOString().slice(0, 10)
  const key = `daily:${today}:${timeStr}`
  const arr = Array.isArray(records) ? records : []
  if (!arr.includes(key)) {
    arr.push(key)
    // 保留最近 500 条记录以防膨胀
    const keep = arr.slice(-500)
    saveRunRecords(keep)
  }
}

const tryAcquireLock = () => {
  try {
    const now = Date.now()
    const raw = localStorage.getItem(LOCK_KEY)
    if (raw) {
      const info = JSON.parse(raw)
      if (now - info.ts < LOCK_TTL) {
        // lock is active
        return false
      }
    }
    const payload = { owner: sessionId, ts: now }
    localStorage.setItem(LOCK_KEY, JSON.stringify(payload))
    // re-check
    const check = JSON.parse(localStorage.getItem(LOCK_KEY) || '{}')
    return check.owner === sessionId
  } catch (e) {
    console.warn('获取锁失败', e)
    return false
  }
}

const releaseLock = () => {
  try {
    const raw = localStorage.getItem(LOCK_KEY)
    if (!raw) return
    const info = JSON.parse(raw)
    if (info.owner === sessionId) {
      localStorage.removeItem(LOCK_KEY)
    }
  } catch (e) {
    console.warn('释放锁失败', e)
  }
}

const checkAndRunDaily = async (message) => {
  if (isDailyScheduledRunning) return
  isDailyScheduledRunning = true
  const tokenStore = useTokenStore()
  const now = new Date()
  const scheduledHour = 14
  const scheduledMinute = 0
  const scheduledTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), scheduledHour, scheduledMinute, 0, 0)

  // 如果当前时间还没到14:00，不做什么
  if (now < scheduledTime) return

  // 如果今天已经执行过14:00任务，则跳过
  if (hasRunForToday('14:00')) return

  // 尝试获取锁，避免多标签页并发
  const locked = tryAcquireLock()
  if (!locked) {
    isDailyScheduledRunning = false
    return
  }

  try {
    // 执行 task runner 中定义的任务
    await performBulkDailyTask(message)
    recordRunForToday('14:00')
  } catch (e) {
    console.error('执行 BulkDailyTask 失败', e)
  } finally {
    releaseLock()
    isDailyScheduledRunning = false
  }
}

export const startScheduledBulkDaily = (message) => {
  // 每5分钟检查一次
  if (intervalId) return
  intervalId = setInterval(() => {
    checkAndRunDaily(message).catch(e => console.error(e))
  }, 1 * 60 * 1000)
}

export const stopScheduledBulkDaily = (message) => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    isDailyScheduledRunning = false
    releaseLock()
    if (message && message.info) message.info('定时检查已停止')
  }
}

export default {
  startScheduledBulkDaily,
  stopScheduledBulkDaily
}
