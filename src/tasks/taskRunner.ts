import { useTokenStore } from '@/stores/tokenStore'

// Helper
const waitForSeconds = (seconds = 20) => {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, seconds) * 1000))
}

// 辅助函数
const pickArenaTargetId = (targets: any) => {
  if (!targets) return null

  const extractPower = (item: any) => {
    if (!item) return Number.POSITIVE_INFINITY
    // try several common locations for power
    const candidates = [item.power, item.info?.power, item.rolePower, item.powerValue]
    for (const c of candidates) {
      if (typeof c === 'number' && !Number.isNaN(c)) return c
      if (typeof c === 'string' && !Number.isNaN(Number(c))) return Number(c)
    }
    return Number.POSITIVE_INFINITY
  }

  const pickFromArray = (arr: any[]) => {
    if (!Array.isArray(arr) || arr.length === 0) return null
    let minItem: any = null
    let minPower = Number.POSITIVE_INFINITY
    for (const it of arr) {
      const p = extractPower(it)
      if (p < minPower) {
        minPower = p
        minItem = it
      }
    }
    return minItem
  }

  // If targets is an array directly, pick the one with lowest power
  if (Array.isArray(targets)) {
    const candidate = pickFromArray(targets)
    return candidate?.roleId || candidate?.id || candidate?.targetId || null
  }

  // Try various container fields that may hold arrays of targets
  const lists = [
    targets?.rankList,
    targets?.roleList,
    targets?.targets,
    targets?.targetList,
    targets?.list
  ]

  for (const l of lists) {
    if (Array.isArray(l) && l.length > 0) {
      const candidate = pickFromArray(l)
      if (candidate) return candidate?.roleId || candidate?.id || candidate?.targetId || null
    }
  }

  // Fallback to direct fields on targets
  return targets?.roleId || targets?.id || targets?.targetId || null
}

const isTodayAvailable = (statisticsTime: any) => {
  if (!statisticsTime) return true
  const today = new Date().toDateString()
  const recordDate = new Date(statisticsTime * 1000).toDateString()
  return today !== recordDate
}

const loadDailyTaskSettings = (roleId: any) => {
  const defaultSettings = {
    arenaFormation: 1,
    bossFormation: 1,
    bossTimes: 2,
    claimBottle: true,
    payRecruit: true,
    openBox: true,
    arenaEnable: true,
    claimHangUp: true,
    claimEmail: true,
    blackMarketPurchase: true
  }
  try {
    const raw = localStorage.getItem(`daily-settings:${roleId}`)
    const savedSetting = raw ? JSON.parse(raw) : null
    if (savedSetting) Object.assign(defaultSettings, savedSetting)
    return defaultSettings
  } catch (error) {
    console.error('Failed to load settings:', error)
    return defaultSettings
  }
}

const getTodayBossId = () => {
  const DAY_BOSS_MAP = [9904, 9905, 9901, 9902, 9903, 9904, 9905]
  const dayOfWeek = new Date().getDay()
  return DAY_BOSS_MAP[dayOfWeek]
}

  // 执行单个游戏指令的封装（使用 tokenStore 的 sendMessageWithPromise）
const executeGameCommand = async (tokenId, cmd, params = {}, description = '', timeout = 8000) => {
  const tokenStore = useTokenStore()
  try {
    const result = await tokenStore.sendMessageWithPromise(tokenId, cmd, params, timeout)
    // 让指令等待一点时间
    await new Promise(resolve => setTimeout(resolve, 500))
    return result
  } catch (error) {
    throw error
  }
}

// 执行一次针对所有token的每日任务（串行）
const performBulkDailyTask = async (message:any) => {
  const tokenStore = useTokenStore()

  if (!tokenStore.gameTokens || tokenStore.gameTokens.length === 0) {
    console.info('performBulkDailyTask: 没有可用的tokens，跳过')
    return
  }

  console.info('开始执行 BulkDailyTask（Task Runner）', { count: tokenStore.gameTokens.length })

  for (const token of tokenStore.gameTokens) {
    try {
      if (message && message.success) message.success(`${token.name} 开始连接`)
      let connectionRetry = 5
      while (connectionRetry > 0) {
        tokenStore.selectToken(token.id)
        const connected = await tokenStore.waitForConnectionStatus(token.id, 'connected', { timeout: 30000 })
        if (connected) {
          connectionRetry = 0
        } else {
          connectionRetry = connectionRetry - 1
        }
      }

      const connected = await tokenStore.waitForConnectionStatus(token.id, 'connected', { timeout: 30000 })
      if (!connected) {
        console.warn(`BulkDailyTask: token 未连接，跳过 [${token.id}]`)
        continue
      }

      if (message && message.success) message.success(`${token.name} 开始执行任务`)

      let roleInfo = null
      try {
        roleInfo = await tokenStore.sendGetRoleInfo(token.id).catch(() => null)
      } catch (e) {
        console.warn(`BulkDailyTask: 获取角色信息失败 [${token.id}]`, e)
        return
      }

      const completedTasks = roleInfo?.role?.dailyTask?.complete ?? {}
      const isTaskCompleted = (taskId: any) => completedTasks[taskId] === -1
      const statisticsTime = roleInfo?.role?.statisticsTime ?? {}
      const statistics = roleInfo?.role?.statistics ?? {}
      const settings = loadDailyTaskSettings(token.id)

      //挂机奖励:判断需要执行挂机领取次数
      if (!isTaskCompleted(5)) {
        //获取已经领取挂机次数
        let alreadyHangUpCount = completedTasks[5] ?? 0
        //剩余需要领取奖励数为5次减去已经完成次数
        const remainingHangUpCount = Math.max(5 - alreadyHangUpCount, 0)
        //需要领取挂机奖励，先加钟
        if(remainingHangUpCount>0){
          // 挂机奖励: 先加钟4次
          for (let i = 0; i < 4; i++) {
            try {
              await executeGameCommand(token.id, 'system_mysharecallback', { isSkipShareCard: true, type: 2 }, `挂机加钟 ${i + 1}`)
            } catch (e) {
              console.warn(`BulkDailyTask: 加钟失败 [${token.id}]`, e)
            }
          }
        }
        // 然后领取需要完成的剩余奖励
        for (let i = 0; i < remainingHangUpCount; i++) {
          try {
            await executeGameCommand(token.id, 'system_claimhangupreward', {}, '领取挂机奖励')
          } catch (e) {
            console.warn(`BulkDailyTask: 领取挂机奖励失败 [${token.id}]`, e)
          }
          await waitForSeconds(10)
        }
      }

      if (!isTaskCompleted(3)) {
        try {
          await executeGameCommand(token.id, 'friend_batch', {}, '赠送好友金币')
        } catch (e) {
          console.warn(`BulkDailyTask: 赠送好友金币失败 [${token.id}]`, e)
        }
      }

      if (!isTaskCompleted(2)) {
        try {
          await executeGameCommand(token.id, 'system_mysharecallback', { isSkipShareCard: true, type: 2 }, '分享游戏')
        } catch (e) {
          console.warn(`BulkDailyTask: 分享游戏失败 [${token.id}]`, e)
        }
      }

      if (!isTaskCompleted(4)) {
        try {
          await executeGameCommand(token.id, 'hero_recruit', { recruitType: 3, recruitNumber: 1 }, '免费招募')
        } catch (e) {
          console.warn(`BulkDailyTask: 免费招募失败 [${token.id}]`, e)
        }
        if (settings.payRecruit) {
          try {
            await executeGameCommand(token.id, 'hero_recruit', { recruitType: 1, recruitNumber: 1 }, '付费招募')
          } catch (e) {
            console.warn(`BulkDailyTask: 付费招募失败 [${token.id}]`, e)
          }
        }
      }

      if (!isTaskCompleted(14) && settings.claimBottle) {
        try {
          await executeGameCommand(token.id, 'bottlehelper_claim', {}, '领取盐罐奖励')
        } catch (e) {
          console.warn(`BulkDailyTask: 领取盐罐奖励失败 [${token.id}]`, e)
        }
      }

      
    // 2. 竞技场
    if (!isTaskCompleted(13) && settings.arenaEnable) {
      const hour = new Date().getHours()
      if (hour < 8) {
            console.warn(`BulkDailyTask: 当前时间未到8点，跳过竞技场战斗 [${token.name}]`)
      } else if (hour > 22) {
            console.warn(`BulkDailyTask: 当前时间已过22点，跳过竞技场战斗 [${token.name}]`)
      }else{
        //开启竞技场
        await executeGameCommand(token.id, 'arena_startarea', {}, '开始竞技场')
        for (let i = 1; i <= 3; i++) {
              let targets
              try {
                targets = await executeGameCommand(token.id, 'arena_getareatarget', {}, `获取竞技场目标${i}`)
              } catch (err:any) {
                console.warn(`BulkDailyTask: 竞技场战斗${i} - 获取对手失败: ${err.message} [${token.name}]`,err)
                break
              }

              const targetId = pickArenaTargetId(targets)
              if (targetId) {
                await executeGameCommand(token.id, 'fight_startareaarena', { targetId }, `竞技场战斗${i}`, 10000)
              } else {
                console.warn(`BulkDailyTask: 竞技场战斗${i} - 未找到目标: ${JSON.stringify(targets)} [${token.name}]`)
              }
              await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    }

      if (!isTaskCompleted(6) && isTodayAvailable(statisticsTime['buy:gold'])) {
        try {
          for (let i = 0; i < 3; i++) {
            await executeGameCommand(token.id, 'system_buygold', { buyNum: 1 }, `免费点金 ${i + 1}`)
          }
        } catch (e) {
          console.warn(`BulkDailyTask: 点金失败 [${token.id}]`, e)
        }
      }

      // BOSS、签到、领取等一系列操作
      const todayBossId = getTodayBossId()
      if (settings.bossTimes > 0) {
        let alreadyLegionBoss = statistics['legion:boss'] ?? 0
        if (isTodayAvailable(statisticsTime['legion:boss'])) {
          alreadyLegionBoss = 0
        }
        const remainingLegionBoss = Math.max(settings.bossTimes - alreadyLegionBoss, 0)
        if (remainingLegionBoss > 0) {
          for (let i = 0; i < remainingLegionBoss; i++) {
            try {
              await executeGameCommand(token.id, 'fight_startlegionboss', {}, `军团BOSS ${i + 1}`, 12000)
            } catch (e) {
              console.warn(`BulkDailyTask: 俱乐部BOSS战斗失败 [${token.id}]`, e)
            }
          }
        }
      }

      for (let i = 0; i < 3; i++) {
        try {
              await executeGameCommand(token.id, 'fight_startboss', { bossId: todayBossId }, `每日BOSS ${i + 1}`, 12000)
        } catch (e) {
          console.warn(`BulkDailyTask: 军团BOSS失败 [${token.id}]`, e)
        }
      }

      try { await executeGameCommand(token.id, 'system_signinreward', {}, '福利签到') } catch (e) { console.warn('签到失败', e) }
      try { await executeGameCommand(token.id, 'legion_signin', {}, '俱乐部') } catch (e) { console.warn('俱乐部签到失败', e) }
      try { await executeGameCommand(token.id, 'discount_claimreward', {}, '领取每日礼包') } catch (e) { console.warn('领取每日礼包失败', e) }
      try { await executeGameCommand(token.id, 'collection_claimfreereward', {}, '领取每日免费奖励') } catch (e) { console.warn('领取每日免费奖励失败', e) }
      try { await executeGameCommand(token.id, 'card_claimreward', {}, '领取免费礼包') } catch (e) { console.warn('领取免费礼包失败', e) }
      try { await executeGameCommand(token.id, 'card_claimreward', { cardId: 4003 }, '领取永久卡礼包') } catch (e) { console.warn('领取永久卡礼包失败', e) }
      try { await executeGameCommand(token.id, 'mail_claimallattachment', {}, '领取邮件奖励') } catch (e) { console.warn('领取邮件奖励失败', e) }
      try { await executeGameCommand(token.id, 'collection_goodslist', {}, '开始领取珍宝阁礼包') } catch (e) { console.warn('开始领取珍宝阁礼包失败', e) }
      try { await executeGameCommand(token.id, 'collection_claimfreereward', {}, '领取珍宝阁免费礼包') } catch (e) { console.warn('领取珍宝阁免费礼包失败', e) }

      if (isTodayAvailable(statisticsTime['artifact:normal:lottery:time']) && isTodayAvailable(statisticsTime['ar:normal:lo:cnt'])) {
        for (let i = 0; i < 3; i++) {
          try {
            await executeGameCommand(token.id, 'artifact_lottery', { lotteryNumber: 1, newFree: true, type: 1 }, `免费钓鱼 ${i + 1}`)
          } catch (e) {
            console.warn(`BulkDailyTask: 免费钓鱼失败 [${token.id}]`, e)
          }
        }
      }

      const kingdoms = ['魏国', '蜀国', '吴国', '群雄']
      for (let gid = 1; gid <= 4; gid++) {
        if (isTodayAvailable(statisticsTime[`genie:daily:free:${gid}`])) {
          try {
            await executeGameCommand(token.id, 'genie_sweep', { genieId: gid }, `${kingdoms[gid - 1]}灯神免费扫荡`)
          } catch (e) {
            console.warn(`BulkDailyTask: 灯神免费扫荡失败 [${token.id}]`, e)
          }
        }
      }

      // 领取免费扫荡卷
      if (isTodayAvailable(statisticsTime[`genie:sweep:buy`])) {
        for (let i = 0; i < 3; i++) {
          try { await executeGameCommand(token.id, 'genie_buysweep', {}, `领取免费扫荡卷 ${i + 1}`) } catch (e) { console.warn('领取免费扫荡卷失败', e) }
        }
      }

      if (!isTaskCompleted(12) && settings.blackMarketPurchase) {
        try { await executeGameCommand(token.id, 'store_purchase', { goodsId: 1 }, '黑市购买1次物品') } catch (e) { console.warn('黑市购买失败', e) }
      }

      for (let taskId = 1; taskId <= 10; taskId++) {
        try { await executeGameCommand(token.id, 'task_claimdailypoint', { taskId }, `领取任务奖励${taskId}`, 5000) } catch (e) { console.warn('领取任务奖励失败', e) }
      }

      try { await executeGameCommand(token.id, 'task_claimdailyreward', {}, '领取日常任务奖励') } catch (e) { console.warn('日常奖励领取失败', e) }
      try { await executeGameCommand(token.id, 'task_claimweekreward', {}, '领取周常任务奖励') } catch (e) { console.warn('周常奖励领取失败', e) }

      await waitForSeconds(10)
      tokenStore.closeWebSocketConnection(token.id)
      if (message && message.success) message.success(`${token.name} 执行任务完成`)

    } catch (error) {
      console.error('BulkDailyTask 处理 token 失败:', token.id, error)
    }
  }

  console.info('BulkDailyTask 执行完成')
}

export { performBulkDailyTask, getTodayBossId, loadDailyTaskSettings, isTodayAvailable }
