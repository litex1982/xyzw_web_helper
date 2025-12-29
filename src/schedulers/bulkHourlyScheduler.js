import { useTokenStore } from '@/stores/tokenStore'
// Bulk hourly scheduler extracted from TokenImport/index.vue
// Exports: startScheduledBulkHourly(message?, startImmediately), stopScheduledBulkHourly(message?), BulkHourlyTask(message?)

let scheduledCheckerTimer = null

// Locking (localStorage) similar to bulkDailyScheduler
const LOCK_KEY = 'bulkHourlyScheduler_lock'
const LOCK_TTL = 30 * 60 * 1000 // 30 minutes
const sessionId = 'bulkhourly_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)

const tryAcquireLock = () => {
  try {
    const now = Date.now()
    const raw = localStorage.getItem(LOCK_KEY)
    if (raw) {
      const info = JSON.parse(raw)
      if (now - info.ts < LOCK_TTL) {
        return false
      }
    }
    const payload = { owner: sessionId, ts: now }
    localStorage.setItem(LOCK_KEY, JSON.stringify(payload))
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

// 检查间隔：1 分钟
const CHECK_INTERVAL_MS = 1 * 60 * 1000
// 要保证执行的时间点（24 小时制小时数）
const SCHEDULE_HOURS = [1, 7, 13, 19, 23]
// localStorage key（带版本号以便未来迁移）
const STORAGE_KEY = 'bulkHourlyRunRecords_v1'

const loadRunRecords = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) || {}
  } catch (e) {
    console.warn('读取运行记录失败', e)
    return {}
  }
}

const saveRunRecords = (records) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch (e) {
    console.warn('保存运行记录失败', e)
  }
}

const hasRun = (dateStr, hour) => {
  const records = loadRunRecords()
  const arr = records[dateStr] || []
  if (arr.includes(hour)) return true
  return false
}

const markRun = (dateStr, hour) => {
  const records = loadRunRecords()
  records[dateStr] = records[dateStr] || []
  if (!records[dateStr].includes(hour)) records[dateStr].push(hour)

  // 简单清理：只保留最近 7 天记录
  const keepDays = 7
  const keys = Object.keys(records).sort().reverse().slice(0, keepDays)
  const pruned = {}
  for (const k of keys) pruned[k] = records[k]

  saveRunRecords(pruned)
}

// 小工具：等待秒数
const waitForSeconds = (seconds = 20) => {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, seconds) * 1000)
  })
}

// NOTE: use the store's `waitForConnectionStatus` directly; no local implementation here

// 以下为对单个 token 的处理逻辑；tokenStore 在内部获取，message 可选
const processTokensForHourlyTask = async (token, message) => {
  try {
    const tokenStore = useTokenStore()
    let connectionRetry = 5
    while (connectionRetry > 0) {
      try {
        // 使用 tokenStore.selectToken 以触发连接逻辑
        tokenStore.selectToken(token.id)
      } catch (e) {
        console.warn('selectToken 抛出异常（可忽略）', e)
      }

      const connected = await tokenStore.waitForConnectionStatus(token.id, 'connected', { interval: 500, timeout: 30000 })
      if (connected) {
        if (message && message.success) message.success(`${token.name} 已连接，开始执行任务`)
        break
      }

      connectionRetry = connectionRetry - 1
      if (connectionRetry <= 0) {
        console.warn('建立连接失败', token.name)
        return { success: false, tokenId: token.id, error: new Error('连接超时') }
      }
    }

    // 执行任务序列
    // 重启盐罐机器人
    if (!tokenStore.selectedToken) tokenStore.selectToken(token.id)
    const tokenId = token.id
    tokenStore.sendMessage(tokenId, 'bottlehelper_stop')
    await new Promise(resolve => setTimeout(resolve, 500))
    tokenStore.sendMessage(tokenId, 'bottlehelper_start')
    tokenStore.sendMessage(tokenId, 'role_getroleinfo')
    await waitForSeconds(2)

    // 加钟
    try {
      const tasks = []
      for (let i = 0; i < 4; i++) {
        tasks.push(new Promise((resolve) => {
          setTimeout(() => {
            tokenStore.sendMessage(tokenId, 'system_mysharecallback', { isSkipShareCard: true, type: 2 })
            resolve()
          }, i * 300)
        }))
      }
      await Promise.all(tasks)
      setTimeout(() => tokenStore.sendMessage(tokenId, 'role_getroleinfo'), 1500)
      setTimeout(() => {
        if (message && message.success) message.success('加钟操作已完成，请查看挂机剩余时间')
      }, 2500)
    } catch (e) {
      if (message && message.error) message.error('加钟操作失败: ' + (e?.message || '未知错误'))
    }

    await waitForSeconds(2)

    // 领取挂机奖励
    try {
      tokenStore.sendMessage(tokenId, 'system_mysharecallback')
      setTimeout(() => tokenStore.sendMessage(tokenId, 'system_claimhangupreward'), 200)
      setTimeout(() => tokenStore.sendMessage(tokenId, 'system_mysharecallback', { isSkipShareCard: true, type: 2 }), 400)
      setTimeout(() => tokenStore.sendMessage(tokenId, 'role_getroleinfo'), 600)
      setTimeout(() => {
        if (message && message.success) message.success('挂机奖励领取完成')
      }, 1200)
    } catch (e) {
      if (message && message.error) message.error('领取挂机奖励失败: ' + (e?.message || '未知错误'))
    }

    await waitForSeconds(5)
    // 任务完成后断开连接以节省资源
    tokenStore.closeWebSocketConnection(token.id)

    return { success: true, tokenId: token.id }
  } catch (error) {
    console.error('处理 token 失败', token.id, error)
    return { success: false, tokenId: token.id, error }
  }
}

// 串行遍历 tokens：仅在当前 token 连接成功后才继续下一个
const BulkHourlyTask = async (message) => {
  const tokenStore = useTokenStore()
  if (tokenStore.gameTokens.length === 0) return
  for (const token of tokenStore.gameTokens) {
    console.warn(token.name)
    const res = await processTokensForHourlyTask(token, message)
    if (!res.success) {
      if (message && message.error) message.error(`在处理 ${token.name} 时发生错误，已中止批量操作`)
      else console.error(`在处理 ${token.name} 时发生错误`, res.error)
      // continue next token instead of aborting entirely
    }

    await waitForSeconds(5)
  }

  if (message && message.success) message.success('批量日常处理完成（已串行执行）')
}

const checkAndRunScheduled = async (message) => {
  // Try acquire lock to avoid multiple tabs running concurrently
  const locked = tryAcquireLock()
  if (!locked) return

  try {
    const now = new Date()
    const today = now.toLocaleDateString('en-CA')
    const toRun = []
    for (const h of SCHEDULE_HOURS) {
      const scheduled = new Date(now)
      scheduled.setHours(h, 0, 0, 0)
      const already = hasRun(today, h)
      const shouldRun = now >= scheduled && !already
      if (shouldRun) toRun.push(h)
    }

    if (toRun.length === 0) return

    for (const h of toRun) {
      try {
        await BulkHourlyTask(message)
        markRun(today, h)
        await waitForSeconds(1)
      } catch (e) {
        console.error('执行 BulkHourlyTask 失败，稍后将重试', e)
      }
    }
  } finally {
    releaseLock()
  }
}

const startScheduledBulkHourly = (message, startImmediately = false) => {
  if (scheduledCheckerTimer) return

  if (startImmediately) {
    checkAndRunScheduled(message).catch(e => console.error(e))
  }

  scheduledCheckerTimer = setInterval(() => {
    checkAndRunScheduled(message).catch(e => console.error(e))
  }, CHECK_INTERVAL_MS)

  if (message && message.info) message.info(`定时检查已启动：每 ${Math.floor(CHECK_INTERVAL_MS / 60000)} 分钟检查一次，确保执行时段 ${SCHEDULE_HOURS.join(', ')} 点`)
}

const stopScheduledBulkHourly = (message) => {
  if (scheduledCheckerTimer) {
    clearInterval(scheduledCheckerTimer)
    scheduledCheckerTimer = null
    if (message && message.info) message.info('定时检查已停止')
  }
}

export { startScheduledBulkHourly, stopScheduledBulkHourly, BulkHourlyTask }
