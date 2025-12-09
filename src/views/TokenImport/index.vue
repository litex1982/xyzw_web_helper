<template>
  <div class="token-import-page">
    <div class="container">
      <!-- 页面头部 -->
      <div class="page-header">
        <div class="header-content">
          <div class="header-top">
            <img src="/icons/xiaoyugan.png" alt="XYZW" class="brand-logo">
            <!-- 主题切换按钮 -->
            <ThemeToggle />
          </div>
          <h1>游戏Token管理</h1>
        </div>
      </div>

      <!-- Token导入区域 -->
      <a-modal v-model:visible="showImportForm" width="40rem" :footer="false" :default-visible="!tokenStore.hasTokens">
        <template #title>
          <h2>
            <n-icon>
              <Add />
            </n-icon>
            添加游戏Token
          </h2>
        </template>
        <div class="card-header">
          <!-- 导入方式选择 -->
          <n-radio-group v-model:value="importMethod" class="import-method-tabs" size="small">
            <n-radio-button value="manual">
              手动输入
            </n-radio-button>
            <n-radio-button value="url">
              URL获取
            </n-radio-button>
            <n-radio-button value="bin">
              BIN获取
            </n-radio-button>
          </n-radio-group>
        </div>
        <div class="card-body">
          <manual-token-form @cancel="() => showImportForm = false" @ok="() => showImportForm = false"
            v-if="importMethod === 'manual'" />
          <url-token-form @cancel="() => showImportForm = false" @ok="() => showImportForm = false"
            v-if="importMethod === 'url'" />
          <bin-token-form @cancel="() => showImportForm = false" @ok="() => showImportForm = false"
            v-if="importMethod === 'bin'" />
        </div>
      </a-modal>

      <!-- Token列表 -->
      <div v-if="tokenStore.hasTokens" class="tokens-section">
        <div class="section-header">
          <h2>我的Token列表 ({{ tokenStore.gameTokens.length }}个)</h2>
          <div class="header-actions">
            <n-button v-if="tokenStore.selectedToken" type="success" @click="goToDashboard">
              <template #icon>
                <n-icon>
                  <Home />
                </n-icon>
              </template>
              返回控制台
            </n-button>

            <n-button v-if="!showImportForm" type="primary" @click="showImportForm = true">
              <template #icon>
                <n-icon>
                  <Add />
                </n-icon>
              </template>
              添加Token
            </n-button>

            <n-dropdown :options="bulkOptions" @select="handleBulkAction">
              <n-button>
                <template #icon>
                  <n-icon>
                    <Menu />
                  </n-icon>
                </template>
                批量操作
              </n-button>
            </n-dropdown>
          </div>
        </div>

        <div class="tokens-grid">
          <a-card v-for="token in tokenStore.gameTokens" :key="token.id" :class="{
            'token-card': true,
            active: selectedTokenId === token.id
          }" @click="selectToken(token)">
            <template #title>
              <a-space class="token-name">
                {{ token.name }}
                <a-tag color="red" v-if="token.server">{{ token.server }}</a-tag>
                <!-- 连接状态指示器 -->
                <a-badge :status="getTokenStyle(token.id)" :text="getConnectionStatusText(token.id)" />
                <!-- 连接状态文字 -->
                <!-- <a-tag color="green">
                  {{ getConnectionStatusText(token.id) }}
                </a-tag> -->
              </a-space>
            </template>
            <template #extra>
              <n-dropdown :options="getTokenActions(token)" @select="(key) => handleTokenAction(key, token)">
                <n-button text>
                  <template #icon>
                    <n-icon>
                      <EllipsisHorizontal />
                    </n-icon>
                  </template>
                </n-button>
              </n-dropdown>
            </template>

            <template #default>
              <div class="token-display">
                <span class="token-label">Token:</span>
                <code class="token-value">{{ maskToken(token.token) }}</code>
              </div>
              <a-button :loading="refreshingTokens.has(token.id)" @click.stop="refreshToken(token)">
                <template #icon>
                  <n-icon>
                    <Refresh />
                  </n-icon>
                </template>
                {{ token.sourceUrl ? '刷新' : '重新获取' }}
              </a-button>

              <div class="token-timestamps">
                <div class="timestamp-item">
                  <span class="timestamp-label">创建：</span>
                  <span class="timestamp-value">{{ formatTime(token.createdAt) }}</span>
                </div>
                <div class="timestamp-item">
                  <span class="timestamp-label">使用：</span>
                  <span class="timestamp-value">{{ formatTime(token.lastUsed) }}</span>
                </div>
              </div>

              <!-- 存储类型信息 -->
              <div class="storage-info">
                <div class="storage-item">
                  <span class="storage-label">存储类型：</span>
                  <n-tag size="small" :type="token.importMethod === 'url' ? 'success' : 'warning'">
                    {{ token.importMethod === 'url' ? '长期有效' : '临时存储' }}
                  </n-tag>
                </div>

                <!-- 升级选项（仅对临时存储的token显示） -->
                <div v-if="token.importMethod !== 'url'" class="storage-upgrade">
                  <n-button size="tiny" type="success" ghost @click.stop="upgradeTokenToPermanent(token)">
                    <template #icon>
                      <n-icon>
                        <Star />
                      </n-icon>
                    </template>
                    升级为长期有效
                  </n-button>
                </div>
              </div>
            </template>
            <template #actions>
              <n-button type="primary" size="large" block :loading="connectingTokens.has(token.id)"
                @click="startTaskManagement(token)">
                <template #icon>
                  <n-icon>
                    <Home />
                  </n-icon>
                </template>
                开始任务管理
              </n-button>
            </template>
          </a-card>
        </div>
      </div>

      <!-- 空状态 -->
      <a-empty v-if="!tokenStore.hasTokens && !showImportForm">
        <template #image>
          <i class="mdi:bed-empty"></i>
        </template>
        还没有导入任何Token
      </a-empty>
    </div>

    <!-- 编辑Token模态框 -->
    <n-modal v-model:show="showEditModal" preset="card" title="编辑Token" style="width: 500px">
      <n-form ref="editFormRef" :model="editForm" :rules="editRules" label-placement="left" label-width="80px">
        <n-form-item label="名称" path="name">
          <n-input v-model:value="editForm.name" />
        </n-form-item>
        <n-form-item label="Token字符串" path="token">
          <n-input v-model:value="editForm.token" type="textarea" :rows="3" placeholder="粘贴Token字符串..." clearable />
        </n-form-item>
        <n-form-item label="服务器">
          <n-input v-model:value="editForm.server" />
        </n-form-item>
        <n-form-item label="WebSocket地址">
          <n-input v-model:value="editForm.wsUrl" />
        </n-form-item>
      </n-form>

      <template #footer>
        <div class="modal-actions">
          <n-button @click="showEditModal = false">
            取消
          </n-button>
          <n-button type="primary" @click="saveEdit">
            保存
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>

import ManualTokenForm from './manual.vue'
import UrlTokenForm from './url.vue'
import BinTokenForm from './bin.vue'

import { useTokenStore, selectedTokenId } from '@/stores/tokenStore'
import {
  Add,
  Copy,
  Create,
  EllipsisHorizontal,
  Home,
  Key,
  Menu,
  Refresh,
  Star,
  SyncCircle,
  TrashBin
} from '@vicons/ionicons5'
import { NIcon, useDialog, useMessage } from 'naive-ui'
import { h, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

// 接收路由参数
const props = defineProps({
  token: String,
  name: String,
  server: String,
  wsUrl: String,
  api: String,
  auto: Boolean
})

const router = useRouter()
const message = useMessage()
const dialog = useDialog()
const tokenStore = useTokenStore()

// 响应式数据
const showImportForm = ref(false)
const isImporting = ref(false)
const showEditModal = ref(false)
const importFormRef = ref(null)
const urlFormRef = ref(null)
const editFormRef = ref(null)
const editingToken = ref(null)
const importMethod = ref('manual')
const refreshingTokens = ref(new Set())
const connectingTokens = ref(new Set())

// 编辑表单
const editForm = reactive({
  name: '',
  token: '',
  server: '',
  wsUrl: ''
})

const editRules = {
  name: [
    { required: true, message: '请输入Token名称', trigger: 'blur' }
  ],
  token: [
    { required: true, message: '请输入Token字符串', trigger: 'blur' }
  ]
}


const bulkOptions = [
  { label: '导出所有Token', key: 'export' },
  { label: '导入Token文件', key: 'import' },
  { label: '清理过期Token', key: 'clean' },
  { label: '断开所有连接', key: 'disconnect' },
  { label: '清除所有Token', key: 'clear' },
  { label: '批量日常', key: 'BulkDaily' }
]

// 任务设置
const settings = reactive({
  arenaFormation: 1,
  bossFormation: 1,
  bossTimes: 2,
  claimBottle: true,
  payRecruit: false,
  openBox: true,
  arenaEnable: false,
  claimHangUp: true,
  claimEmail: true,
  blackMarketPurchase: false
})

// 每日任务列表
const tasks = ref([
  { id: 1, name: '登录一次游戏', completed: false, loading: false },
  { id: 2, name: '分享一次游戏', completed: false, loading: false },
  { id: 3, name: '赠送好友3次金币', completed: false, loading: false },
  { id: 4, name: '进行2次招募', completed: false, loading: false },
  { id: 5, name: '领取5次挂机奖励', completed: false, loading: false },
  { id: 6, name: '进行3次点金', completed: false, loading: false },
  { id: 7, name: '开启3次宝箱', completed: false, loading: false },
  { id: 12, name: '黑市购买1次物品（请设置采购清单）', completed: false, loading: false },
  { id: 13, name: '进行1场竞技场战斗', completed: false, loading: false },
  { id: 14, name: '收获1个任意盐罐', completed: false, loading: false }
])

// 刷新Token
const refreshToken = async (token) => {
  refreshingTokens.value.add(token.id)

  try {
    if (token.sourceUrl) {
      // 有源URL的token - 从URL重新获取
      let response

      const isLocalUrl = token.sourceUrl.startsWith(window.location.origin) ||
        token.sourceUrl.startsWith('/') ||
        token.sourceUrl.startsWith('http://localhost') ||
        token.sourceUrl.startsWith('http://127.0.0.1')

      if (isLocalUrl) {
        response = await fetch(token.sourceUrl)
      } else {
        try {
          response = await fetch(token.sourceUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
            mode: 'cors'
          })
        } catch (corsError) {
          throw new Error(`跨域请求被阻止。请确保目标服务器支持CORS。错误详情: ${corsError.message}`)
        }
      }

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      if (!data.token) {
        throw new Error('返回数据中未找到token字段')
      }

      // 更新token信息
      tokenStore.updateToken(token.id, {
        token: data.token,
        server: data.server || token.server,
        lastRefreshed: Date.now()
      })

      message.success('Token刷新成功')
    } else {
      // 没有源URL的token - 提示用户手动处理
      dialog.info({
        title: '重新获取Token',
        content: `Token "${token.name}" 是手动导入的，没有配置自动刷新地址。

请选择以下操作：
1. 重新手动导入新的Token
2. 尝试重新连接现有Token`,
        positiveText: '重新导入',
        negativeText: '重新连接',
        onPositiveClick: () => {
          showImportForm.value = true
          importMethod.value = 'manual'
          importForm.name = token.name
          importForm.server = token.server
          importForm.wsUrl = token.wsUrl
        },
        onNegativeClick: () => {
          // 断开现有连接
          if (tokenStore.getWebSocketStatus(token.id) === 'connected') {
            tokenStore.closeWebSocketConnection(token.id)
          }

          // 尝试重新连接
          setTimeout(() => {
            tokenStore.createWebSocketConnection(token.id, token.token, token.wsUrl)
            console.log('正在尝试重新连接...')
          }, 500)
        }
      })
      return
    }

    // 如果当前token有连接，需要重新连接
    if (tokenStore.getWebSocketStatus(token.id) === 'connected') {
      tokenStore.closeWebSocketConnection(token.id)
      setTimeout(() => {
        tokenStore.createWebSocketConnection(token.id, token.token, token.wsUrl)
      }, 500)
    }

  } catch (error) {
    console.error('刷新Token失败:', error)
    message.error(error.message || 'Token刷新失败')
  } finally {
    refreshingTokens.value.delete(token.id)
  }
}

// 升级Token为长期有效
const upgradeTokenToPermanent = (token) => {
  dialog.warning({
    title: '升级为长期有效',
    content: `确认要将Token "${token.name}" 升级为长期有效吗？升级后该Token将不会因24小时未使用而被自动清理。`,
    positiveText: '确认升级',
    negativeText: '取消',
    onPositiveClick: () => {
      const success = tokenStore.upgradeTokenToPermanent(token.id)
      if (success) {
        message.success(`Token "${token.name}" 已升级为长期有效！`)
      } else {
        message.error('升级失败，该Token可能已经是长期有效状态')
      }
    }
  })
}

const selectToken = (token, forceReconnect = false) => {
  const isAlreadySelected = selectedTokenId.value === token.id
  const connectionStatus = getConnectionStatus(token.id)

  // 降噪日志已移除

  // 如果已经选中且已连接，不执行任何操作
  if (isAlreadySelected && connectionStatus === 'connected' && !forceReconnect) {
    console.log(`${token.name} 已选中且已连接`)
    return
  }

  // 如果已经选中但正在连接，也不执行操作
  if (isAlreadySelected && connectionStatus === 'connecting' && !forceReconnect) {
    console.log(`${token.name} 正在连接中...`)
    return
  }

  // 选择token（带智能连接判断）
  const result = tokenStore.selectToken(token.id, forceReconnect)

  if (result) {
    if (forceReconnect) {
      message.success(`强制重连：${token.name}`)
    } else if (isAlreadySelected) {
      message.success(`重新连接：${token.name}`)
    } else {
      message.success(`已选择：${token.name}`)
    }
  } else {
    message.error(`选择Token失败：${token.name}`)
  }
}

const getConnectionStatus = (tokenId) => {
  return tokenStore.getWebSocketStatus(tokenId)
}

const getConnectionStatusText = (tokenId) => {
  const status = getConnectionStatus(tokenId)
  const statusMap = {
    'connected': '已连接',
    'connecting': '连接中...',
    'disconnected': '已断开',
    'error': '连接错误',
    'disconnecting': '断开中...'
  }
  return statusMap[status] || '未连接'
}


const getTokenStyle = (tokenId) => {
  const status = getConnectionStatus(tokenId)
  const statusMap = {
    'connected': 'success',
    'connecting': 'processing',
    'disconnected': 'normal',
    'error': 'danger',
    'disconnecting': 'warning'
  }
  return statusMap[status] || 'normal'
}


const getTokenActions = (token) => {
  const actions = [
    {
      label: '编辑',
      key: 'edit',
      icon: () => h(NIcon, null, { default: () => h(Create) })
    },
    {
      label: '复制Token',
      key: 'copy',
      icon: () => h(NIcon, null, { default: () => h(Copy) })
    }
  ]

  // 根据Token类型添加刷新选项
  if (token.importMethod === 'url' && token.sourceUrl) {
    actions.push({
      label: '从URL刷新',
      key: 'refresh-url',
      icon: () => h(NIcon, null, { default: () => h(SyncCircle) })
    })
  } else {
    actions.push({
      label: '重新获取',
      key: 'refresh',
      icon: () => h(NIcon, null, { default: () => h(Refresh) })
    })
  }

  actions.push(
    { type: 'divider' },
    {
      label: '删除',
      key: 'delete',
      icon: () => h(NIcon, null, { default: () => h(TrashBin) }),
      props: { style: { color: '#e74c3c' } }
    }
  )

  return actions
}

const handleTokenAction = async (key, token) => {
  switch (key) {
    case 'edit':
      editToken(token)
      break
    case 'copy':
      copyToken(token)
      break
    case 'refresh':
      // 重新获取Token
      refreshToken(token)
      break
    case 'refresh-url':
      // URL获取的Token刷新
      refreshToken(token)
      break
    case 'delete':
      deleteToken(token)
      break
  }
}

const editToken = (token) => {
  editingToken.value = token
  Object.assign(editForm, {
    name: token.name,
    token: token.token,
    server: token.server || '',
    wsUrl: token.wsUrl || '',
  })
  showEditModal.value = true
}

const saveEdit = async () => {
  if (!editFormRef.value || !editingToken.value) return

  try {
    await editFormRef.value.validate()

    tokenStore.updateToken(editingToken.value.id, {
      name: editForm.name,
      token: editForm.token,
      server: editForm.server,
      wsUrl: editForm.wsUrl
    })

    message.success('Token信息已更新')
    showEditModal.value = false
    editingToken.value = null
  } catch (error) {
    // 验证失败
  }
}

const copyToken = async (token) => {
  try {
    await navigator.clipboard.writeText(token.token)
    message.success('Token已复制到剪贴板')
  } catch (error) {
    message.error('复制失败')
  }
}


const deleteToken = (token) => {
  dialog.warning({
    title: '删除Token',
    content: `确定要删除Token "${token.name}" 吗？此操作无法恢复。`,
    positiveText: '确定删除',
    negativeText: '取消',
    onPositiveClick: () => {
      tokenStore.removeToken(token.id)
      message.success('Token已删除')
    }
  })
}

const handleBulkAction = (key) => {
  switch (key) {
    case 'export':
      exportTokens()
      break
    case 'import':
      importTokenFile()
      break
    case 'clean':
      cleanExpiredTokens()
      break
    case 'disconnect':
      disconnectAll()
      break
    case 'clear':
      clearAllTokens()
      break
    case 'BulkDaily':
      BulkDailyTask()
      break
  }
}

const exportTokens = () => {
  try {
    const data = tokenStore.exportTokens()
    const dataStr = JSON.stringify(data, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })

    const link = document.createElement('a')
    link.href = URL.createObjectURL(dataBlob)
    link.download = `tokens_backup_${new Date().toISOString().split('T')[0]}.json`
    link.click()

    message.success('Token数据已导出')
  } catch (error) {
    message.error('导出失败')
  }
}

const importTokenFile = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result)
          const result = tokenStore.importTokens(data)
          if (result.success) {
            message.success(result.message)
          } else {
            message.error(result.message)
          }
        } catch (error) {
          message.error('文件格式错误')
        }
      }
      reader.readAsText(file)
    }
  }
  input.click()
}

const cleanExpiredTokens = () => {
  const count = tokenStore.cleanExpiredTokens()
  message.success(`已清理 ${count} 个过期Token`)
}

const disconnectAll = () => {
  tokenStore.gameTokens.forEach(token => {
    tokenStore.closeWebSocketConnection(token.id)
  })
  message.success('所有连接已断开')
}

const clearAllTokens = () => {
  dialog.error({
    title: '清除所有Token',
    content: '确定要清除所有Token吗？此操作无法恢复！',
    positiveText: '确定清除',
    negativeText: '取消',
    onPositiveClick: () => {
      tokenStore.clearAllTokens()
      message.success('所有Token已清除')
    }
  })
}

// 简单的暂停函数：等待指定秒数后继续（默认 20 秒，单位为秒）
const waitForSeconds = (seconds = 20) => {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, seconds) * 1000)
  })
}


// 等待某个 token 的连接状态变更到期望状态（轮询），超时则 reject
const waitForConnectionStatus = (tokenId, desiredStatus = 'connected', { interval = 500, timeout = 15000 } = {}) => {
  return new Promise((resolve, reject) => {
    const start = Date.now()

    const check = () => {
      const status = getConnectionStatus(tokenId)
      if (status === desiredStatus) return resolve(status)
      if (Date.now() - start >= timeout) return reject(new Error(`等待状态 "${desiredStatus}" 超时 (${timeout}ms)`))
      setTimeout(check, interval)
    }

    check()
  })
}

// 对单个 token 串行处理：选择 -> 等待连接 -> 执行任务（可选断开）
const processTokensForDailyTask = async (token) => {
  try {
    // 发起选择/连接（使用组件内的 selectToken 以保留提示逻辑）
    try {
      selectToken(token)
    } catch (e) {
      // selectToken 通常是同步的；忽略其错误，继续等待连接
      console.warn('selectToken 抛出异常（可忽略）', e)
    }

    // 强制等待连接成功；超时则视为失败并中止批量操作
    try {
      await waitForConnectionStatus(token.id, 'connected', { interval: 500, timeout: 15000 })
      message.success(`${token.name} 已连接，开始执行任务`)
    } catch (err) {
      message.error(`${token.name} 连接超时：${err.message}`)
      return { success: false, tokenId: token.id, error: err }
    }

    // TODO: 在这里放置针对已连接 token 的实际任务，例如：
    // 1. 获取角色信息
    await runDailyFix();
    // await performDailyTasksForSelectedToken() // 必须返回 Promise
    await waitForSeconds(10);// 等待10秒以确保断开完成
    // 任务完成后断开连接以节省资源
    tokenStore.closeWebSocketConnection(token.id)

    return { success: true, tokenId: token.id }
  } catch (error) {
    console.error('处理 token 失败', token.id, error)
    return { success: false, tokenId: token.id, error }
  }
}

// 对单个 token 串行处理：选择 -> 等待连接 -> 执行任务（可选断开）
const processTokensForHourlyTask = async (token) => {
  try {
    // 发起选择/连接（使用组件内的 selectToken 以保留提示逻辑）
    try {
      selectToken(token)
    } catch (e) {
      // selectToken 通常是同步的；忽略其错误，继续等待连接
      console.warn('selectToken 抛出异常（可忽略）', e)
    }

    // 强制等待连接成功；超时则视为失败并中止批量操作
    try {
      await waitForConnectionStatus(token.id, 'connected', { interval: 500, timeout: 15000 })
      message.success(`${token.name} 已连接，开始执行任务`)
    } catch (err) {
      message.error(`${token.name} 连接超时：${err.message}`)
      return { success: false, tokenId: token.id, error: err }
    }

    // TODO: 在这里放置针对已连接 token 的实际任务，例如：
    handleBottleHelper();
    await waitForSeconds(2);
    await extendHangUp();
    await waitForSeconds(2);
    await claimHangUpReward();
    // await performDailyTasksForSelectedToken() // 必须返回 Promise
    await waitForSeconds(10);// 等待10秒以确保断开完成
    // 任务完成后断开连接以节省资源
    tokenStore.closeWebSocketConnection(token.id)

    return { success: true, tokenId: token.id }
  } catch (error) {
    console.error('处理 token 失败', token.id, error)
    return { success: false, tokenId: token.id, error }
  }
}

const handleBottleHelper = () => {
  if (!tokenStore.selectedToken) {
    message.warning('请先选择Token')
    return
  }
  const tokenId = tokenStore.selectedToken.id
  tokenStore.sendMessage(tokenId, 'bottlehelper_stop')
  setTimeout(() => {
    tokenStore.sendMessage(tokenId, 'bottlehelper_start')
    tokenStore.sendMessage(tokenId, 'role_getroleinfo')
  }, 500)
  console.log('重启盐罐机器人')
}

const extendHangUp = async () => {
  if (!tokenStore.selectedToken) return message.warning('请先选择Token')
  const tokenId = tokenStore.selectedToken.id
  try {
    console.log('正在加钟...')
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
      message.success('加钟操作已完成，请查看挂机剩余时间')
    }, 2500)
  } catch (e) {
    message.error('加钟操作失败: ' + (e?.message || '未知错误'))
  }
}

const claimHangUpReward = async () => {
  if (!tokenStore.selectedToken) return message.warning('请先选择Token')
  const tokenId = tokenStore.selectedToken.id
  try {
    console.log('正在领取挂机奖励...')
    tokenStore.sendMessage(tokenId, 'system_mysharecallback')
    setTimeout(() => tokenStore.sendMessage(tokenId, 'system_claimhangupreward'), 200)
    setTimeout(() => tokenStore.sendMessage(tokenId, 'system_mysharecallback', { isSkipShareCard: true, type: 2 }), 400)
    setTimeout(() => tokenStore.sendMessage(tokenId, 'role_getroleinfo'), 600)
    setTimeout(() => {
      message.success('挂机奖励领取完成')
    }, 1200)
  } catch (e) {
    message.error('领取挂机奖励失败: ' + (e?.message || '未知错误'))
  }
}

// 串行遍历 tokens：仅在当前 token 连接成功后才继续下一个
const BulkHourlyTask = async () => {
  for (const token of tokenStore.gameTokens) {
    const res = await processTokensForHourlyTask(token)
    if (!res.success) {
      // 如果某个 token 无法连接，停止整个批量流程并提示（可按需改为跳过继续）
      message.error(`在处理 ${token.name} 时发生错误，已中止批量操作`)
      //return
    }

    await waitForSeconds(10);// 等待10秒防止账号切换过快
  }

  message.success('批量日常处理完成（已串行执行）')
}

// 串行遍历 tokens：仅在当前 token 连接成功后才继续下一个
const BulkDailyTask = async () => {
  for (const token of tokenStore.gameTokens) {
    const res = await processTokensForDailyTask(token)
    if (!res.success) {
      // 如果某个 token 无法连接，停止整个批量流程并提示（可按需改为跳过继续）
      message.error(`在处理 ${token.name} 时发生错误，已中止批量操作`)
      //return
    }

    await waitForSeconds(10);// 等待10秒防止账号切换过快
  }

  message.success('批量日常处理完成（已串行执行）')
}

// --- 调度器: 每 5 分钟检查一次，若发现某指定时间点未执行则执行一次，并记录到 localStorage ---
const scheduledCheckerTimer = ref(null)
const isScheduledRunning = ref(false)
// 检查间隔：1 分钟
const CHECK_INTERVAL_MS = 1 * 60 * 1000
// 要保证执行的时间点（24 小时制小时数）
const SCHEDULE_HOURS = [1, 7, 13, 19]
// localStorage key（带版本号以便未来迁移）
const STORAGE_KEY = 'bulkDailyRunRecords_v1'

// 从 localStorage 读取记录，格式: { "YYYY-MM-DD": [1,7], ... }
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
  return arr.includes(hour)
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

// 检查并执行尚未执行的时段（顺序执行，避免并行）
const checkAndRunScheduled = async () => {
  if (isScheduledRunning.value) return
  isScheduledRunning.value = true

  try {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)

    console.log(`检查定点任务: ${now}`)

    // 收集所有满足: 当前时间 >= 指定时点 && 当天未执行 的时段
    const toRun = SCHEDULE_HOURS.filter(h => {
      const scheduled = new Date(now)
      scheduled.setHours(h, 0, 0, 0)
      return now >= scheduled && !hasRun(today, h)
    })

    if (toRun.length === 0) return

    // 依次执行每个未执行的时段任务
    for (const h of toRun) {
      try {
        console.log(`触发定点任务: ${today} ${h}:00`)
        await BulkHourlyTask()
        markRun(today, h)
        // 每次执行后短暂停（避免过快连跑）
        await waitForSeconds(1)
      } catch (e) {
        console.error('执行 BulkHourlyTask 失败，稍后将重试', e)
        // 如果失败不记录，下一次检查时会重试
      }
    }
  } finally {
    isScheduledRunning.value = false
  }
}

const startScheduledBulkHourly = (startImmediately = false) => {
  if (scheduledCheckerTimer.value) return

  if (startImmediately) {
    // 先立即检查一次
    checkAndRunScheduled().catch(e => console.error(e))
  }

  scheduledCheckerTimer.value = setInterval(() => {
    checkAndRunScheduled().catch(e => console.error(e))
  }, CHECK_INTERVAL_MS)

  message.info(`定时检查已启动：每 ${Math.floor(CHECK_INTERVAL_MS / 60000)} 分钟检查一次，确保执行时段 ${SCHEDULE_HOURS.join(', ')} 点`) 
}

const stopScheduledBulkHourly = () => {
  if (scheduledCheckerTimer.value) {
    clearInterval(scheduledCheckerTimer.value)
    scheduledCheckerTimer.value = null
    message.info('定时检查已停止')
  }
}

// 每日任务执行器
const executeDailyTasks = async (roleInfoResp, progressFn) => {
  const tokenId = tokenStore.selectedToken.id
  const roleData = roleInfoResp?.role

  if (!roleData) {
    throw new Error('角色数据不存在')
  }

  console.log('开始执行每日任务补差')

  // 检查已完成的任务
  const completedTasks = roleData.dailyTask?.complete ?? {}
  const isTaskCompleted = (taskId) => completedTasks[taskId] === -1

  // 统计数据
  const statistics = roleData.statistics ?? {}
  const statisticsTime = roleData.statisticsTime ?? {}

  // 构建任务列表
  const taskList = []

  // 1. 基础任务（根据完成状态决定是否执行）

  // 分享游戏 (任务ID: 2)
  if (!isTaskCompleted(2)) {
    taskList.push({
      name: '分享一次游戏',
      execute: () => executeGameCommand(tokenId, 'system_mysharecallback',
        { isSkipShareCard: true, type: 2 }, '分享游戏')
    })
  }

  // 赠送好友金币 (任务ID: 3)
  if (!isTaskCompleted(3)) {
    taskList.push({
      name: '赠送好友金币',
      execute: () => executeGameCommand(tokenId, 'friend_batch', {}, '赠送好友金币')
    })
  }

  // 招募 (任务ID: 4)
  if (!isTaskCompleted(4)) {
    taskList.push({
      name: '免费招募',
      execute: () => executeGameCommand(tokenId, 'hero_recruit',
        { recruitType: 3, recruitNumber: 1 }, '免费招募')
    })

    if (settings.payRecruit) {
      taskList.push({
        name: '付费招募',
        execute: () => executeGameCommand(tokenId, 'hero_recruit',
          { recruitType: 1, recruitNumber: 1 }, '付费招募')
      })
    }
  }

  // 点金 (任务ID: 6)
  if (!isTaskCompleted(6) && isTodayAvailable(statisticsTime['buy:gold'])) {
    for (let i = 0; i < 3; i++) {
      taskList.push({
        name: `免费点金 ${i + 1}/3`,
        execute: () => executeGameCommand(tokenId, 'system_buygold',
          { buyNum: 1 }, `免费点金 ${i + 1}`)
      })
    }
  }

  // 挂机奖励 (任务ID: 5)
  if (!isTaskCompleted(5) && settings.claimHangUp) {
    // 先加钟4次
    for (let i = 0; i < 4; i++) {
      taskList.push({
        name: `挂机加钟 ${i + 1}/4`,
        execute: () => executeGameCommand(tokenId, 'system_mysharecallback',
          { isSkipShareCard: true, type: 2 }, `挂机加钟 ${i + 1}`)
      })
    }

    // 然后领取奖励
    taskList.push({
      name: '领取挂机奖励',
      execute: () => executeGameCommand(tokenId, 'system_claimhangupreward', {}, '领取挂机奖励')
    })

    // 最后再加1次钟
    taskList.push({
      name: '挂机加钟 5/5',
      execute: () => executeGameCommand(tokenId, 'system_mysharecallback',
        { isSkipShareCard: true, type: 2 }, '挂机加钟 5')
    })
  }

  // 开宝箱 (任务ID: 7)
  if (!isTaskCompleted(7) && settings.openBox) {
    taskList.push({
      name: '开启木质宝箱',
      execute: () => executeGameCommand(tokenId, 'item_openbox',
        { itemId: 2001, number: 10 }, '开启木质宝箱10个')
    })
  }

  // 盐罐 (任务ID: 14)
  if (!isTaskCompleted(14) && settings.claimBottle) {
    taskList.push({
      name: '领取盐罐奖励',
      execute: () => executeGameCommand(tokenId, 'bottlehelper_claim', {}, '领取盐罐奖励')
    })
  }

  // 2. 竞技场 (任务ID: 13)
  if (!isTaskCompleted(13) && settings.arenaEnable) {
    taskList.push({
      name: '竞技场战斗',
      execute: async () => {
        console.log('开始竞技场战斗流程')

        if (new Date().getHours() < 8) {
          console.log('当前时间未到8点，跳过竞技场战斗', 'warning')
          return
        }

        if (new Date().getHours() > 22) {
          console.log('当前时间已过22点，跳过竞技场战斗', 'warning')
          return
        }

        // 智能切换到竞技场阵容
        await switchToFormationIfNeeded(tokenId, settings.arenaFormation, '竞技场阵容')

        // 开始竞技场
        await executeGameCommand(tokenId, 'arena_startarea', {}, '开始竞技场')

        // 进行3场战斗
        for (let i = 1; i <= 3; i++) {
          console.log(`竞技场战斗 ${i}/3`)

          // 获取目标
          let targets
          try {
            targets = await executeGameCommand(tokenId, 'arena_getareatarget',
              {}, `获取竞技场目标${i}`)
          } catch (err) {
            console.log(`竞技场战斗${i} - 获取对手失败: ${err.message}`, 'error')
            break
          }

          const targetId = pickArenaTargetId(targets)
          if (targetId) {
            await executeGameCommand(tokenId, 'fight_startareaarena',
              { targetId }, `竞技场战斗${i}`, 10000)
          } else {
            console.log(`竞技场战斗${i} - 未找到目标`, 'warning')
          }

          // 战斗间隔
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    })
  }

  // 3. BOSS战斗
  if (settings.bossTimes > 0) {
    // 军团BOSS
    const alreadyLegionBoss = statistics['legion:boss'] ?? 0
    const remainingLegionBoss = Math.max(settings.bossTimes - alreadyLegionBoss, 0)

    if (remainingLegionBoss > 0) {
      // 为军团BOSS智能切换阵容
      taskList.push({
        name: '军团BOSS阵容检查',
        execute: () => switchToFormationIfNeeded(tokenId, settings.bossFormation, 'BOSS阵容')
      })

      for (let i = 0; i < remainingLegionBoss; i++) {
        taskList.push({
          name: `军团BOSS ${i + 1}/${remainingLegionBoss}`,
          execute: () => executeGameCommand(tokenId, 'fight_startlegionboss', {}, `军团BOSS ${i + 1}`, 12000)
        })
      }
    }

    // 每日BOSS
    const todayBossId = getTodayBossId()
    if (remainingLegionBoss === 0) {
      // 如果没有军团BOSS，为每日BOSS切换阵容
      taskList.push({
        name: '每日BOSS阵容检查',
        execute: () => switchToFormationIfNeeded(tokenId, settings.bossFormation, 'BOSS阵容')
      })
    }

    for (let i = 0; i < 3; i++) {
      taskList.push({
        name: `每日BOSS ${i + 1}/3`,
        execute: () => executeGameCommand(tokenId, 'fight_startboss',
          { bossId: todayBossId }, `每日BOSS ${i + 1}`, 12000)
      })
    }
  }

  // 4. 固定奖励领取
  const fixedRewards = [
    { name: '福利签到', cmd: 'system_signinreward' },
    { name: '俱乐部', cmd: 'legion_signin' },
    { name: '领取每日礼包', cmd: 'discount_claimreward' },
    { name: '领取每日免费奖励', cmd: 'collection_claimfreereward' },
    { name: '领取免费礼包', cmd: 'card_claimreward' },
    { name: '领取永久卡礼包', cmd: 'card_claimreward', params: { cardId: 4003 } }
  ]

  if (settings.claimEmail) {
    fixedRewards.push({ name: '领取邮件奖励', cmd: 'mail_claimallattachment' })
  }

  fixedRewards.forEach(reward => {
    taskList.push({
      name: reward.name,
      execute: () => executeGameCommand(tokenId, reward.cmd, reward.params || {}, reward.name)
    })
  })

  // 5. 免费活动
  // 免费钓鱼
  if (isTodayAvailable(statisticsTime['artifact:normal:lottery:time'])) {
    for (let i = 0; i < 3; i++) {
      taskList.push({
        name: `免费钓鱼 ${i + 1}/3`,
        execute: () => executeGameCommand(tokenId, 'artifact_lottery',
          { lotteryNumber: 1, newFree: true, type: 1 }, `免费钓鱼 ${i + 1}`)
      })
    }
  }

  // 灯神免费扫荡
  const kingdoms = ['魏国', '蜀国', '吴国', '群雄']
  for (let gid = 1; gid <= 4; gid++) {
    if (isTodayAvailable(statisticsTime[`genie:daily:free:${gid}`])) {
      taskList.push({
        name: `${kingdoms[gid - 1]}灯神免费扫荡`,
        execute: () => executeGameCommand(tokenId, 'genie_sweep',
          { genieId: gid }, `${kingdoms[gid - 1]}灯神免费扫荡`)
      })
    }
  }

  // 灯神免费扫荡卷
  for (let i = 0; i < 3; i++) {
    taskList.push({
      name: `领取免费扫荡卷 ${i + 1}/3`,
      execute: () => executeGameCommand(tokenId, 'genie_buysweep', {}, `领取免费扫荡卷 ${i + 1}`)
    })
  }

  // 6. 黑市购买任务 (任务ID: 12)
  if (!isTaskCompleted(12) && settings.blackMarketPurchase) {
    taskList.push({
      name: '黑市购买1次物品',
      execute: () => executeGameCommand(tokenId, 'store_purchase', { goodsId: 1 }, '黑市购买1次物品')
    })
  }

  // 7. 任务奖励领取
  for (let taskId = 1; taskId <= 10; taskId++) {
    taskList.push({
      name: `领取任务奖励${taskId}`,
      execute: () => executeGameCommand(tokenId, 'task_claimdailypoint',
        { taskId }, `领取任务奖励${taskId}`, 5000)
    })
  }

  // 日常和周常奖励
  taskList.push(
    {
      name: '领取日常任务奖励',
      execute: () => executeGameCommand(tokenId, 'task_claimdailyreward', {}, '领取日常任务奖励')
    },
    {
      name: '领取周常任务奖励',
      execute: () => executeGameCommand(tokenId, 'task_claimweekreward', {}, '领取周常任务奖励')
    }
  )

  // 执行任务列表
  const totalTasks = taskList.length
  console.log(`共有 ${totalTasks} 个任务待执行`)

  for (let i = 0; i < taskList.length; i++) {
    const task = taskList[i]

    try {
      await task.execute()

      // 更新进度
      const progress = Math.floor(((i + 1) / totalTasks) * 100)
      if (progressFn) progressFn(tokenId, progress)

      // 任务间隔
      await new Promise(resolve => setTimeout(resolve, 500))

    } catch (error) {
      console.log(`任务执行失败: ${task.name} - ${error.message}`, 'error')
      // 继续执行下一个任务
    }
  }

  // 确保进度为100%
  if (progressFn) progressFn(tokenId, 100)
  console.log('所有任务执行完成', 'success')

  // 最后刷新一次角色信息
  await new Promise(resolve => setTimeout(resolve, 2000))
  await refreshRoleInfo()
}

// 一键补差主函数
const runDailyFix = async () => {
  if (!tokenStore.selectedToken) {
    message.warning('没有选中Token或正在执行中')
    return
  }

  try {
    console.log('=== 开始执行一键补差任务 ===');


    // 1. 获取角色信息
    const roleInfo = await refreshRoleInfo()

    if (!roleInfo?.role) {
      throw new Error('获取角色信息失败或数据异常')
    }


    console.log(`当前每日任务进度: ${roleInfo.role.dailyTask?.dailyPoint || 0}/100`)

    // 2. 执行任务
    console.log('第二步: 开始执行每日任务...')
    await executeDailyTasks(roleInfo, (tokenId, progress) => {
      console.log(`任务进度: ${progress}%`)
    })

    console.log('=== 任务执行完成 ===', 'success')
    message.success('每日任务补差执行完成')

    // 3. 最终刷新角色信息
    setTimeout(async () => {
      try {
        await refreshRoleInfo()
        console.log('最终角色信息刷新完成', 'success')
      } catch (error) {
        console.log(`最终刷新失败: ${error.message}`, 'warning')
      }
    }, 3000)

  } catch (error) {
    console.log(`任务执行失败: ${error.message}`, 'error')
    console.error('详细错误信息:', error)
    message.error(`任务执行失败: ${error.message}`)
  } 
}

// 刷新角色信息
const refreshRoleInfo = async () => {
  if (!tokenStore.selectedToken) {
    throw new Error('没有选中的Token')
  }

  const tokenId = tokenStore.selectedToken.id
  console.log('正在获取角色信息...')

  try {
    const response = await tokenStore.sendGetRoleInfo(tokenId)
    console.log('角色信息获取成功', 'success')

    // 同步任务状态
    if (response) {
      syncCompleteFromServer(response)
    }

    return response
  } catch (error) {
    message.error(`获取角色信息失败: ${error.message}`, 'error');
    throw error
  }
}

// 同步服务器任务完成状态
const syncCompleteFromServer = (resp) => {
  if (!resp?.role?.dailyTask?.complete) {
    console.log('角色信息中无任务完成数据', 'warning')
    return
  }

  const complete = resp.role.dailyTask.complete
  const isDone = (v) => v === -1

  console.log('开始同步任务完成状态...')
  console.log(`服务器返回的任务完成数据: ${JSON.stringify(complete)}`)

  let syncedCount = 0
  let completedCount = 0

  // 先重置所有任务为未完成，然后根据服务器数据更新
  tasks.value.forEach(task => {
    task.completed = false
  })

  // 同步服务器返回的完成状态
  Object.keys(complete).forEach(k => {
    const id = Number(k)
    const idx = tasks.value.findIndex(t => t.id === id)

    if (idx >= 0) {
      const isCompleted = isDone(complete[k])
      tasks.value[idx].completed = isCompleted
      syncedCount++

      if (isCompleted) {
        completedCount++
      }

      console.log(`任务${id} "${tasks.value[idx].name}": ${isCompleted ? '已完成' : '未完成'}`,
        isCompleted ? 'success' : 'info')
    } else {
      console.log(`服务器返回未知任务ID: ${id} (完成值: ${complete[k]})`, 'warning')
    }
  })



  console.log(`任务状态同步完成: ${completedCount}/${syncedCount} 已完成`)
}

// 检查是否今日可用（简化版本）
const isTodayAvailable = (statisticsTime) => {
  if (!statisticsTime) return true

  // 如果有时间戳，检查是否为今天
  const today = new Date().toDateString()
  const recordDate = new Date(statisticsTime).toDateString()

  return today !== recordDate
}

// 获取今日BOSS ID
const getTodayBossId = () => {
  const DAY_BOSS_MAP = [9904, 9905, 9901, 9902, 9903, 9904, 9905] // 周日~周六
  const dayOfWeek = new Date().getDay()
  return DAY_BOSS_MAP[dayOfWeek]
}


// 智能阵容切换辅助函数
const switchToFormationIfNeeded = async (tokenId, targetFormation, formationName) => {
  try {
    // 首先尝试从本地缓存获取当前阵容信息
    const cachedTeamInfo = tokenStore.gameData?.presetTeam?.presetTeamInfo
    let currentFormation = cachedTeamInfo?.useTeamId

    if (currentFormation) {
      console.log(`从缓存获取当前阵容: ${currentFormation}`)
    } else {
      // 缓存中没有数据，从服务器获取
      console.log(`缓存中无阵容信息，从服务器获取...`)
      const teamInfo = await executeGameCommand(tokenId, 'presetteam_getinfo', {}, '获取阵容信息')
      currentFormation = teamInfo?.presetTeamInfo?.useTeamId
      console.log(`从服务器获取当前阵容: ${currentFormation}`)
    }

    if (currentFormation === targetFormation) {
      console.log(`当前已是${formationName}${targetFormation}，无需切换`, 'success')
      return false // 不需要切换
    }

    console.log(`当前阵容: ${currentFormation}, 目标阵容: ${targetFormation}，开始切换...`)
    await executeGameCommand(tokenId, 'presetteam_saveteam',
      { teamId: targetFormation }, `切换到${formationName}${targetFormation}`)

    console.log(`成功切换到${formationName}${targetFormation}`, 'success')
    return true // 已切换
  } catch (error) {
    console.log(`阵容检查失败，直接切换: ${error.message}`, 'warning')
    // 如果检查失败，还是执行切换操作
    try {
      await executeGameCommand(tokenId, 'presetteam_saveteam',
        { teamId: targetFormation }, `强制切换到${formationName}${targetFormation}`)
      return true
    } catch (fallbackError) {
      console.log(`强制切换也失败: ${fallbackError.message}`, 'error')
      throw fallbackError
    }
  }
}

const maskToken = (token) => {
  if (!token) return ''
  const len = token.length
  if (len <= 8) return token
  return token.substring(0, 4) + '***' + token.substring(len - 4)
}

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleString('zh-CN')
}

const goToDashboard = () => {
  router.push('/admin/dashboard')
}

// 开始任务管理 - 包含连接探测
const startTaskManagement = async (token) => {

  connectingTokens.value.add(token.id)

  try {

    tokenStore.selectToken(token.id)

    // 1. 检查当前连接状态
    const connectionStatus = getConnectionStatus(token.id)

    if (connectionStatus === 'connected') {
      // 已连接，直接跳转
      message.success(`${token.name} 已连接，进入任务管理`)
      router.push('/admin/dashboard')
      return
    }

  } finally {
    connectingTokens.value.delete(token.id)
  }
}

// URL参数处理函数
const handleUrlParams = async () => {
  // 检查是否通过URL传递了token参数
  if (props.token || props.api) {
    try {
      isImporting.value = true
      let tokenResult = null

      if (props.api) {
        // 通过API获取token
        // 降噪
        console.log('正在从API获取token...')

        const response = await fetch(props.api, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          mode: 'cors'
        })

        if (!response.ok) {
          throw new Error(`API请求失败: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()

        if (!data.token) {
          throw new Error('API返回数据中未找到token字段')
        }

        // 使用API获取的token
        tokenResult = tokenStore.importBase64Token(
          props.name || data.name || '通过API导入的Token',
          data.token,
          {
            server: props.server || data.server,
            wsUrl: props.wsUrl,
            sourceUrl: props.api,
            importMethod: 'url'
          }
        )
      } else if (props.token) {
        // 直接使用URL中的token
        // 降噪
        console.log('正在导入token...')

        tokenResult = tokenStore.importBase64Token(
          props.name || '通过URL导入的Token',
          props.token,
          {
            server: props.server,
            wsUrl: props.wsUrl,
            importMethod: 'url'
          }
        )
      }

      if (tokenResult && tokenResult.success) {
        message.success(`Token "${tokenResult.tokenName}" 导入成功！`)

        // 如果auto=true，自动选择并跳转到控制台
        if (props.auto && tokenResult.token) {
          tokenStore.selectToken(tokenResult.token.id)
          message.success('正在跳转到控制台...')
          setTimeout(() => {
            router.push('/admin/dashboard')
          }, 1500)
        } else {
          // 清除URL参数，避免重复处理
          router.replace('/tokens')
        }
      } else {
        throw new Error(tokenResult?.message || 'Token导入失败')
      }

    } catch (error) {
      console.error('URL参数处理失败:', error)
      message.error(`导入失败: ${error.message}`)
      // 清除URL参数
      router.replace('/tokens')
    } finally {
      isImporting.value = false
    }
  }
}

// 监听路由参数变化
watch(() => [props.token, props.api], handleUrlParams, { immediate: false })

// 生命周期
onMounted(async () => {
  tokenStore.initTokenStore()

  // 处理URL参数
  await handleUrlParams()

  // 如果没有token且没有URL参数，显示导入表单
  if (!tokenStore.hasTokens && !props.token && !props.api) {
    showImportForm.value = true
  }
  // 启动定时任务调度（默认不立即执行一次）
  startScheduledBulkHourly(false)
})

onUnmounted(() => {
  // 清理定时器
  stopScheduledBulkHourly()
})
</script>

<style scoped lang="scss">
.token-import-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: var(--spacing-xl) 0;
}

/* 深色主题下的页面背景 */
[data-theme="dark"] .token-import-page {
  background: linear-gradient(135deg, #0f172a 0%, #1f2937 100%);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-lg);
}

.page-header {
  text-align: center;
  margin-bottom: var(--spacing-2xl);
}

.header-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.header-top {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  position: relative;
  width: 100%;
  justify-content: center;
}

.theme-toggle {
  position: absolute;
  right: 0;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.brand-logo {
  width: 64px;
  height: 64px;
  border-radius: var(--border-radius-medium);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.header-content h1 {
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-bold);
  margin: 0;
  color: #ffffff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.header-content p {
  font-size: var(--font-size-lg);
  margin: 0;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.import-section {
  margin-bottom: var(--spacing-2xl);
}

.import-card {
  background: var(--bg-primary);
  border-radius: var(--border-radius-xl);
  padding: var(--spacing-2xl);
  box-shadow: var(--shadow-large);
  max-width: 600px;
  margin: 0 auto;
}

.card-header {
  text-align: center;
  margin-bottom: var(--spacing-xl);

  h2 {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    color: var(--text-primary);
    font-size: var(--font-size-xl);
    margin-bottom: var(--spacing-sm);
  }

  p {
    color: var(--text-secondary);
    margin: 0 0 var(--spacing-md) 0;
  }

  .subtitle {
    font-size: var(--font-size-md);
    color: var(--text-tertiary);
    margin: 0;
    font-weight: var(--font-weight-normal);
  }

  .import-method-tabs {
    margin-top: var(--spacing-md);
    display: flex;
    justify-content: center;
  }
}

.form-tips {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.form-tip {
  color: var(--text-tertiary);
  font-size: var(--font-size-sm);
}

.cors-tip {
  color: var(--warning-color);
  font-weight: var(--font-weight-medium);
}

.connection-actions {
  display: flex;
  gap: var(--spacing-xs);
  align-items: center;
}

/* 深色主题强制覆盖（与全局 data-theme 保持一致） */
[data-theme="dark"] .n-form-item-label,
[data-theme="dark"] .n-form-item-label__text {
  color: #ffffff !important;
}

[data-theme="dark"] .n-input__input,
[data-theme="dark"] .n-input__textarea {
  color: #ffffff !important;
  background-color: rgba(255, 255, 255, 0.1) !important;
}

[data-theme="dark"] .n-input__placeholder {
  color: rgba(255, 255, 255, 0.5) !important;
}

[data-theme="dark"] .n-card {
  background-color: rgba(255, 255, 255, 0.1) !important;
  color: #ffffff !important;
}

[data-theme="dark"] .import-card {
  background: rgba(45, 55, 72, 0.9) !important;
  color: #ffffff !important;
}

[data-theme="dark"] .import-card h2 {
  color: #ffffff !important;
}

[data-theme="dark"] .import-card .subtitle {
  color: rgba(255, 255, 255, 0.7) !important;
}

[data-theme="dark"] .n-collapse-item__header {
  color: #ffffff !important;
}

[data-theme="dark"] .n-collapse-item__content-wrapper {
  background-color: transparent !important;
}

[data-theme="dark"] .n-radio-button {
  color: #ffffff !important;
}

[data-theme="dark"] .n-radio-button--checked {
  background-color: rgba(16, 185, 129, 0.8) !important;
  color: #ffffff !important;
}

[data-theme="dark"] .form-tip {
  color: rgba(255, 255, 255, 0.6) !important;
}

.optional-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
}

.form-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  margin-top: var(--spacing-xl);
}

.tokens-section {
  background: var(--bg-primary);
  border-radius: var(--border-radius-xl);
  padding: var(--spacing-xl);
  box-shadow: var(--shadow-medium);
}

/* 深色主题下的列表区域背景 */
[data-theme="dark"] .tokens-section {
  background: rgba(45, 55, 72, 0.9);
  color: #ffffff;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-xl);

  h2 {
    color: var(--text-primary);
    font-size: var(--font-size-xl);
    margin: 0;
  }
}

.header-actions {
  display: flex;
  gap: var(--spacing-md);
}

.tokens-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: var(--spacing-lg);
}

.token-card {
  border: 2px solid var(--border-light);
  border-radius: var(--border-radius-large);
  padding: var(--spacing-lg);
  cursor: pointer;
  transition: all var(--transition-normal);

  &:hover {
    box-shadow: var(--shadow-medium);
    transform: translateY(-2px);
  }

  &.active {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
  }

  &.connected {
    border-left: 4px solid var(--success-color);
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--spacing-md);
}

.token-info {
  flex: 1;
}

.token-name {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  margin: 0 0 var(--spacing-xs) 0;
}

.token-meta {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.meta-item {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: var(--border-radius-small);
}

.card-body {
  margin-bottom: var(--spacing-md);
}

.token-display {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-sm);
  background: var(--bg-tertiary);
  border-radius: var(--border-radius-medium);
}

.token-label {
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.token-value {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  flex: 1;
}

.connection-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-md);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);

  &.connected {
    background: var(--success-color);
  }

  &.connecting {
    background: var(--warning-color);
  }

  &.error {
    background: var(--error-color);
  }
}

.status-text {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.token-timestamps {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.timestamp-item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.timestamp-label {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
}

.timestamp-value {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
}

.card-footer {
  border-top: 1px solid var(--border-light);
  padding-top: var(--spacing-md);
}

/* 连接状态指示器样式 */
.connection-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: var(--spacing-xs);
  position: relative;

  &.connected {
    background-color: #10b981;
    /* 绿色 - 已连接 */
    animation: pulse-green 2s infinite;
  }

  &.connecting {
    background-color: #f59e0b;
    /* 黄色 - 连接中 */
    animation: pulse-yellow 1s infinite;
  }

  &.disconnected {
    background-color: #6b7280;
    /* 灰色 - 已断开 */
  }

  &.error {
    background-color: #ef4444;
    /* 红色 - 连接错误 */
    animation: pulse-red 1s infinite;
  }
}

.connection-status {
  font-size: var(--font-size-xs);
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;

  &.connected {
    color: #10b981;
    background-color: rgba(16, 185, 129, 0.1);
  }

  &.connecting {
    color: #f59e0b;
    background-color: rgba(245, 158, 11, 0.1);
  }

  &.disconnected {
    color: #6b7280;
    background-color: rgba(107, 114, 128, 0.1);
  }

  &.error {
    color: #ef4444;
    background-color: rgba(239, 68, 68, 0.1);
  }
}

@keyframes pulse-green {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

@keyframes pulse-yellow {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.3;
  }
}

@keyframes pulse-red {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.6;
  }
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  background: var(--bg-primary);
  border-radius: var(--border-radius-xl);
  box-shadow: var(--shadow-medium);
}

.modal-actions {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .container {
    padding: 0 var(--spacing-md);
  }

  .tokens-grid {
    grid-template-columns: 1fr;
  }

  .optional-fields {
    grid-template-columns: 1fr;
  }

  .section-header {
    flex-direction: column;
    gap: var(--spacing-md);
    align-items: stretch;
  }

  .token-timestamps {
    flex-direction: column;
  }

  .storage-info {
    flex-direction: column;
    gap: var(--spacing-sm);
  }
}

/* 存储信息样式 */
.storage-info {
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-light);
}

.storage-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.storage-label {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
  min-width: 70px;
}

.storage-upgrade {
  margin-top: var(--spacing-xs);
}
</style>