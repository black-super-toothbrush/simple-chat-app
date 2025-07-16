<template>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>Switch 2 Tool</h1>
      <p>Advanced Bluetooth Device Control Interface</p>
    </div>

    <div class="grid grid-3">
      <!-- 蓝牙连接卡片 -->
      <div class="card fade-in">
        <div class="card-header">
          <i class="fas fa-bluetooth"></i>
          <h3>Bluetooth Connection</h3>
        </div>
        <div :class="['status', isConnected ? 'status-connected' : 'status-disconnected']">
          <span :class="['status-indicator', isConnected ? 'connected' : 'disconnected']"></span>
          <i :class="['fas', isConnected ? 'fa-link' : 'fa-unlink']"></i>
          <span>{{ isConnected ? 'Device Connected' : 'Device Not Connected' }}</span>
        </div>
        <div class="controls">
          <button 
            class="btn btn-primary tooltip" 
            @click="connectDevice" 
            :disabled="isConnected"
            data-tooltip="Connect to PY32F071 Bluetooth device"
          >
            <i class="fas fa-link"></i>
            Connect Device
          </button>
          <button 
            class="btn btn-danger tooltip" 
            @click="disconnectDevice" 
            :disabled="!isConnected"
            data-tooltip="Disconnect from device"
          >
            <i class="fas fa-unlink"></i>
            Disconnect
          </button>
        </div>
      </div>

      <!-- 设备信息卡片 -->
      <div class="card fade-in" v-show="isConnected">
        <div class="card-header">
          <i class="fas fa-info-circle"></i>
          <h3>Device Information</h3>
        </div>
        <div class="responsive-table">
          <table class="table">
            <tbody>
              <tr>
                <td><strong>Model Number:</strong></td>
                <td><span>{{ deviceInfo.modelNumber }}</span></td>
              </tr>
              <tr>
                <td><strong>Serial Number:</strong></td>
                <td><span>{{ deviceInfo.serialNumber }}</span></td>
              </tr>
              <tr>
                <td><strong>Hardware Version:</strong></td>
                <td><span>{{ deviceInfo.hardwareVersion }}</span></td>
              </tr>
              <tr>
                <td><strong>Software Revision:</strong></td>
                <td><span>{{ deviceInfo.softwareRevision }}</span></td>
              </tr>
              <tr>
                <td><strong>Manufacturer:</strong></td>
                <td><span>{{ deviceInfo.manufacturerName }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 使用统计信息卡片 -->
      <div class="card fade-in" v-show="isConnected">
        <div class="card-header">
          <i class="fas fa-chart-bar"></i>
          <h3>Device Usage Statistics</h3>
        </div>
        <div class="responsive-table">
          <table class="table">
            <tbody>
              <tr>
                <td><strong>Favorite Temperature:</strong></td>
                <td><span>{{ deviceStats.favoriteTemp }}</span></td>
              </tr>
              <tr>
                <td><strong>Total Heating Cycles:</strong></td>
                <td><span>{{ deviceStats.totalHeatingCycles }}</span></td>
              </tr>
              <tr>
                <td><strong>Most Cycles in Day:</strong></td>
                <td><span>{{ deviceStats.mostCyclesInDay }}</span></td>
              </tr>
              <tr>
                <td><strong>Charge Cycles:</strong></td>
                <td><span>{{ deviceStats.chargeCycles }}</span></td>
              </tr>
              <tr>
                <td><strong>Profile:</strong></td>
                <td><span>{{ deviceStats.profile }}</span></td>
              </tr>
              <tr>
                <td><strong>Light Mode:</strong></td>
                <td><span>{{ deviceStats.lightMode }}</span></td>
              </tr>
              <tr>
                <td><strong>Device Resets:</strong></td>
                <td><span>{{ deviceStats.deviceResets }}</span></td>
              </tr>
              <tr>
                <td><strong>Favorite Heating Time:</strong></td>
                <td><span>{{ deviceStats.favoriteHeatingTime }}</span></td>
              </tr>
              <tr>
                <td><strong>Session Total Time:</strong></td>
                <td><span>{{ deviceStats.sessionTotalTime }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style="margin-top: 16px;">
          <button 
            class="btn btn-primary" 
            @click="requestDeviceStats" 
            :disabled="!isConnected"
          >
            <i class="fas fa-sync-alt"></i>
            Refresh Statistics
          </button>
        </div>
      </div>
    </div>

    <!-- 设备状态监控 -->
    <div class="card fade-in">
      <div class="card-header">
        <i class="fas fa-chart-line"></i>
        <h3>Device Status Monitor</h3>
      </div>
      
      <div style="margin-bottom: 20px;">
        <label class="toggle-switch">
          <input type="checkbox" v-model="notifyEnabled" @change="toggleNotifications">
          <span class="slider"></span>
        </label>
        <span style="margin-left: 12px; font-weight: 500;">
          Real-time Monitoring
          <span style="margin-left: 8px; font-size: 0.875rem; color: var(--gray-500);">
            {{ notifyEnabled ? 'Enabled' : 'Disabled' }}
          </span>
        </span>
      </div>
      
      <div v-show="notifyEnabled">
        <div class="status-grid">
          <div class="status-group">
            <h4><i class="fas fa-thermometer-half"></i> Temperature</h4>
            <div class="status-item">
              <strong>Preset:</strong> 
              <button 
                class="btn btn-primary" 
                @click="switchPreset" 
                :disabled="!isConnected" 
                style="min-width: 60px; padding: 6px 12px;"
              >
                {{ currentPreset || '--' }}
              </button>
            </div>
            <div class="status-item">
              <strong>Target:</strong>
              <span>{{ tempSetting }}</span>
            </div>
            <div class="status-item">
              <strong>Current:</strong> 
              <span>{{ realTemp }}</span>
            </div>
            <div class="status-item">
              <strong>Preset Mode:</strong>
              <span style="color: var(--primary-color); font-weight: 600;">{{ currentPresetMode }}</span>
            </div>
          </div>
          
          <div class="status-group">
            <h4><i class="fas fa-battery-half"></i> Power</h4>
            <div class="status-item">
              <strong>Battery:</strong>
              <span>{{ batteryLevel }}</span>
            </div>
            <div class="status-item">
              <strong>Charge State:</strong> 
              <span>{{ chargeState }}</span>
            </div>
            <div class="status-item">
              <strong>Brightness:</strong>
              <input 
                type="range" 
                v-model="brightness" 
                min="0" 
                max="100" 
                style="width: 80px;" 
                @input="updateBrightnessDisplay"
                @change="setBrightness"
                :disabled="!isConnected"
              >
              <span style="font-size: 0.8rem; margin-left: 8px;">{{ brightness }}</span>
            </div>
          </div>
          
          <div class="status-group">
            <h4><i class="fas fa-fire"></i> Session</h4>
            <div style="margin-bottom: 16px; text-align: center;">
              <button 
                class="btn btn-success" 
                @click="toggleSession" 
                :disabled="!isConnected" 
                style="min-width: 150px;"
              >
                <i class="fas fa-play"></i>
                Press to Heat
              </button>
            </div>
            <div style="margin-bottom: 16px; text-align: center;">
              <button 
                class="btn btn-secondary" 
                @click="toggleCleaningAssist" 
                :disabled="!isConnected" 
                style="min-width: 150px;"
              >
                <i class="fas fa-broom"></i>
                Cleaning Assist
              </button>
            </div>
            <div class="status-item">
              <strong>Auto Shut:</strong>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input 
                  type="range" 
                  v-model="autoShutTime" 
                  min="0" 
                  max="30" 
                  style="width: 80px;" 
                  @input="updateAutoShutDisplay"
                  @change="setAutoShutTime"
                  :disabled="!isConnected"
                >
                <span style="font-size: 0.8rem; margin-left: 8px;">{{ autoShutTime }} min</span>
              </div>
            </div>
            <div class="status-item">
              <strong>Countdown:</strong> 
              <span>{{ remainTime }}</span>s
            </div>
            <div class="status-item">
              <strong>Session Time:</strong> 
              <span>{{ sessionRemainTime }}</span>s
            </div>
          </div>
          
          <div class="status-group">
            <h4><i class="fas fa-cog"></i> Settings</h4>
            <div class="status-item">
              <strong>LED Mode:</strong>
              <div class="led-selector">
                <select 
                  v-model="selectedLedPreset" 
                  class="form-control" 
                  @change="setLedPreset" 
                  style="font-size: 0.8rem;"
                  :disabled="!isConnected"
                >
                  <option value="0x00">Clam</option>
                  <option value="0x01">Stealth</option>
                  <option value="0x02">Purple</option>
                  <option value="0x03">Blue</option>
                  <option value="0x04">Cyan</option>
                  <option value="0x05">Green</option>
                  <option value="0x06">Yellow</option>
                  <option value="0x07">Orange</option>
                  <option value="0x08">Red</option>
                  <option value="0x09">Pink</option>
                  <option value="0x0A">Cali Sunset</option>
                  <option value="0x0B">Purple Haze</option>
                  <option value="0x0C">Northern Nights</option>
                  <option value="0x0D">Vegas Nights</option>
                  <option value="0x0E">Blue Dream</option>
                  <option value="0x0F">Strawberry Cough</option>
                  <option value="0x10">Florida Groves</option>
                  <option value="0x11">Lime Light</option>
                  <option value="0x17">Custom Light</option>
                </select>
                <div class="led-preview" :style="{ background: getLedPreviewColor(selectedLedPreset) }"></div>
              </div>
            </div>
            <div class="status-item">
              <strong>Current:</strong> 
              <span>{{ ledPreset }}</span>
            </div>
            <div class="status-item">
              <strong>Haptic:</strong> 
              <button 
                class="btn btn-success" 
                @click="toggleHaptic" 
                :disabled="!isConnected" 
                style="min-width: 80px; padding: 6px 12px; font-size: 0.8rem;"
              >
                {{ hapticEnabled ? 'On' : 'Off' }}
              </button>
            </div>
            <div class="status-item">
              <strong>Boost:</strong> 
              <button 
                class="btn btn-secondary tooltip" 
                @click="toggleBoost" 
                :disabled="!isConnected" 
                style="min-width: 80px; padding: 6px 12px; font-size: 0.8rem;"
                data-tooltip="Click to send incremental boost value (+1 each click)"
              >
                Boost
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 实时温度图表 -->
    <div class="grid">
      <div class="card fade-in">
        <div class="card-header">
          <i class="fas fa-chart-line"></i>
          <h3>Real-time Temperature Chart</h3>
          <button 
            class="btn btn-secondary" 
            @click="clearTemperatureChart" 
            style="margin-left: auto; padding: 6px 12px; font-size: 0.8rem;"
          >
            <i class="fas fa-trash"></i> Clear
          </button>
        </div>
        <div style="position: relative; height: 300px; width: 100%; padding: 16px;">
          <canvas ref="temperatureChart"></canvas>
        </div>
        <div style="text-align: center; font-size: 0.8rem; color: var(--gray-500); padding-bottom: 16px;">
          <span>Real-time temperature monitoring</span>
        </div>
      </div>
    </div>

    <!-- 温度预设 -->
    <div class="grid">
      <div class="card fade-in">
        <div class="card-header">
          <i class="fas fa-sliders-h"></i>
          <h3>Temperature Presets (250-650°F)</h3>
        </div>
        <div class="temp-preset-grid">
          <div 
            v-for="preset in 5" 
            :key="preset" 
            class="preset-card"
          >
            <div class="preset-title">Preset {{ preset }}</div>
            <input 
              type="number" 
              v-model="presetTemps[preset]" 
              min="250" 
              max="650" 
              class="temp-input" 
              @change="setTemperature(preset, presetTemps[preset])"
              :disabled="!isConnected"
            >
            <div class="temp-unit">°F</div>
            <div class="preset-controls">
              <div class="preset-control-item">
                <label class="preset-control-label">Hold Time:</label>
                <div class="preset-control-input">
                  <input 
                    type="range" 
                    v-model="presetHoldTimes[preset]" 
                    min="10" 
                    max="90" 
                    class="preset-slider" 
                    @input="updatePresetHoldTimeDisplay(preset, presetHoldTimes[preset])" 
                    @change="setPresetHoldTime(preset, presetHoldTimes[preset])"
                    :disabled="!isConnected"
                  >
                  <span class="preset-value">{{ presetHoldTimes[preset] }}s</span>
                </div>
              </div>
              <div class="preset-control-item">
                <label class="preset-control-label">Mode:</label>
                <select 
                  v-model="presetModes[preset]" 
                  class="preset-mode-select" 
                  @change="setPresetMode(preset, presetModes[preset])" 
                  :disabled="!isConnected"
                >
                  <option value="0xA1">Steady</option>
                  <option value="0xB1">Ascent</option>
                  <option value="0xC1">Descent</option>
                  <option value="0xD1">Valley</option>
                  <option value="0xE1">Hill</option>
                  <option value="0xF1">Custom</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 日志 -->
    <div class="grid">
      <div class="card fade-in">
        <div class="card-header">
          <i class="fas fa-terminal"></i>
          <h3>Device Log</h3>
          <button 
            class="btn btn-secondary" 
            @click="clearLog" 
            style="margin-left: auto; padding: 6px 12px; font-size: 0.8rem;"
          >
            <i class="fas fa-trash"></i> Clear
          </button>
        </div>
        <div class="log" ref="logContainer">
          <div v-for="(logEntry, index) in logs" :key="index">
            {{ logEntry }}
          </div>
        </div>
      </div>
    </div>

    <!-- 通知 -->
    <div 
      v-if="notification.show" 
      :class="['notification', 'show', notification.type]"
    >
      {{ notification.message }}
    </div>
  </div>
</template>

<script>
import { ref, reactive, onMounted, nextTick } from 'vue'
import Chart from 'chart.js/auto'

export default {
  name: 'App',
  setup() {
    // 响应式数据
    const isConnected = ref(false)
    const notifyEnabled = ref(false)
    const currentPreset = ref(1)
    const tempSetting = ref('--')
    const realTemp = ref('--')
    const currentPresetMode = ref('Steady')
    const batteryLevel = ref('--')
    const chargeState = ref('--')
    const brightness = ref(25)
    const autoShutTime = ref(2)
    const remainTime = ref('--')
    const sessionRemainTime = ref('--')
    const selectedLedPreset = ref('0x00')
    const ledPreset = ref('--')
    const hapticEnabled = ref(true)
    const logs = ref([])
    const temperatureChart = ref(null)
    
    // 设备信息
    const deviceInfo = reactive({
      modelNumber: '--',
      serialNumber: '--',
      hardwareVersion: '--',
      softwareRevision: '--',
      manufacturerName: '--'
    })
    
    // 设备统计
    const deviceStats = reactive({
      favoriteTemp: '--',
      totalHeatingCycles: '--',
      mostCyclesInDay: '--',
      chargeCycles: '--',
      profile: '--',
      lightMode: '--',
      deviceResets: '--',
      favoriteHeatingTime: '--',
      sessionTotalTime: '--'
    })
    
    // 预设温度
    const presetTemps = reactive({
      1: 450,
      2: 500,
      3: 550,
      4: 600,
      5: 650
    })
    
    // 预设保持时间
    const presetHoldTimes = reactive({
      1: 30,
      2: 30,
      3: 30,
      4: 30,
      5: 30
    })
    
    // 预设模式
    const presetModes = reactive({
      1: '0xA1',
      2: '0xA1',
      3: '0xA1',
      4: '0xA1',
      5: '0xA1'
    })
    
    // 通知
    const notification = reactive({
      show: false,
      message: '',
      type: 'success'
    })
    
    let chart = null
    let characteristic = null
    
    // 方法
    const log = (message) => {
      const timestamp = new Date().toLocaleTimeString()
      logs.value.push(`[${timestamp}] ${message}`)
      nextTick(() => {
        const logContainer = document.querySelector('.log')
        if (logContainer) {
          logContainer.scrollTop = logContainer.scrollHeight
        }
      })
    }
    
    const showNotification = (message, type = 'success', duration = 3000) => {
      notification.message = message
      notification.type = type
      notification.show = true
      
      setTimeout(() => {
        notification.show = false
      }, duration)
    }
    
    const connectDevice = async () => {
      try {
        log('Searching for Bluetooth devices...')
        const device = await navigator.bluetooth.requestDevice({
          filters: [
            { services: ['0000fee7-0000-1000-8000-00805f9b34fb'] }
          ],
          optionalServices: [
            '0000fee7-0000-1000-8000-00805f9b34fb',
            '0000180a-0000-1000-8000-00805f9b34fb'
          ]
        })
        
        log(`Found device: ${device.name}`)
        const server = await device.gatt.connect()
        log('GATT server connected successfully')
        
        const service = await server.getPrimaryService('0000fee7-0000-1000-8000-00805f9b34fb')
        log('Service obtained successfully')
        
        characteristic = await service.getCharacteristic('0000fec1-0000-1000-8000-00805f9b34fb')
        log('TX characteristic obtained successfully')
        
        // Get RX characteristic for listening to responses
        const rxCharacteristic = await service.getCharacteristic('0000fec2-0000-1000-8000-00805f9b34fb')
        log('RX characteristic obtained successfully')
        
        // Enable notifications to receive responses
        await rxCharacteristic.startNotifications()
        rxCharacteristic.addEventListener('characteristicvaluechanged', handleResponse)
        log('Response listener enabled successfully')
        
        // Listen for device disconnection
        device.addEventListener('gattserverdisconnected', () => {
          log('Device disconnected')
          isConnected.value = false
          characteristic = null
        })
        
        isConnected.value = true
        log('✓ Device connected successfully')
        showNotification('设备连接成功', 'success')
        
        // 读取设备信息
        await readDeviceInfo(server)
        
        // 连接成功后的初始化操作
        await initializeDevice()
        
      } catch (error) {
        log(`✗ Connection failed: ${error.message}`)
        showNotification(`连接失败: ${error.message}`, 'error')
      }
    }
    
    const disconnectDevice = () => {
      if (characteristic && characteristic.service.device.gatt.connected) {
        characteristic.service.device.gatt.disconnect()
        log('Device disconnected actively')
      }
      isConnected.value = false
      characteristic = null
      showNotification('设备已断开连接', 'info')
    }
    
    const readDeviceInfo = async (server) => {
      try {
        const deviceInfoService = await server.getPrimaryService('0000180a-0000-1000-8000-00805f9b34fb')
        
        // 读取各种设备信息
        try {
          const modelChar = await deviceInfoService.getCharacteristic('00002a24-0000-1000-8000-00805f9b34fb')
          const modelValue = await modelChar.readValue()
          deviceInfo.modelNumber = new TextDecoder().decode(modelValue)
        } catch (e) {
          log('Failed to read model number')
        }
        
        try {
          const serialChar = await deviceInfoService.getCharacteristic('00002a25-0000-1000-8000-00805f9b34fb')
          const serialValue = await serialChar.readValue()
          deviceInfo.serialNumber = new TextDecoder().decode(serialValue)
        } catch (e) {
          log('Failed to read serial number')
        }
        
        try {
          const hwChar = await deviceInfoService.getCharacteristic('00002a27-0000-1000-8000-00805f9b34fb')
          const hwValue = await hwChar.readValue()
          deviceInfo.hardwareVersion = new TextDecoder().decode(hwValue)
        } catch (e) {
          log('Failed to read hardware version')
        }
        
        try {
          const swChar = await deviceInfoService.getCharacteristic('00002a28-0000-1000-8000-00805f9b34fb')
          const swValue = await swChar.readValue()
          deviceInfo.softwareRevision = new TextDecoder().decode(swValue)
        } catch (e) {
          log('Failed to read software revision')
        }
        
        try {
          const mfgChar = await deviceInfoService.getCharacteristic('00002a29-0000-1000-8000-00805f9b34fb')
          const mfgValue = await mfgChar.readValue()
          deviceInfo.manufacturerName = new TextDecoder().decode(mfgValue)
        } catch (e) {
          log('Failed to read manufacturer name')
        }
        
      } catch (error) {
        log(`Failed to read device info: ${error.message}`)
      }
    }
    
    const toggleNotifications = async () => {
      if (!isConnected.value) return
      
      notifyEnabled.value = !notifyEnabled.value
      log(`Real-time monitoring ${notifyEnabled.value ? 'enabled' : 'disabled'}`)
      showNotification(`实时监控已${notifyEnabled.value ? '开启' : '关闭'}`, 'success', 2000)
    }
    
    const switchPreset = async () => {
      if (!isConnected.value) return
      
      const newPreset = currentPreset.value >= 5 ? 1 : currentPreset.value + 1
      
      // 发送B9命令切换预设
      const command = [
        0xB9, 20, 0x00, newPreset, 0x00, 0x00, 0x00, 0x00, 0x02, 0x0f,
        0x00, 0xAA, 0x00, 25, 0x00, 0x00, 0x00, 0x00, 0x00, 0xB9
      ]
      
      await sendCommand(command, `Switch to preset ${newPreset}`)
      currentPreset.value = newPreset
      log(`Switched to preset ${newPreset}`)
    }
    
    const updateBrightnessDisplay = () => {
      // 实时更新显示
    }
    
    const setBrightness = async () => {
      if (!isConnected.value) return
      
      // 发送B9命令设置亮度
      const command = [
        0xB9, 20, 0x00, currentPreset.value, 0x00, 0x00, 0x00, 0x00, autoShutTime.value, 0x0f,
        0x00, hapticEnabled.value ? 0xAA : 0x00, 0x00, brightness.value, 0x00, 0x00, 0x00, 0x00, 0x00, 0xB9
      ]
      
      await sendCommand(command, `Set brightness to ${brightness.value}%`)
      log(`Brightness set to ${brightness.value}%`)
    }
    
    const updateAutoShutDisplay = () => {
      // 实时更新显示
    }
    
    const setAutoShutTime = async () => {
      if (!isConnected.value) return
      
      // 发送B9命令设置自动关机时间
      const command = [
        0xB9, 20, 0x00, currentPreset.value, 0x00, 0x00, 0x00, 0x00, autoShutTime.value, 0x0f,
        0x00, hapticEnabled.value ? 0xAA : 0x00, 0x00, brightness.value, 0x00, 0x00, 0x00, 0x00, 0x00, 0xB9
      ]
      
      await sendCommand(command, `Set auto shut time to ${autoShutTime.value} minutes`)
      log(`Auto shut time set to ${autoShutTime.value} minutes`)
    }
    
    const toggleSession = async () => {
      if (!isConnected.value) return
      
      // 发送B9命令切换会话状态
      const command = [
        0xB9, 20, 0x00, currentPreset.value, 0x00, 0x00, 0x00, 0x00, autoShutTime.value, 0x0f,
        0xAA, hapticEnabled.value ? 0xAA : 0x00, 0x00, brightness.value, 0x00, 0x00, 0x00, 0x00, 0x00, 0xB9
      ]
      
      await sendCommand(command, 'Toggle session')
      log('Session toggled')
      showNotification('会话状态已切换', 'success', 2000)
    }
    
    const toggleCleaningAssist = async () => {
      if (!isConnected.value) return
      
      // 发送清洁辅助命令
      await sendCommand([0xB5, 0x01, 0xB5], 'Cleaning assist')
      log('Cleaning assist toggled')
      showNotification('清洁辅助已激活', 'success', 2000)
    }
    
    const setLedPreset = async () => {
      if (!isConnected.value) return
      
      const ledValue = parseInt(selectedLedPreset.value, 16)
      
      // 发送B9命令设置LED预设
      const command = [
        0xB9, 20, 0x00, currentPreset.value, 0x00, 0x00, ledValue, 0x00, autoShutTime.value, 0x0f,
        0x00, hapticEnabled.value ? 0xAA : 0x00, 0x00, brightness.value, 0x00, 0x00, 0x00, 0x00, 0x00, 0xB9
      ]
      
      await sendCommand(command, `Set LED preset to ${selectedLedPreset.value}`)
      log(`LED preset set to ${selectedLedPreset.value}`)
      showNotification(`LED颜色已设置`, 'success', 2000)
    }
    
    const getLedPreviewColor = (preset) => {
      const colors = {
        '0x00': '#f5f5f5',
        '0x01': '#2d3748',
        '0x02': '#805ad5',
        '0x03': '#3182ce',
        '0x04': '#00b5d8',
        '0x05': '#38a169',
        '0x06': '#d69e2e',
        '0x07': '#dd6b20',
        '0x08': '#e53e3e',
        '0x09': '#d53f8c',
        '0x0A': 'linear-gradient(45deg, #ff6b6b, #ffa500)',
        '0x0B': 'linear-gradient(45deg, #9f7aea, #b794f6)',
        '0x0C': 'linear-gradient(45deg, #2d3748, #4a5568)',
        '0x0D': 'linear-gradient(45deg, #ed8936, #f6ad55)',
        '0x0E': 'linear-gradient(45deg, #3182ce, #63b3ed)',
        '0x0F': 'linear-gradient(45deg, #e53e3e, #fc8181)',
        '0x10': 'linear-gradient(45deg, #38a169, #68d391)',
        '0x11': 'linear-gradient(45deg, #68d391, #9ae6b4)',
        '0x17': '#667eea'
      }
      return colors[preset] || '#f5f5f5'
    }
    
    const toggleHaptic = async () => {
      if (!isConnected.value) return
      
      hapticEnabled.value = !hapticEnabled.value
      
      // 发送B9命令设置触觉反馈
      const command = [
        0xB9, 20, 0x00, currentPreset.value, 0x00, 0x00, 0x00, 0x00, autoShutTime.value, 0x0f,
        0x00, hapticEnabled.value ? 0xAA : 0x00, 0x00, brightness.value, 0x00, 0x00, 0x00, 0x00, 0x00, 0xB9
      ]
      
      await sendCommand(command, `Set haptic ${hapticEnabled.value ? 'enabled' : 'disabled'}`)
      log(`Haptic ${hapticEnabled.value ? 'enabled' : 'disabled'}`)
      showNotification(`触觉反馈已${hapticEnabled.value ? '开启' : '关闭'}`, 'success', 2000)
    }
    
    const toggleBoost = () => {
      if (!isConnected.value) return
      log('Boost activated')
    }
    
    const clearTemperatureChart = () => {
      if (chart) {
        chart.data.labels = []
        chart.data.datasets[0].data = []
        chart.update()
        log('Temperature chart cleared')
      }
    }
    
    const setTemperature = async (preset, temp) => {
      if (!isConnected.value) return
      
      const temperature = parseInt(temp)
      if (temperature < 250 || temperature > 650) {
        log(`Error: Temperature ${temperature}°F is out of range (250-650°F)`)
        return
      }
      
      const tempC = Math.round((temperature - 32) * 5 / 9)
      
      // 构造温度设置数据包：0xB3 + 8 + 预设索引 + 华氏温度(2字节) + 摄氏温度(2字节) + 0xB3
      const tempPacket = [
        0xB3, 8, preset,
        (temperature >> 8) & 0xFF, temperature & 0xFF,
        (tempC >> 8) & 0xFF, tempC & 0xFF,
        0xB3
      ]
      
      await sendCommand(tempPacket, `Set preset ${preset} temperature to ${temperature}°F (${tempC}°C)`)
      log(`Preset ${preset} temperature set to ${temp}°F`)
    }
    
    const updatePresetHoldTimeDisplay = (preset, value) => {
      // 实时更新显示
    }
    
    const setPresetHoldTime = async (preset, time) => {
      if (!isConnected.value) return
      
      const holdTime = parseInt(time)
      
      // 构造Hold Time设置数据包：0xA7 + 6 + 预设索引 + 时间(2字节) + 0xA7
      const timePacket = [
        0xA7, 6, preset,
        (holdTime >> 8) & 0xFF, holdTime & 0xFF,
        0xA7
      ]
      
      await sendCommand(timePacket, `Set preset ${preset} hold time to ${holdTime}s`)
      log(`Preset ${preset} hold time set to ${time}s`)
    }
    
    const setPresetMode = async (preset, mode) => {
      if (!isConnected.value) return
      
      const modeValue = parseInt(mode, 16)
      
      // 构造模式设置数据包：0xA5 + 5 + 预设索引 + 模式值 + 0xA5
      const modePacket = [
        0xA5, 5, preset, modeValue, 0xA5
      ]
      
      await sendCommand(modePacket, `Set preset ${preset} mode to ${mode}`)
      log(`Preset ${preset} mode set to ${mode}`)
    }
    
    const requestDeviceStats = async () => {
      if (!isConnected.value) return
      
      log('Requesting device statistics...')
      await requestDeviceStatsCommand()
      showNotification('正在获取设备统计信息...', 'info', 2000)
    }
    
    const clearLog = () => {
      logs.value = []
    }
    
    // 设备初始化函数
    const initializeDevice = async () => {
      try {
        // 发送B1指令获取设备信息
        await sendCommand([0xB1, 0x01, 0xB1], 'Device info request')
        
        // 同步时间
        await syncTime()
        
        // 启用实时监控
        notifyEnabled.value = true
        log('Real-time monitoring enabled automatically')
        showNotification('实时监控已自动开启', 'success', 2000)
        
        // 获取设备统计信息
        await requestDeviceStatsCommand()
        
      } catch (error) {
        log(`Device initialization failed: ${error.message}`)
      }
    }
    
    // 处理蓝牙响应数据
    const handleResponse = (event) => {
      const data = new Uint8Array(event.target.value.buffer)
      
      // 检查是否是设备状态notify数据包 (20字节，包头包尾都是0xA9)
      if (data.length === 20 && data[0] === 0xA9 && data[19] === 0xA9) {
        handleNotifyData(data)
        return
      }
      
      // 检查是否是统计信息数据包 (A2开头)
      if (data.length >= 5 && data[0] === 0xA2) {
        handleDeviceStatsData(data)
        return
      }
      
      // 对于其他数据包，打印日志
      log(`Received response: length=${data.length} bytes, content=${Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`)
    }
    
    // 处理设备状态notify数据
    const handleNotifyData = (data) => {
      // 解析20字节的状态数据
      const preset = data[1]
      const tempSettingHigh = data[2]
      const tempSettingLow = data[3]
      const realTempHigh = data[4]
      const realTempLow = data[5]
      const battery = data[6]
      const chargeStatus = data[7]
      const remainTimeHigh = data[8]
      const remainTimeLow = data[9]
      const sessionRemainTimeHigh = data[10]
      const sessionRemainTimeLow = data[11]
      const ledPresetValue = data[12]
      const hapticValue = data[13]
      const brightnessValue = data[14]
      const autoShutValue = data[15]
      
      // 更新UI数据
      currentPreset.value = preset
      tempSetting.value = (tempSettingHigh << 8) | tempSettingLow
      realTemp.value = (realTempHigh << 8) | realTempLow
      batteryLevel.value = battery
      chargeState.value = chargeStatus === 0xAA ? 'Charging' : 'Not Charging'
      remainTime.value = (remainTimeHigh << 8) | remainTimeLow
      sessionRemainTime.value = (sessionRemainTimeHigh << 8) | sessionRemainTimeLow
      ledPreset.value = `0x${ledPresetValue.toString(16).padStart(2, '0').toUpperCase()}`
      hapticEnabled.value = hapticValue === 0xAA
      brightness.value = brightnessValue
      autoShutTime.value = autoShutValue
      
      // 更新温度图表
      if (realTemp.value > 0 && notifyEnabled.value && chart) {
        addTemperaturePoint(realTemp.value)
      }
    }
    
    // 处理设备统计数据
    const handleDeviceStatsData = (data) => {
      if (data.length >= 21 && data[0] === 0xA2 && data[1] === 21) {
        // 解析统计数据
        const favoriteTemp = (data[2] << 8) | data[3]
        const totalHeatingCycles = (data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7]
        const mostCyclesInDay = (data[8] << 8) | data[9]
        const chargeCycles = (data[10] << 8) | data[11]
        const profile = data[12]
        const lightMode = data[13]
        const deviceResets = (data[14] << 8) | data[15]
        const favoriteHeatingTime = (data[16] << 8) | data[17]
        const sessionTotalTimeHours = (data[18] << 8) | data[19]
        
        // 更新统计数据
        deviceStats.favoriteTemp = `${favoriteTemp}°F`
        deviceStats.totalHeatingCycles = totalHeatingCycles.toLocaleString()
        deviceStats.mostCyclesInDay = mostCyclesInDay.toString()
        deviceStats.chargeCycles = chargeCycles.toString()
        deviceStats.profile = getProfileName(profile)
        deviceStats.lightMode = getLightModeName(lightMode)
        deviceStats.deviceResets = deviceResets.toString()
        deviceStats.favoriteHeatingTime = `${favoriteHeatingTime}s`
        deviceStats.sessionTotalTime = formatTime(sessionTotalTimeHours)
        
        log('✓ Device statistics updated')
        showNotification('设备统计信息已更新', 'success', 2000)
      }
    }
    
    // 发送蓝牙命令
    const sendCommand = async (command, description) => {
      if (!characteristic) {
        log('Error: Device not connected')
        return
      }
      
      try {
        const commandArray = new Uint8Array(command)
        await characteristic.writeValue(commandArray)
        const packetHex = Array.from(commandArray).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')
        log(`✓ ${description}: ${packetHex}`)
      } catch (error) {
        log(`✗ Failed to send ${description}: ${error.message}`)
      }
    }
    
    // 同步时间
    const syncTime = async () => {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1
      const day = now.getDate()
      const hour = now.getHours()
      const minute = now.getMinutes()
      
      const timePacket = [
        0xB1, 0x09,
        (year >> 8) & 0xFF, year & 0xFF,
        month, day, hour, minute,
        0xB1
      ]
      
      await sendCommand(timePacket, 'Time sync')
    }
    
    // 请求设备统计信息
    const requestDeviceStatsCommand = async () => {
      await sendCommand([0xB2, 0x01, 0xB2], 'Device statistics request')
    }
    
    // 添加温度数据点到图表
    const addTemperaturePoint = (temperature) => {
      if (!chart) return
      
      const now = new Date()
      const timeLabel = now.toLocaleTimeString()
      
      chart.data.labels.push(timeLabel)
      chart.data.datasets[0].data.push(temperature)
      
      // 限制数据点数量
      if (chart.data.labels.length > 50) {
        chart.data.labels.shift()
        chart.data.datasets[0].data.shift()
      }
      
      chart.update('none')
    }
    
    // 辅助函数
    const getProfileName = (profile) => {
      const profiles = {
        0: 'Default',
        1: 'Custom 1',
        2: 'Custom 2',
        3: 'Custom 3'
      }
      return profiles[profile] || 'Unknown'
    }
    
    const getLightModeName = (mode) => {
      const modes = {
        0x00: 'Clam',
        0x01: 'Stealth',
        0x02: 'Purple',
        0x03: 'Blue',
        0x04: 'Cyan',
        0x05: 'Green',
        0x06: 'Yellow',
        0x07: 'Orange',
        0x08: 'Red',
        0x09: 'Pink'
      }
      return modes[mode] || 'Custom'
    }
    
    const formatTime = (hours) => {
      const h = Math.floor(hours)
      const m = Math.floor((hours - h) * 60)
      return `${h}h ${m}m`
    }
    
    const initChart = () => {
      const ctx = temperatureChart.value.getContext('2d')
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{
            label: 'Temperature (°F)',
            data: [],
            borderColor: '#667eea',
            backgroundColor: 'rgba(102, 126, 234, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: false,
              min: 200,
              max: 700
            }
          },
          plugins: {
            legend: {
              display: true
            }
          }
        }
      })
    }
    
    onMounted(() => {
      log('Switch 2 Tool initialized')
      nextTick(() => {
        initChart()
      })
    })
    
    return {
      // 响应式数据
      isConnected,
      notifyEnabled,
      currentPreset,
      tempSetting,
      realTemp,
      currentPresetMode,
      batteryLevel,
      chargeState,
      brightness,
      autoShutTime,
      remainTime,
      sessionRemainTime,
      selectedLedPreset,
      ledPreset,
      hapticEnabled,
      logs,
      deviceInfo,
      deviceStats,
      presetTemps,
      presetHoldTimes,
      presetModes,
      notification,
      temperatureChart,
      
      // 方法
      connectDevice,
      disconnectDevice,
      toggleNotifications,
      switchPreset,
      updateBrightnessDisplay,
      setBrightness,
      updateAutoShutDisplay,
      setAutoShutTime,
      toggleSession,
      toggleCleaningAssist,
      setLedPreset,
      getLedPreviewColor,
      toggleHaptic,
      toggleBoost,
      clearTemperatureChart,
      setTemperature,
      updatePresetHoldTimeDisplay,
      setPresetHoldTime,
      setPresetMode,
      requestDeviceStats,
      clearLog
    }
  }
}
</script>