import { useTokenStore } from '@/stores/tokenStore'

const RUN_RECORD_KEY = 'bulkCarsRunRecords_v1'
const LOCK_KEY = 'bulkCarsScheduler_lock'
const LOCK_TTL = 10 * 60 * 1000 // 10 minutes
let intervalId = null
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

const hasRunForToday = (timeStr = '23:50') => {
  const records = getRunRecords() || []
  const today = new Date().toISOString().slice(0, 10)
  const key = `cars:${today}:${timeStr}`
  return Array.isArray(records) && records.includes(key)
}

const recordRunForToday = (timeStr = '23:50') => {
  const records = getRunRecords() || []
  const today = new Date().toISOString().slice(0, 10)
  const key = `cars:${today}:${timeStr}`
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

const checkAndRunCars = async () => {
  const tokenStore = useTokenStore()
  const now = new Date()
  const scheduledHour = 23
  const scheduledMinute = 50
  const scheduledTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), scheduledHour, scheduledMinute, 0, 0)

  // 如果当前时间还没到23:50，不做什么
  if (now < scheduledTime) return

  // 如果今天已经执行过23:50任务，则跳过
  if (hasRunForToday('23:50')) return

  // 尝试获取锁，避免多标签页并发
  const locked = tryAcquireLock()
  if (!locked) return

  try {
    // 执行store中定义的任务
    await batchClaimCars();
    recordRunForToday('23:50')
  } catch (e) {
    console.error('执行 BulkCarsTask 失败', e)
  } finally {
    releaseLock()
  }
}

const batchClaimCars = async () => {
  if (tokenStore.gameTokens.value.length === 0) return

  for (const token of tokenStore.gameTokens.value) {

    try {
      //addLog({ time: new Date().toLocaleTimeString(), message: `=== 开始一键收车: ${token.name} ===`, type: 'info' })

      tokenStore.selectToken(token.id)

      // 1. Fetch Car Info
      //addLog({ time: new Date().toLocaleTimeString(), message: `获取车辆信息...`, type: 'info' })
      const res = await tokenStore.sendMessageWithPromise(token.id, 'car_getrolecar', {}, 10000)
      let carList = normalizeCars(res?.body ?? res)

      // 2. Claim Cars
      let claimedCount = 0
      for (const car of carList) {
        if (canClaim(car)) {
          try {
            await tokenStore.sendMessageWithPromise(token.id, 'car_claim', { carId: String(car.id) }, 10000)
            claimedCount++
            //addLog({ time: new Date().toLocaleTimeString(), message: `收车成功: ${gradeLabel(car.color)}`, type: 'success' })
          } catch (e) {
            //addLog({ time: new Date().toLocaleTimeString(), message: `收车失败: ${e.message}`, type: 'warning' })
          }
          await new Promise(r => setTimeout(r, 300))
        }
      }

      if (claimedCount === 0) {
        //addLog({ time: new Date().toLocaleTimeString(), message: `没有可收取的车辆`, type: 'info' })
      }

      //addLog({ time: new Date().toLocaleTimeString(), message: `=== ${token.name} 收车完成，共收取 ${claimedCount} 辆 ===`, type: 'success' })

    } catch (error) {
      console.error(error)
      //addLog({ time: new Date().toLocaleTimeString(), message: `收车失败: ${error.message}`, type: 'error' })
    }

    currentProgress.value = 100
    await new Promise(r => setTimeout(r, 500))
  }

  isRunning.value = false
  currentRunningTokenId.value = null
  message.success('批量一键收车结束')
}


export const startScheduledBulkCars = (immediate = false) => {
  // 每5分钟检查一次
  if (intervalId) return
  if (immediate) {
    checkAndRunCars().catch(e => console.error(e))
  }
  intervalId = setInterval(() => {
    checkAndRunCars().catch(e => console.error(e))
  }, 0.5 * 60 * 1000)
}

export const stopScheduledBulkCars = () => {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

export default {
  startScheduledBulkCars,
  stopScheduledBulkCars
}
