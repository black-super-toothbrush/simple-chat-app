let bluetoothDevice;
let characteristic;
let firmwareData;
let isOtaInProgress = false;
let otaSequence = 0;
let totalPackets = 0;
let sentPackets = 0;
let waitingForResponse = false;
let responsePromise = null;

// Session data collection variables
let isSessionDataCollection = false;
let currentSessionData = null;
let sessionStartTime = null;
let sessionDataPoints = [];
let cleaningAssistEnabled = false; // 清洁助手状态

// 存储5套custom setting数据 (扩展到10个点)
let customSettings = {
    1: { temps: [400, 410, 420, 430, 440, 450, 460, 470, 480, 490], times: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] },
    2: { temps: [400, 410, 420, 430, 440, 450, 460, 470, 480, 490], times: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] },
    3: { temps: [400, 410, 420, 430, 440, 450, 460, 470, 480, 490], times: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] },
    4: { temps: [400, 410, 420, 430, 440, 450, 460, 470, 480, 490], times: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] },
    5: { temps: [400, 410, 420, 430, 440, 450, 460, 470, 480, 490], times: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] },
};


// 认证检查函数 (Bypassed)
function checkAuthentication() {
    return true;
}

// Firestore连接和权限检查函数 (Disabled)
async function checkFirestoreConnection() {
    return false;
}

// 温度预设数据收集和上传功能 (Disabled)
async function collectAndUploadTemperaturePresets() {
    log('Data upload is disabled.');
    return;
}

// 自动上传温度预设数据（当用户修改预设时） (Disabled)
async function autoUploadOnPresetChange(presetIndex, newTemp) {
    return;
}

// 更新上传状态显示
function updateUploadStatus(status, timestamp, presets) {
    const statusElement = document.getElementById('upload-status');
    const timestampElement = document.getElementById('upload-timestamp');
    const presetsElement = document.getElementById('upload-presets');
    
    if (statusElement) {
        statusElement.className = `upload-status ${status}`;
        statusElement.textContent = status === 'success' ? '上传成功' : 
                                   status === 'error' ? '上传失败' : '准备上传';
    }
    
    if (timestampElement) {
        timestampElement.textContent = timestamp ? new Date(timestamp).toLocaleString('zh-CN') : '--';
    }
    
    if (presetsElement && presets) {
        presetsElement.textContent = `[${presets.join(', ')}]°F`;
    }
}

// 查看用户的温度预设上传历史 (Disabled)
async function viewUploadHistory() {
    log('Upload history is disabled.');
    showNotification('History disabled', 'info');
}

// 获取所有用户的温度预设统计（管理员功能） (Disabled)
async function getGlobalTemperatureStats() {
    log('Global stats disabled.');
    showNotification('Stats disabled', 'info');
}

// 显示Firestore安全规则配置建议
function showFirestoreRulesSuggestion() {
    log(`📋 Firebase Firestore安全规则配置建议:`);
    log(`请在Firebase控制台 → Firestore → 规则中设置以下规则:`);
    log(``);
    log(`rules_version = '2';`);
    log(`service cloud.firestore {`);
    log(`  match /databases/{database}/documents {`);
    log(`    // 允许已认证用户读写自己的数据`);
    log(`    match /users/{userId} {`);
    log(`      allow read, write: if request.auth != null && request.auth.uid == userId;`);
    log(`    }`);
    log(`    // 允许已认证用户上传温度预设数据`);
    log(`    match /temperaturePresets/{document} {`);
    log(`      allow create: if request.auth != null && request.auth.uid == resource.data.userId;`);
    log(`      allow read: if request.auth != null && request.auth.uid == resource.data.userId;`);
    log(`    }`);
    log(`  }`);
    log(`}`);
    log(``);
    log(`🔗 访问Firebase控制台: https://console.firebase.google.com/project/my-user-system/firestore/rules`);
    log(`⚠️  如果仍有问题，可以临时使用测试规则（不安全）:`);
    log(`allow read, write: if request.auth != null;`);
    
    showNotification('Firestore安全规则配置说明已显示在日志中', 'info', 5000);
}

// ========== Session Data Collection Functions ==========

// Initialize session data collection
function initializeSessionDataCollection() {
    currentSessionData = {
        sessionId: generateSessionId(),
        userId: window.currentUser?.uid || '',
        userEmail: window.currentUser?.email || '',
        startTime: new Date().toISOString(),
        endTime: null,
        duration: 0,
        deviceSettings: {
            preset: currentPreset,
            targetTemp: globalTempF[currentPreset - 1] || 0,
            holdTime: parseInt(document.getElementById('holdTime')?.value) || 30,
            autoShutTime: parseInt(document.getElementById('autoShutTime')?.value) || 2,
            ledMode: document.getElementById('ledPresetSelect')?.selectedOptions[0]?.text || '',
            ledValue: document.getElementById('ledPresetSelect')?.value || '',
            brightness: parseInt(document.getElementById('brightness')?.value) || 25
        },
        deviceInfo: {
            deviceName: document.getElementById('deviceName')?.textContent || '--',
            serialNumber: document.getElementById('serialNumber')?.textContent || '--',
            modelName: document.getElementById('modelName')?.textContent || '--',
            hardwareVersion: document.getElementById('hardwareVersion')?.textContent || '--',
            softwareVersion: document.getElementById('softwareVersion')?.textContent || '--',
            manufacturer: document.getElementById('manufacturer')?.textContent || '--'
        },
        temperatureData: [],
        sessionStats: {
            maxTemp: 0,
            minTemp: 999,
            avgTemp: 0,
            batteryStart: 0,
            batteryEnd: 0,
            totalDataPoints: 0
        }
    };
    
    sessionStartTime = Date.now();
    sessionDataPoints = [];
    isSessionDataCollection = true;
    
    log(`🔥 Session data collection started - Session ID: ${currentSessionData.sessionId}`);
    updateSessionDataCollectionUI(true);
}

// Generate unique session ID
function generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${random}`;
}

// Collect real-time data point during session
function collectSessionDataPoint(deviceStatus) {
    if (!isSessionDataCollection || !currentSessionData) {
        return;
    }

    const currentTime = Date.now();
    const elapsedSeconds = Math.floor((currentTime - sessionStartTime) / 1000);
    
    const dataPoint = {
        timestamp: new Date().toISOString(),
        elapsedSeconds: elapsedSeconds,
        temperature: deviceStatus.realTemp || 0,
        batteryLevel: deviceStatus.batteryLevel || 0,
        chargeState: deviceStatus.chargeState || 0,
        brightness: deviceStatus.brightness || 0,
        remainTime: deviceStatus.remainTime || 0,
        sessionRemainTime: deviceStatus.sessionRemainTime || 0
    };
    
    // Add to session data
    currentSessionData.temperatureData.push(dataPoint);
    sessionDataPoints.push(dataPoint);
    
    // Update session stats
    const stats = currentSessionData.sessionStats;
    stats.maxTemp = Math.max(stats.maxTemp, dataPoint.temperature);
    stats.minTemp = Math.min(stats.minTemp, dataPoint.temperature);
    stats.totalDataPoints = currentSessionData.temperatureData.length;
    
    // Set battery start value on first data point
    if (stats.totalDataPoints === 1) {
        stats.batteryStart = dataPoint.batteryLevel;
    }
    stats.batteryEnd = dataPoint.batteryLevel;
    
    // Calculate average temperature
    const tempSum = currentSessionData.temperatureData.reduce((sum, point) => sum + point.temperature, 0);
    stats.avgTemp = Math.round(tempSum / stats.totalDataPoints);
}

// Finalize session data collection
function finalizeSessionDataCollection() {
    if (!isSessionDataCollection || !currentSessionData) {
        return null;
    }
    
    const endTime = new Date().toISOString();
    const duration = Math.floor((Date.now() - sessionStartTime) / 1000);
    
    currentSessionData.endTime = endTime;
    currentSessionData.duration = duration;
    
    isSessionDataCollection = false;
    
    log(`🔥 Session data collection completed - Duration: ${duration}s, Data points: ${currentSessionData.temperatureData.length}`);
    updateSessionDataCollectionUI(false);
    
    return currentSessionData;
}

// Update UI to show session data collection status
function updateSessionDataCollectionUI(isCollecting) {
    const statusElement = document.getElementById('sessionDataStatus');
    const statusTextElement = document.getElementById('sessionDataStatusText');
    
    if (statusElement && statusTextElement) {
        if (isCollecting) {
            statusElement.style.display = 'block';
            statusElement.style.color = '#22c55e'; // Green color for active recording
            statusTextElement.innerHTML = '<i class="fas fa-circle" style="animation: pulse 1.5s infinite;"></i> Recording session data...';
        } else {
            statusElement.style.color = '#6b7280'; // Gray color
            statusTextElement.innerHTML = '<i class="fas fa-check-circle"></i> Session data ready for upload';
            
            // Hide status after 3 seconds
            setTimeout(() => {
                if (statusElement) {
                    statusElement.style.display = 'none';
                }
            }, 3000);
        }
    }
    
    const statusText = isCollecting ? 'Recording session data...' : 'Session data collected';
    log(`📊 Session status: ${statusText}`);
}

// Upload session data to Firebase (Disabled)
async function uploadSessionData(sessionData) {
    log('Session data upload is disabled.');
    return;
}

// Update session upload status in UI
function updateSessionUploadStatus(status, timestamp, sessionId) {
    // Update upload status display in the Firebase section
    const uploadStatusElement = document.getElementById('upload-status');
    const uploadTimestampElement = document.getElementById('upload-timestamp');
    
    const statusMessages = {
        'success': '✅ Session uploaded',
        'error': '❌ Upload failed',
        'uploading': '⏳ Uploading...'
    };
    
    if (uploadStatusElement) {
        uploadStatusElement.textContent = statusMessages[status];
        uploadStatusElement.className = `upload-status ${status}`;
    }
    
    if (uploadTimestampElement) {
        uploadTimestampElement.textContent = timestamp;
    }
    
    log(`📊 Upload status: ${statusMessages[status]} at ${timestamp}`);
    
    // This could be enhanced to update specific UI elements
    if (status === 'success' && sessionId) {
        log(`📋 Session ID: ${sessionId}`);
        
        // Update session data status indicator
        const statusElement = document.getElementById('sessionDataStatus');
        const statusTextElement = document.getElementById('sessionDataStatusText');
        
        if (statusElement && statusTextElement) {
            statusElement.style.display = 'block';
            statusElement.style.color = '#22c55e';
            statusTextElement.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Session data uploaded successfully!';
            
            // Hide after 5 seconds
            setTimeout(() => {
                if (statusElement) {
                    statusElement.style.display = 'none';
                }
            }, 5000);
        }
    }
}

// Notify监听相关变量
let rxCharacteristic = null;
let notificationsEnabled = true;
let notifyPacketCount = 0;
let deviceInfoPacketCount = 0;
let globalPresetIndex = 0;
let globalTempF = [0,0,0,0,0,0];
let globalTempC = [0,0,0,0,0,0];
let currentPreset = 1; // 当前预设值 (1-5)
let holdTime = [30, 30, 30, 30, 30, 30]; // holdTime[0]为原来的全局设置，holdTime[1-5]为各预设的Hold Time
let profile = [0xa1, 0xa1, 0xa1, 0xa1, 0xa1, 0xa1]; // profile[0]为原来的全局设置，profile[1-5]为各预设的Profile模式
// 当前设备状态跟踪 - B9命令的所有字节状态
let currentB9State = {
    byte3: 0x01,   // 预设值 (1-5)
    byte4: 40,     // 功率设置 (20-60)
    byte6: 0x00,   // LED值
    byte8: 0x02,   // Auto Shut Time (0-30分钟)
    byte10: 0x00,  // Session状态
    byte11: 0x00,  // Haptic反馈 (0/1)
    byte12: 0x00,  // Session Boost
    byte13: 25,    // Brightness (0-100)
    byte18: 0x00,  // Temperature Display Mode (0=Ideal, 1=Real)
};

// LED颜色映射
const LED_COLORS = {
    0x00: 'Clam',
    0x01: 'Stealth',
    0x02: 'Purple',
    0x03: 'Blue',
    0x04: 'Cyan',
    0x05: 'Green',
    0x06: 'Yellow',
    0x07: 'Orange',
    0x08: 'Red',
    0x09: 'Pink',
    0x0A: 'Cali Sunset',
    0x0B: 'Purple Haze',
    0x0C: 'Northern Nights',
    0x0D: 'Vegas Nights',
    0x0E: 'Blue Dream',
    0x0F: 'Strawberry Cough',
    0x10: 'Florida Groves',
    0x11: 'Lime Light',
    0x18: 'Blue Cheese',
    0x19: 'Golden Goat',
    0x1A: 'Grape Ape',
    0x1B: 'Miami Vice',
    0x1C: 'Purple Urkle'
};

// OTA协议常量 - 匹配固件代码格式
const CHUNK_SIZE = 16;  // 每个数据包的数据大小
const PACKET_SIZE = 20; // 总包大小：4字节地址 + 16字节数据
const BLOCK_SIZE = 2048; // Flash块大小
const RESPONSE_TIMEOUT = 10000; // 响应超时时间

// 服务和特征UUID（请根据实际情况修改）
const SERVICE_UUID = '55535343-fe7d-4ae5-8fa9-9fafd205e455';
const TX_CHARACTERISTIC_UUID = '49535343-8841-43f4-a8d4-ecbe34729bb3';
const RX_CHARACTERISTIC_UUID = '49535343-1e4d-4bd9-ba61-23c647249616';

function log(message) {
    const logOutput = document.getElementById('logOutput');
    const timestamp = new Date().toLocaleTimeString();
    logOutput.textContent += `[${timestamp}] ${message}\n`;
    logOutput.scrollTop = logOutput.scrollHeight;
}

function clearLog() {
    document.getElementById('logOutput').textContent = '';
}

// 现代化通知系统
function showNotification(message, type = 'success', duration = 3000) {
    const notification = document.getElementById('notification');
    const icon = notification.querySelector('i');
    const text = document.getElementById('notificationText');
    
    // 重置类名
    notification.className = 'notification';
    
    // 设置图标和样式
    switch(type) {
        case 'success':
            icon.className = 'fas fa-check-circle';
            notification.classList.add('show');
            break;
        case 'error':
            icon.className = 'fas fa-exclamation-circle';
            notification.classList.add('show', 'error');
            break;
        case 'warning':
            icon.className = 'fas fa-exclamation-triangle';
            notification.classList.add('show', 'warning');
            break;
        case 'info':
            icon.className = 'fas fa-info-circle';
            notification.classList.add('show', 'info');
            break;
    }
    
    text.textContent = message;
    
    // 自动隐藏
    setTimeout(() => {
        notification.classList.remove('show');
    }, duration);
}

        // 更新preset卡片的选中状态
        function updatePresetCardSelection(selectedPreset) {
            // 移除所有preset卡片的选中状态
            for (let i = 1; i <= 5; i++) {
                const presetCard = document.querySelector(`#tempPresets .preset-card:nth-child(${i})`);
                if (presetCard) {
                    presetCard.classList.remove('selected');
                }
            }
            
            // 为当前选中的preset添加选中状态
            if (selectedPreset >= 1 && selectedPreset <= 5) {
                const selectedCard = document.querySelector(`#tempPresets .preset-card:nth-child(${selectedPreset})`);
                if (selectedCard) {
                    selectedCard.classList.add('selected');
                }
            }
        }



    async function selectPreset(presetNumber) {
        // 验证预设编号范围
        if (presetNumber < 1 || presetNumber > 5) {
            log(`Error: Invalid preset number ${presetNumber}`);
            return;
        }
        
        // 如果已经是当前预设，则不需要切换
        if (currentPreset === presetNumber) {
            log(`Preset ${presetNumber} is already selected`);
            return;
        }
        
        // 设置新的预设值
        currentPreset = presetNumber;
        
        // 更新按钮显示
        document.getElementById('presetBtn').textContent = currentPreset;
        
        // 更新preset卡片选中状态
        updatePresetCardSelection(currentPreset);
        
        // 更新当前preset对应的模式显示
    //    updateCurrentPresetModeDisplay(currentPreset);
        
        // 更新Custom配置显示
        updateCustomUI();
        
        // 发送预设切换命令 - 使用B9命令格式，第3字节为预设值
        await sendB9Command(
            { byte3: currentPreset },
            `Preset selected: ${currentPreset}`
        );
        
        log(`✓ Preset ${currentPreset} selected`);
    }








// 添加连接状态动画
function updateConnectionStatusWithAnimation(connected, connecting = false) {
    const statusElement = document.getElementById('connectionStatus');
    const indicator = document.getElementById('statusIndicator');
    const icon = document.getElementById('statusIcon');
    const text = document.getElementById('statusText');
    
    // 获取控制按钮
    const connectBtn = document.getElementById('connectBtn');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const startOtaBtn = document.getElementById('startOtaBtn');
    const syncTimeBtn = document.getElementById('syncTimeBtn');
    
    if (connecting) {
        statusElement.className = 'status status-disconnected';
        indicator.className = 'status-indicator connecting';
        icon.className = 'fas fa-spinner spinning';
        text.textContent = 'Connecting...';
        return;
    }
    
    if (connected) {
        statusElement.className = 'status status-connected bounce';
        indicator.className = 'status-indicator connected';
        icon.className = 'fas fa-link';
        text.textContent = 'Device Connected';
        
        // 启用连接状态的按钮
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        startOtaBtn.disabled = !firmwareData;
        syncTimeBtn.disabled = false;
        const otaTestBtn = document.getElementById('otaTestBtn');
        if (otaTestBtn) otaTestBtn.disabled = false;
        
        // 启用设备控制相关的控件
        const sessionControlBtn = document.getElementById('sessionControlBtn');
        const presetBtn = document.getElementById('presetBtn');
        const autoShutTimeInput = document.getElementById('autoShutTime');
        // const holdTimeInput = document.getElementById('holdTime');
        const brightnessInput = document.getElementById('brightness');

        const ledPresetSelect = document.getElementById('ledPresetSelect');
        const cleaningAssistBtn = document.getElementById('cleaningAssistBtn');
        if (cleaningAssistBtn) cleaningAssistBtn.disabled = false;

        const boostBtn = document.getElementById('boostBtn');
        if (boostBtn) boostBtn.disabled = false;

        if (sessionControlBtn) sessionControlBtn.disabled = false;
        if (presetBtn) presetBtn.disabled = false;
        if (autoShutTimeInput) autoShutTimeInput.disabled = false;
        // if (holdTimeInput) holdTimeInput.disabled = false;
        if (brightnessInput) brightnessInput.disabled = false;

        if (ledPresetSelect) ledPresetSelect.disabled = false;
        const tempDisplayToggleBtn = document.getElementById('tempDisplayToggleBtn');
        if (tempDisplayToggleBtn) tempDisplayToggleBtn.disabled = false;
        const bleNameInput = document.getElementById('bleNameInput');
        const setBleNameBtn = document.getElementById('setBleNameBtn');
        if (bleNameInput) bleNameInput.disabled = false;
        if (setBleNameBtn) setBleNameBtn.disabled = false;

        const bleSerialInput = document.getElementById('bleSerialInput');
        const setBleSerialBtn = document.getElementById('setBleSerialBtn');
        if (bleSerialInput) bleSerialInput.disabled = false;
        if (setBleSerialBtn) setBleSerialBtn.disabled = false;

        const bleModelInput = document.getElementById('bleModelInput');
        const setBleModelBtn = document.getElementById('setBleModelBtn');
        if (bleModelInput) bleModelInput.disabled = false;
        if (setBleModelBtn) setBleModelBtn.disabled = false;

        // 启用温度预设输入框
        ['tempF1', 'tempF2', 'tempF3', 'tempF4', 'tempF5'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.disabled = false;
                input.classList.remove('heating-disabled');
                // 为父容器也移除禁用类
                const container = input.closest('.preset-card');
                if (container) container.classList.remove('heating-disabled');
            }
        });
        
        showNotification('设备连接成功！', 'success');
    } else {
        statusElement.className = 'status status-disconnected';
        indicator.className = 'status-indicator disconnected';
        icon.className = 'fas fa-unlink';
        text.textContent = 'Device Not Connected';
        
        // 禁用连接状态的按钮
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        startOtaBtn.disabled = true;
        syncTimeBtn.disabled = true;
        
        // 禁用设备控制相关的控件
        const sessionControlBtn = document.getElementById('sessionControlBtn');
        const presetBtn = document.getElementById('presetBtn');
        const autoShutTimeInput = document.getElementById('autoShutTime');
        // const holdTimeInput = document.getElementById('holdTime');
        const brightnessInput = document.getElementById('brightness');

        const ledPresetSelect = document.getElementById('ledPresetSelect');
        const boostBtn = document.getElementById('boostBtn');

        if (sessionControlBtn) sessionControlBtn.disabled = true;
        if (presetBtn) presetBtn.disabled = true;
        if (autoShutTimeInput) autoShutTimeInput.disabled = true;
        // if (holdTimeInput) holdTimeInput.disabled = true;
        if (brightnessInput) {
            brightnessInput.disabled = true;
            brightnessInput.value = 25;
            updateBrightnessDisplay(25);
        }

        if (ledPresetSelect) ledPresetSelect.disabled = true;
        if (boostBtn) {
            boostBtn.disabled = true;
            updateBoostButton(0); // 重置为默认状态
        }
        const cleaningAssistBtnDisconnect = document.getElementById('cleaningAssistBtn');
        if (cleaningAssistBtnDisconnect) cleaningAssistBtnDisconnect.disabled = true;
        const tempDisplayToggleBtnDisconnect = document.getElementById('tempDisplayToggleBtn');
        if (tempDisplayToggleBtnDisconnect) {
            tempDisplayToggleBtnDisconnect.disabled = true;
            updateTempDisplayButton(0); // 重置为默认状态
        }
        const bleNameInput = document.getElementById('bleNameInput');
        const setBleNameBtn = document.getElementById('setBleNameBtn');
        if (bleNameInput) { bleNameInput.disabled = true; bleNameInput.value = ''; }
        if (setBleNameBtn) setBleNameBtn.disabled = true;

        const bleSerialInput = document.getElementById('bleSerialInput');
        const setBleSerialBtn = document.getElementById('setBleSerialBtn');
        if (bleSerialInput) { bleSerialInput.disabled = true; bleSerialInput.value = ''; }
        if (setBleSerialBtn) setBleSerialBtn.disabled = true;
        
        const bleModelInput = document.getElementById('bleModelInput');
        const setBleModelBtn = document.getElementById('setBleModelBtn');
        if (bleModelInput) { bleModelInput.disabled = true; bleModelInput.value = ''; }
        if (setBleModelBtn) setBleModelBtn.disabled = true;

        // 禁用温度预设输入框
        ['tempF1', 'tempF2', 'tempF3', 'tempF4', 'tempF5'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.disabled = true;
                // 重置值
                const presetValues = [450, 500, 550, 600, 613];
                const presetIndex = parseInt(id.replace('tempF', '')) - 1;
                if (presetIndex >= 0 && presetIndex < presetValues.length) {
                    input.value = presetValues[presetIndex];
                }
            }
        });
        
        // 重置notify状态
        notificationsEnabled = false;
        const notifyToggle = document.getElementById('notifyToggle');
        if (notifyToggle) {
            notifyToggle.checked = false;
        }
        document.getElementById('notifyStatus').textContent = 'Disabled';
        document.getElementById('deviceStatusInfo').style.display = 'none';
    }
    
    // 更新星光效果
    updateStarBorderEffect();

    // 移除动画类
    setTimeout(() => {
        statusElement.classList.remove('bounce');
    }, 600);
}

// 添加按钮加载状态
function setButtonLoading(buttonId, loading = true) {
    const button = document.getElementById(buttonId);
    if (loading) {
        button.classList.add('loading');
        button.disabled = true;
    } else {
        button.classList.remove('loading');
    }
}

// 动态更新星光效果禁用状态
function updateStarBorderEffect() {
    const containers = document.querySelectorAll('.star-border-container');
    containers.forEach(container => {
        const button = container.querySelector('button');
        if (button && button.disabled) {
            container.classList.add('effect-disabled');
        } else {
            container.classList.remove('effect-disabled');
        }
    });
}

// 优化进度条显示
function updateProgressWithAnimation(current, total) {
    const percentage = Math.round((current / total) * 100);
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `Progress: ${current}/${total} (${percentage}%)`;
    
    // 添加脉冲效果
    if (percentage > 0 && percentage < 100) {
        progressBar.classList.add('pulse');
    } else {
        progressBar.classList.remove('pulse');
    }
}

// LED颜色预览功能
function updateLedPreview(colorValue) {
    const preview = document.getElementById('ledPreview');
    const colorName = LED_COLORS[colorValue] || 'unknown';
    
    // 移除所有颜色类
    preview.className = 'led-preview';
    
    // 添加对应的颜色类
    const colorClass = colorName.toLowerCase().replace(/\s+/g, '-');
    preview.classList.add(colorClass);
}

// 处理设备响应
function handleResponse(event) {
    const data = new Uint8Array(event.target.value.buffer);
    // 打印data 16进制  数据和长度
    // 检查是否是设备状态notify数据包 (20字节，包头包尾都是0xA9)
    if (data.length === 20 && data[0] === 0xA9 && data[19] === 0xA9) {
        handleNotifyData(data);
        return;
    }

    if (data.length >= 5 && data[0] === 0xA2) {
        handleDeviceStatsData(data);
        return;
    }


    // 检查是否是温度设定数据包 (8字节，包头包尾都是0xA3)
    if (data.length === 8 && data[0] === 0xA3 && data[7] === 0xA3) {
        handleTempSettingData(data);
        return;
    }

    if (data.length === 6 && data[0] === 0xA7 && data[5] === 0xA7) {
        handleTempTimeData(data);
        return;
    }

    if (data.length === 5 && data[0] === 0xA5 && data[4] === 0xA5) {
        handleProfileData(data);
        return;
    }

    if ((data[0] === 0xaa && data[data.length-1] === 0xaa && data.length === 19) ||
        (data[0] === 0xab && data[data.length-1] === 0xab && data.length === 19)) {
        log(`Received response: length=${data.length} bytes, content=${Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
        handleCustomProfileData(data);
        return;
    }



    // 检查是否是设备信息命令 C1-C7
    if (data.length >= 2 && data[0] >= 0xC1 && data[0] <= 0xc7) {
        handleDeviceInfoCommand(data);
        return;
    }

    //log(`Received response: length=${data.length} bytes, content=${Array.from(data).map(b => String.fromCharCode(b)).join('')}`);
    
    // 检查是否是OK响应
    // const responseText = Array.from(data).map(b => String.fromCharCode(b)).join('');
    // if (responseText.startsWith('OK')) {
    //     log(`Block confirmed: ${responseText}`);
    //     if (responsePromise) {
    //         responsePromise.resolve(data);
    //         responsePromise = null;
    //     }
    //     waitingForResponse = false;
    // } else {
    //     log(`Unexpected response: ${responseText}`);
    //     // 即使响应格式不符合预期，也要清除等待状态避免卡住
    //     if (responsePromise && waitingForResponse) {
    //         log(`Clearing response wait due to unexpected response`);
    //         responsePromise.resolve(data);
    //         responsePromise = null;
    //         waitingForResponse = false;
    //     }
    // }



    // 先把数据转成 HEX 字符串方便调试
    // 假设 data 是 Uint8Array 或者数组
    const hexData = Array.from(data)
        .map(b => b.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');

    // 仍然保留 text 转换用于判断 'OK'
    const responseText = Array.from(data).map(b => String.fromCharCode(b)).join('');

    if (responseText.startsWith('OK')) {
        log(`Block confirmed: ${responseText}`);
        if (responsePromise) {
            responsePromise.resolve(data);
            responsePromise = null;
        }
        waitingForResponse = false;
    } else {
        // --- 修改了这里 ---
        // 打印原始 Hex 数据，并在括号里尝试打印一下字符串(方便看有没有混杂文本)
        log(`Unexpected response [Hex]: ${hexData}`);
        // log(`Raw text view: ${responseText}`); // 如果需要对照看乱码可以保留这行
        
        // 即使响应格式不符合预期，也要清除等待状态避免卡住
        if (responsePromise && waitingForResponse) {
            log(`Clearing response wait due to unexpected response`);
            responsePromise.resolve(data);
            responsePromise = null;
            waitingForResponse = false;
        }
    }


}

// 处理设备状态notify数据
function handleNotifyData(data) {
    notifyPacketCount++;
    
    // 验证数据包格式
    if (data[1] !== 20) {
        log(`Invalid notify packet length field: ${data[1]}`);
        return;
    }
    
    // 解析数据包
    const preset = data[3];
    const tempSetting =    globalTempF[preset];//data[4];
    const ledPreset = data[6];
    const sessionEnable = data[7];
    const autoShutTime = data[8];
    const remainTime = data[9];
    const realTemp = (data[10] << 8) | data[11]; // 温度合并
    const tempUnit = data[12] === 0x0f ? '℉' : '℃'; // 0x0f=华氏度, 0x0c=摄氏度
    const sessionRemainTime = data[13];
    const hapticFeedback = data[14];
    const sessionBoost = data[15];
    const batteryLevel = data[16];
    const chargeState = data[17];
    const brightness = data[18];
    
    // 创建设备状态对象
    const deviceStatus = {
        preset,
        tempSetting,
        realTemp,
        tempUnit,
        ledPreset,
        sessionEnable,
        autoShutTime,
        remainTime,
        sessionRemainTime,
        hapticFeedback,
        sessionBoost,
        batteryLevel,
        chargeState,
        brightness
    };
    
    // 更新显示
    updateDeviceStatus(deviceStatus);
    
    // 如果正在进行会话数据收集，则收集数据点
    if (isSessionDataCollection && sessionEnable) {
        collectSessionDataPoint(deviceStatus);
    }
    
    // 更新原始数据显示
    // const rawDataHex = Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    // document.getElementById('rawData').textContent = rawDataHex;
    // document.getElementById('packetCount').textContent = notifyPacketCount;
    // document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    

}


        
function handleTempTimeData(data) {
    if (data[1] !== 6) {
        log(`Invalid temp time packet length field: ${data[1]}`);
        return;
    }    
    const preset = data[2]; // 挡位值
    const holdTimeValue = (data[3] << 8) | data[4];
    
    // 更新holdTime数组
    holdTime[preset] = holdTimeValue;
    
    // 更新对应的Hold Time输入框
    if (preset >= 1 && preset <= 5) {
        const element = document.getElementById(`holdTime${preset}`);
        if (element) {
            element.value = holdTimeValue;
        }
    }
    
    // 如果更新的是当前选定的挡位，更新Hold Time显示
    if (preset === currentPreset) {
        updateHoldTimeDisplay();
    }
    
    log(`Received hold time for preset ${preset}: ${holdTimeValue} seconds`);
}

// 处理Profile数据 (A8命令)
function handleProfileData(data) {
    if (data[1] !== 5) {
        log(`Invalid profile packet length field: ${data[1]}`);
        return;
    }    
    const preset = data[2]; // 挡位值
    const profileValue = data[3]; // profile值
    
    // 更新profile数组
    profile[preset] = profileValue;
    
    // 更新对应的Profile下拉框
    if (preset >= 1 && preset <= 5) {
        const element = document.getElementById(`profile${preset}`);
        if (element) {
            // 将数值转换为十六进制字符串格式以匹配option值
            element.value = `0x${profileValue.toString(16).toLowerCase()}`;
        }
    }
    
    log(`Received profile for preset ${preset}: ${getProfileName(profileValue)} (0x${profileValue.toString(16).toUpperCase()})`);
}


function updateCustomUI() {
    const tempInputs = document.querySelectorAll('#customConfigCard .custom-temp');
    const timeInputs = document.querySelectorAll('#customConfigCard .custom-time');
    
    if (customSettings[currentPreset]) {
        for (let i = 0; i < 10; i++) { // 扩展到10个点
            if (tempInputs[i] && customSettings[currentPreset].temps[i] !== undefined) {
                tempInputs[i].value = customSettings[currentPreset].temps[i];
            }
            if (timeInputs[i] && customSettings[currentPreset].times[i] !== undefined) {
                // point1的时间固定为0，不更新
                if (i !== 0) {
                    timeInputs[i].value = customSettings[currentPreset].times[i];
                }
            }
        }
    }
}

            function logCustomSettingsChange(preset, action, details = '') {
                const timestamp = new Date().toLocaleTimeString();
                const presetData = customSettings[preset];
                if (presetData) {
                    console.log(`[${timestamp}] CustomSettings变化 - Preset ${preset} ${action}:`);
                    console.log(`  温度: [${presetData.temps.join(', ')}]`);
                    console.log(`  时间: [${presetData.times.join(', ')}]`);
                    if (details) {
                        console.log(`  详情: ${details}`);
                    }
                    log(`CustomSettings Preset ${preset} ${action} - 温度:[${presetData.temps.join(', ')}] 时间:[${presetData.times.join(', ')}]${details ? ' - ' + details : ''}`);
                }
            }

           function saveCurrentCustomUI() {
               const tempInputs = document.querySelectorAll('#customConfigCard .custom-temp');
               const timeInputs = document.querySelectorAll('#customConfigCard .custom-time');
               
               if (!customSettings[currentPreset]) {
                   customSettings[currentPreset] = { temps: [], times: [] };
               }
               
               for (let i = 0; i < 10; i++) { // 扩展到10个点
                   if (tempInputs[i]) {
                       customSettings[currentPreset].temps[i] = parseInt(tempInputs[i].value);
                   }
                   if (timeInputs[i]) {
                       customSettings[currentPreset].times[i] = parseInt(timeInputs[i].value) || 0;
                   }
               }
               
               // 打印变化
               logCustomSettingsChange(currentPreset, '用户手动保存', '从UI输入');
           }



          async function sendCustomProfile() {
             if (!characteristic) {
                 log('Error: Device not connected');
                 showNotification('设备未连接', 'error');
                 return;
             }
              
             // 保存当前UI数据到当前preset
             saveCurrentCustomUI();
             
             // 使用当前preset的数据（从customSettings获取）
             const currentPresetData = customSettings[currentPreset] || { temps: [400, 410, 420, 430, 440, 450, 460, 470, 480, 490], times: [0, 20, 30, 40, 50, 60, 70, 80, 90, 100] };
             
             // 组包并发送三包（ba/bb/bc头尾），包含preset信息，支持10个点
             for (let index = 0; index < 2; index++) {
                 let ble_tx_buff = new Uint8Array(19); // 增加一个字节用于preset
                 let ble_tx_len = 19;
                 if (index === 0) {
                     ble_tx_buff[0] = 0xba;
                     ble_tx_buff[1] = ble_tx_len;
                     ble_tx_buff[2] = currentPreset; // 使用Temperature Presets的preset值
                     ble_tx_buff[3] = currentPresetData.temps[0] >> 8;
                     ble_tx_buff[4] = currentPresetData.temps[0] & 0xff;
                     ble_tx_buff[5] = 0;
                     ble_tx_buff[6] = 0;
                     ble_tx_buff[7] = currentPresetData.times[0];
                     ble_tx_buff[8] = currentPresetData.temps[1] >> 8;
                     ble_tx_buff[9] = currentPresetData.temps[1] & 0xff;
                     ble_tx_buff[10] = 0;
                     ble_tx_buff[11] = 0;                    
                     ble_tx_buff[12] = currentPresetData.times[1];
                     ble_tx_buff[13] = currentPresetData.temps[2] >> 8;
                     ble_tx_buff[14] = currentPresetData.temps[2] & 0xff;
                     ble_tx_buff[15] = 0;
                     ble_tx_buff[16] = 0;
                     ble_tx_buff[17] = currentPresetData.times[2];
                     ble_tx_buff[18] = 0xba;
                 } else if (index === 1) {
                     ble_tx_buff[0] = 0xbb;
                     ble_tx_buff[1] = ble_tx_len;
                     ble_tx_buff[2] = currentPreset; // 使用Temperature Presets的preset值
                     ble_tx_buff[3] = currentPresetData.temps[3] >> 8;
                     ble_tx_buff[4] = currentPresetData.temps[3] & 0xff;
                     ble_tx_buff[5] = 0;
                     ble_tx_buff[6] = 0;
                     ble_tx_buff[7] = currentPresetData.times[3];
                     ble_tx_buff[8] = currentPresetData.temps[4] >> 8;
                     ble_tx_buff[9] = currentPresetData.temps[4] & 0xff;
                     ble_tx_buff[10] = 0;
                     ble_tx_buff[11] = 0;                    
                     ble_tx_buff[12] = currentPresetData.times[4];
                     ble_tx_buff[13] = currentPresetData.temps[5] >> 8;
                     ble_tx_buff[14] = currentPresetData.temps[5] & 0xff;
                     ble_tx_buff[15] = 0;
                     ble_tx_buff[16] = 0;
                     ble_tx_buff[17] = currentPresetData.times[5];
                     ble_tx_buff[18] = 0xbb;
                 } 
                 try {
                     // 如果不是第一个包，添加延迟避免GATT操作冲突
                     if (index > 0) {
                         await new Promise(resolve => setTimeout(resolve, 100));
                     }
                     
                     await characteristic.writeValue(ble_tx_buff);
                     const packetType = index === 0 ? 'ba' : index === 1 ? 'bb' : 'bc';
                     log(`✓ Custom Preset ${currentPreset} 参数包${index+1}已发送(${packetType}): [${Array.from(ble_tx_buff).map(b=>b.toString(16).padStart(2,'0')).join(' ')}]`);
                 
                                        // 1. 获取point1-8的最大时间值
                        const timeInputs = document.querySelectorAll('#customConfigCard .custom-time');
                        let maxCustomTime = 0;
                        for (let i = 0; i < timeInputs.length; i++) {
                            const t = parseInt(timeInputs[i].value) || 0;
                            if (t > maxCustomTime) maxCustomTime = t;
                        }
                        // 2. 遍历preset1-5，设置为Custom模式的hold time
                        // for (let i = 1; i <= 5; i++) {
                        //     const modeSelect = document.getElementById(`presetMode${i}`);
                        //     if (modeSelect && modeSelect.value === '0xF1') {
                        //         // 修改滑块UI
                        //         const holdTimeSlider = document.getElementById(`presetHoldTime${i}`);
                        //         if (holdTimeSlider) {
                        //             holdTimeSlider.value = maxCustomTime;
                        //             // 可选：同步显示
                        //             if (typeof updatePresetHoldTimeDisplay === 'function') {
                        //                 updatePresetHoldTimeDisplay(i, maxCustomTime);
                        //             }
                        //         }
                        //         // 发送蓝牙命令
                        //         if (typeof setPresetHoldTime === 'function') {
                        //             setPresetHoldTime(i, maxCustomTime);
                        //         }
                        //     }
                        // }      
                        // showNotification(`已同步Custom模式的Hold Time为${maxCustomTime}秒`, 'info', 2000);           
                    } catch (e) {
                     log(`✗ Custom参数包${index+1}发送失败: ${e.message}`);
                     showNotification(`自定义参数包${index+1}发送失败`, 'error');
                     return;
                 }


             }
             showNotification(`Custom Preset ${currentPreset} 参数全部发送成功`, 'success');
          }
      

document.getElementById('sendCustomProfileBtn').onclick = sendCustomProfile;



function handleCustomProfileData(data) {
    let group;    
    if (data[0] === 0xaa) {
        group = 0;
    } else if (data[0] === 0xab) {
        group = 1;
    }  else {
        log(`Unknown custom profile group: 0x${data[0].toString(16).toUpperCase()}`);
        return;
    }

        let preset = data[2]; // 新增：读取preset信息
        let temps = [];
        let times = [];

            // 其他包有4个点的数据
                    let temp = (data[3] << 8) | data[4];
                    let time = data[7];
                    temps.push(temp);
                    times.push(time);       
                    temp = (data[8] << 8) | data[9];
                    time = data[12];
                    temps.push(temp);
                    times.push(time);               
                    temp = (data[13] << 8) | data[14];
                    time = data[17];
                    temps.push(temp);
                    times.push(time); 
 
        // 验证preset范围
        if (preset >= 1 && preset <= 5) {
            if (!customSettings[preset]) {
                customSettings[preset] = { temps: [], times: [] };
            }            
            // 更新存储的数据
            const pointCount = 3;
            for(let i=0; i<pointCount; i++) {
                let idx = group*3 + i;
                if (idx < 6) { 
                    customSettings[preset].temps[idx] = temps[i];
                    customSettings[preset].times[idx] = times[i];
                }
            }
            if (currentPreset === preset) {
                updateCustomUI();
            }
            log(`收到自定义参数包${group+1} (Preset ${preset})：温度=[${temps.join(', ')}]，时间=[${temps.join(', ')}]`);
        } else {
            log(`收到无效的preset值: ${preset}`);
        }



}

// 设备信息存储对象
let deviceInfo = {
    deviceName: '',
    serialNumber: '',
    modelName: '',
    hardwareVersion: '',
    softwareVersion: '',
    manufacturer: '',
    c1Data: null,
    c2Data: null
};

// 处理设备信息命令 C1-C7
// 数据包格式：命令字节(0xC1-0xC7) + 长度字节 + 数据 + 结尾命令字节
function handleDeviceInfoCommand(data) {
    deviceInfoPacketCount++;
    
    const commandType = data[0];
    const packetLength = data[1];
    // 验证数据包长度
    if (data.length !== packetLength) {
        log(`Invalid packet length: expected ${packetLength}, got ${data.length}`);
        return;
    }
    // 验证结尾字节
    const endByte = data[packetLength - 1];
    if (endByte !== commandType) {
        log(`Invalid end byte: expected 0x${commandType.toString(16).toUpperCase()}, got 0x${endByte.toString(16).toUpperCase()}`);
        return;
    }  
    // 提取数据部分（去掉命令字节、长度字节和结尾字节）
    const dataPayload = data.slice(2, packetLength - 1);
    try {
        switch (commandType) {
            case 0xC1:
                // C1: 设备名称第一部分 (17字节数据)
                deviceInfo.c1Data = dataPayload;
                const c1Text = Array.from(dataPayload).map(b => String.fromCharCode(b)).join('').replace(/\0/g, '');
                log(`Received C1 (Device Name Part 1, ${dataPayload.length} bytes): "${c1Text}"`);
                break;
                
            case 0xC2:
                // C2: 设备名称第二部分 (12字节数据)，与C1组合成完整设备名称
                deviceInfo.c2Data = dataPayload;
                const c2Text = Array.from(dataPayload).map(b => String.fromCharCode(b)).join('').replace(/\0/g, '');
                log(`Received C2 (Device Name Part 2, ${dataPayload.length} bytes): "${c2Text}"`);
                
                if (deviceInfo.c1Data) {
                    // 合并C1和C2数据组成完整设备名称
                    const c1Part = Array.from(deviceInfo.c1Data).map(b => String.fromCharCode(b)).join('').replace(/\0/g, '');
                    const c2Part = Array.from(dataPayload).map(b => String.fromCharCode(b)).join('').replace(/\0/g, '');
                    deviceInfo.deviceName = (c1Part + c2Part).trim();
                    document.getElementById('deviceName').textContent = deviceInfo.deviceName;
                    log(`✓ Complete Device Name (C1+C2): "${deviceInfo.deviceName}"`);
                }
                break;
                
            case 0xC3:
                // C3: 序列号 (8字节数据)
                deviceInfo.serialNumber = Array.from(dataPayload)
                    .map(b => String.fromCharCode(b))
                    .join('')
                    .replace(/\0/g, '')
                    .trim();
                document.getElementById('serialNumber').textContent = deviceInfo.serialNumber;
                log(`✓ Received C3 (Serial Number, ${dataPayload.length} bytes): "${deviceInfo.serialNumber}"`);
                break;
                
            case 0xC4:
                // C4: 型号名称 (8字节数据)
                deviceInfo.modelName = Array.from(dataPayload)
                    .map(b => String.fromCharCode(b))
                    .join('')
                    .replace(/\0/g, '')
                    .trim();
                document.getElementById('modelName').textContent = deviceInfo.modelName;
                log(`✓ Received C4 (Model Name, ${dataPayload.length} bytes): "${deviceInfo.modelName}"`);
                break;
                
            case 0xC5:
                // C5: 硬件版本 (8字节数据)
                deviceInfo.hardwareVersion = Array.from(dataPayload)
                    .map(b => String.fromCharCode(b))
                    .join('')
                    .replace(/\0/g, '')
                    .trim();
                document.getElementById('hardwareVersion').textContent = deviceInfo.hardwareVersion;
                log(`✓ Received C5 (Hardware Version, ${dataPayload.length} bytes): "${deviceInfo.hardwareVersion}"`);
                break;
                
            case 0xC6:
                // C6: 软件版本 (12字节数据)
                deviceInfo.softwareVersion = Array.from(dataPayload)
                    .map(b => String.fromCharCode(b))
                    .join('')
                    .replace(/\0/g, '')
                    .trim();
                document.getElementById('softwareVersion').textContent = deviceInfo.softwareVersion;
                log(`✓ Received C6 (Software Version, ${dataPayload.length} bytes): "${deviceInfo.softwareVersion}"`);
                break;
                
            case 0xC7:
                // C7: 制造商 (12字节数据)
                deviceInfo.manufacturer = Array.from(dataPayload)
                    .map(b => String.fromCharCode(b))
                    .join('')
                    .replace(/\0/g, '')
                    .trim();
                document.getElementById('manufacturer').textContent = deviceInfo.manufacturer;
                log(`✓ Received C7 (Manufacturer, ${dataPayload.length} bytes): "${deviceInfo.manufacturer}"`);
                break;
                
            default:
                log(`Unknown device info command: 0x${commandType.toString(16).toUpperCase()}`);
                break;
        }
        
        // 显示设备信息面板
        document.getElementById('deviceInfoDisplay').style.display = 'block';
    } catch (error) {
        log(`✗ Error processing device info command 0x${commandType.toString(16).toUpperCase()}: ${error.message}`);
    }
}

function updateDeviceStatsDisplay(stats) {
    document.getElementById('favoriteTemp').textContent = `${stats.favoriteTempF}°F (${stats.favoriteTempC}°C)`;
    document.getElementById('totalHeatingCycles').textContent = stats.totalHeatingCycles;
    document.getElementById('mostCyclesInDay').textContent = stats.mostCyclesInDay;
    document.getElementById('chargeCycles').textContent = stats.chargeCycles;
    
    // Profile: 显示数字对应的模式文字 (根据MODE_TYPES映射)
    const PROFILE_MODE_MAP = {
        0xA1: 'Steady',
        0xB1: 'Ascent', 
        0xC1: 'Descent',
        0xD1: 'Valley',
        0xE1: 'Hill',
        0xF1: 'Custom'
    };
    const profileText = PROFILE_MODE_MAP[stats.profile] || `Unknown (${stats.profile})`;
    document.getElementById('profile').textContent = profileText;
    
    // Light Mode: 显示灯光对应模式文字
    const lightModeText = LED_COLORS[stats.lightMode] || `Unknown (${stats.lightMode})`;
    document.getElementById('lightMode').textContent = lightModeText;
    
    document.getElementById('deviceResets').textContent = stats.deviceResets;
    document.getElementById('favoriteHeatingTime').textContent = `${stats.favoriteHeatingTime}s`;
}
function updateSessionTotalTimeDisplay(totalTimeSeconds,deviceTimeSeconds) {
    // 将秒数转换为更易读的格式
    const hours = Math.floor(totalTimeSeconds / 3600);
    const minutes = Math.floor((totalTimeSeconds % 3600) / 60);
    const seconds = totalTimeSeconds % 60;

    const hours2 = Math.floor(deviceTimeSeconds / 3600);
    const minutes2 = Math.floor((deviceTimeSeconds % 3600) / 60);
    const seconds2 = deviceTimeSeconds % 60;


    let timeStr = '';
    if (hours > 0) {
        timeStr = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        timeStr = `${minutes}m ${seconds}s`;
    } else {
        timeStr = `${seconds}s`;
    }

    let timeStr2 = '';
    if (hours2 > 0) {
        timeStr2 = `${hours2}h ${minutes2}m ${seconds2}s`;
    } else if (minutes2 > 0) {
        timeStr2 = `${minutes2}m ${seconds2}s`;
    } else {
        timeStr2 = `${seconds2}s`;
    }


    document.getElementById('sessionTotalTime').textContent = timeStr;
    document.getElementById('DeviceOnTime').textContent = timeStr2;
}
function handleDeviceStatsData(data) {
    // 显示原始数据
    const rawDataHex = Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    log(`Received device statistics data (${data.length} bytes):`);
    log(`  Raw data: ${rawDataHex}`);    
            // 验证A2数据包格式：至少3字节（0xA2 + 长度 + 0xA2）
            if (data.length < 3) {
                log(`✗ A2 packet too short: ${data.length} bytes`);
                return;
            }
            
            // 验证包头和包尾
            if (data[0] !== 0xA2 || data[data.length - 1] !== 0xA2) {
                log(`✗ Invalid A2 packet format - missing header/footer`);
                return;
            }
            // 验证长度字段
            const declaredLength = data[1];
            if (declaredLength !== data.length) {
                log(`✗ A2 packet length mismatch - declared: ${declaredLength}, actual: ${data.length}`);
                return;
            }
            // 解析不同类型的A2数据包
            if (data.length === 19) {
                // 19字节的统计信息数据包
                try {
                    // 从数据包中提取统计信息（根据新的A2 13数据结构）
                    const stats = {
                        favoriteTempF: (data[2] << 8) | data[3],       // 喜爱温度华氏度
                        favoriteTempC: (data[4] << 8) | data[5],       // 喜爱温度摄氏度
                        totalHeatingCycles: (data[6] << 8) | data[7],  // 总加热次数
                        mostCyclesInDay: (data[8] << 8) | data[9],     // 单日最多加热次数
                        chargeCycles: (data[10] << 8) | data[11],      // 充电循环次数
                        profile: data[12],                             // 配置文件
                        lightMode: data[13],                           // 灯光模式
                        deviceResets: (data[14] << 8) | data[15],      // 设备重置总次数
                        favoriteHeatingTime: (data[16] << 8) | data[17] // 喜爱加热时间
                    };
                    
                    // 更新显示
                    updateDeviceStatsDisplay(stats);
                    
                    log(`✓ Device statistics parsed successfully:`);
                    log(`  Favorite Temperature: ${stats.favoriteTempF}°F (${stats.favoriteTempC}°C)`);
                    log(`  Total Heating Cycles: ${stats.totalHeatingCycles}`);
                    log(`  Most Cycles in Day: ${stats.mostCyclesInDay}`);
                    log(`  Charge Cycles: ${stats.chargeCycles}`);
                    log(`  Profile: ${stats.profile}`);
                    log(`  Light Mode: ${stats.lightMode}`);
                    log(`  Device Resets: ${stats.deviceResets}`);
                    log(`  Favorite Heating Time: ${stats.favoriteHeatingTime}s`);
                    
                    showNotification('设备统计信息获取成功！', 'success', 2000);
                    
                } catch (error) {
                    log(`✗ Failed to parse 19-byte A2 statistics: ${error.message}`);
                    showNotification('统计信息解析失败', 'error');
                }
            } 
            else if (data.length === 0x0B) {
                // 7字节的A2数据包 - Session Total Time
                try {

                    // 解析Session Total Time (4字节，大端序)
                    const sessionTotalTime = (data[2] << 24) | (data[3] << 16) | (data[4] << 8) | data[5];
                    const deviceOnTime = (data[6] << 24) | data[7] << 16 | data[8] << 8 | data[9];

                    log(`✓ Session Total Time received: ${sessionTotalTime} seconds, Device On Time: ${deviceOnTime} seconds`);
                    log(`  Raw time data: ${Array.from(data.slice(2, -1)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);


                    // 更新Session Total Time显示
                    updateSessionTotalTimeDisplay(sessionTotalTime, deviceOnTime);
                    

                    
                } catch (error) {
                    log(`✗ Failed to parse 7-byte A2 session time: ${error.message}`);
                }
            } 
            else if (data.length === 0x0D) {
                const presetCycles_1 = (data[2] << 8) | data[3];   
                const presetCycles_2 = (data[4] << 8) | data[5];   
                const presetCycles_3 = (data[6] << 8) | data[7];
                const presetCycles_4 = (data[8] << 8) | data[9];
                const presetCycles_5 = (data[10] << 8) | data[11];
                document.getElementById('presetCycles1').textContent = `${presetCycles_1}`; 
                document.getElementById('presetCycles2').textContent = `${presetCycles_2}`;
                document.getElementById('presetCycles3').textContent = `${presetCycles_3}`;
                document.getElementById('presetCycles4').textContent = `${presetCycles_4}`;
                document.getElementById('presetCycles5').textContent = `${presetCycles_5}`;  
            }
            else {
                // 其他长度的A2数据包
                log(`✓ Received A2 packet (${data.length} bytes) - data: ${Array.from(data.slice(2, -1)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
            }

}

// 处理温度设定数据包 - 格式: 0xA3 + 长度(8) + 预设索引 + 华氏温度(2字节) + 摄氏温度(2字节) + 0xA3
function handleTempSettingData(data) {
    // 验证数据包格式
    if (data[1] !== 8) {
        log(`Invalid temp setting packet length field: ${data[1]}`);
        return;
    }
    
    // 解析数据包
    const presetIndex = data[2]; // 预设索引 (1-5)
    const tempF = (data[3] << 8) | data[4]; // 华氏温度
    const tempC = (data[5] << 8) | data[6]; // 摄氏温度
    
    // 验证预设索引范围
    if (presetIndex < 1 || presetIndex > 5) {
        log(`Invalid preset index: ${presetIndex}`);
        return;
    }
    
    // 保存到全局变量
    globalPresetIndex = presetIndex;
    globalTempF[presetIndex] = tempF;
    globalTempC[presetIndex] = tempC;
    
    // 更新温度预设输入框
    document.getElementById(`tempF${presetIndex}`).value = tempF;
    
    // 显示原始数据
    const rawDataHex = Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    
    log(`Received temp setting for preset ${presetIndex}: ${tempF}°F`);
    log(`  Raw data: ${rawDataHex}`);
}

        // 更新设备状态显示
function updateDeviceStatus(status) {
    // 更新预设显示和同步当前预设值
    currentPreset = status.preset;
    document.getElementById('presetBtn').textContent = status.preset;
    
    document.getElementById('tempSetting').textContent = status.tempSetting + '°F';
    document.getElementById('realTemp').textContent = status.realTemp + '°F';
   //  document.getElementById('tempUnit').textContent = status.tempUnit;
    updatePresetCardSelection(currentPreset);
    // 更新LED预设显示和选择框
    const ledColorName = LED_COLORS[status.ledPreset] || `Unknown (0x${status.ledPreset.toString(16).padStart(2, '0')})`;
    document.getElementById('ledPreset').textContent = ledColorName;
    
    // 更新选择框
    const ledSelect = document.getElementById('ledPresetSelect');
    const ledHexValue = '0x' + status.ledPreset.toString(16).padStart(2, '0').toUpperCase();
    ledSelect.value = ledHexValue;
    
    // 更新LED颜色预览
    updateLedPreview(status.ledPreset);
    
    // 同步状态跟踪变量
    currentB9State.byte3 = status.preset;
    currentB9State.byte6 = status.ledPreset;
    currentB9State.byte8 = status.autoShutTime;
    currentB9State.byte10 = status.sessionEnable ? 0x01 : 0x00;
    currentB9State.byte13 = status.brightness;
    
    // 更新Session控制按钮
    updateSessionControlButton(status.sessionEnable);
    document.getElementById('autoShutTime').value = status.autoShutTime;
    document.getElementById('remainTime').textContent = status.remainTime;
    document.getElementById('sessionRemainTime').textContent = status.sessionRemainTime;
    // 更新Haptic按钮显示和状态
    const hapticButton = document.getElementById('hapticFeedback');
    const hapticState = status.hapticFeedback ? 'On' : 'Off';
    hapticButton.textContent = hapticState;
    hapticButton.className = status.hapticFeedback ? 'toggle-btn active' : 'toggle-btn';
    // 同步到currentB9State
    currentB9State.byte11 = status.hapticFeedback ? 0xAA : 0x00;

    // 更新Boost按钮显示
    currentB9State.byte12 = status.sessionBoost || 0;
    updateBoostButton(status.sessionBoost);

    document.getElementById('batteryLevel').textContent = status.batteryLevel + '%';
    
    // 充电状态显示
    const chargeStateText = status.chargeState === 1 ? 'Charging' : 'Not Charging';
    document.getElementById('chargeState').textContent = chargeStateText;
    
    document.getElementById('brightness').value = status.brightness;
    updateBrightnessDisplay(status.brightness);
    // 实时温度曲线（每次收到数据都采集）
    if (currentTempChart) {
        const now = new Date();
        const label = now.toLocaleTimeString();
        currentTempLabels.push(label);
        currentTempData.push(status.realTemp);
        if (currentTempLabels.length > MAX_POINTS) {
            currentTempLabels.shift();
            currentTempData.shift();
        }
        currentTempChart.update();
    }
}

// 等待响应
function waitForResponse(timeoutMs = RESPONSE_TIMEOUT) {
    return new Promise((resolve, reject) => {
        responsePromise = { resolve, reject };
        waitingForResponse = true;
        
        setTimeout(() => {
            if (waitingForResponse) {
                waitingForResponse = false;
                responsePromise = null;
                reject(new Error('Response timeout'));
            }
        }, timeoutMs);
    });
}

// 旧的updateConnectionStatus函数已被updateConnectionStatusWithAnimation替代

async function connectDevice() {
    // 检查用户是否已登录
    if (!checkAuthentication()) {
        return;
    }
    
    try {
        updateConnectionStatusWithAnimation(false, true); // 显示连接中状态
        setButtonLoading('connectBtn', true);
        log('Searching for Bluetooth devices...');
        
        bluetoothDevice = await navigator.bluetooth.requestDevice({

            acceptAllDevices: true,
            optionalServices: [SERVICE_UUID]
        });

        log(`Found device: ${bluetoothDevice.name}`);
        
        const server = await bluetoothDevice.gatt.connect();
        log('GATT server connected successfully');
        
        const service = await server.getPrimaryService(SERVICE_UUID);
        log('Service obtained successfully');
        
        characteristic = await service.getCharacteristic(TX_CHARACTERISTIC_UUID);
        log(`TX characteristic obtained: writeWithoutResponse=${characteristic.properties.writeWithoutResponse}, write=${characteristic.properties.write}`);
        
        // Get RX characteristic for listening to responses
        rxCharacteristic = await service.getCharacteristic(RX_CHARACTERISTIC_UUID);
        log('RX characteristic obtained successfully');
        
        // Enable notifications to receive responses
        await rxCharacteristic.startNotifications();
        rxCharacteristic.addEventListener('characteristicvaluechanged', handleResponse);
        log('Response listener enabled successfully');

        // Listen for device disconnection
        bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);
        
        updateConnectionStatusWithAnimation(true);
        log('Bluetooth device connected successfully!');

        // 自动触发时间同步
        log('Auto-triggering time synchronization...');
        setTimeout(async () => {
            try {
                await syncTime();
                showNotification('设备时间已自动同步', 'success', 2000);
                
                // 时间同步成功后，自动开启实时监控
                log('Auto-enabling real-time monitoring...');
                setTimeout(async () => {
                    try {
                        if (!notificationsEnabled) {
                            await toggleNotifications();
                            log('✓ Real-time monitoring auto-enabled after time sync');
                        }
                    } catch (error) {
                        log(`Auto monitoring enable failed: ${error.message}`);
                        showNotification('自动开启监控失败', 'warning', 2000);
                    }
                }, 300); // 时间同步后再延迟300ms开启监控
                
            } catch (error) {
                log(`Auto time sync failed: ${error.message}`);
                showNotification('自动时间同步失败', 'warning', 2000);
            }
        }, 500); // 延迟500ms确保连接完全稳定
        
    } catch (error) {
        log(`Connection failed: ${error.message}`);
        updateConnectionStatusWithAnimation(false);
        showNotification(`连接失败: ${error.message}`, 'error');
    } finally {
        setButtonLoading('connectBtn', false);
    }
}

function onDisconnected() {
    log('Device disconnected');
    updateConnectionStatusWithAnimation(false);
    bluetoothDevice = null;
    characteristic = null;
    rxCharacteristic = null;
    
    // 重置设备信息显示
    document.getElementById('deviceInfoDisplay').style.display = 'none';
    deviceInfoPacketCount = 0;
    deviceInfo = {
        deviceName: '',
        serialNumber: '',
        modelName: '',
        hardwareVersion: '',
        softwareVersion: '',
        manufacturer: '',
        c1Data: null,
        c2Data: null
    };
    
    // 重置设备信息显示元素
    document.getElementById('deviceName').textContent = '--';
    document.getElementById('serialNumber').textContent = '--';
    document.getElementById('modelName').textContent = '--';
    document.getElementById('hardwareVersion').textContent = '--';
    document.getElementById('softwareVersion').textContent = '--';
    document.getElementById('manufacturer').textContent = '--';
    document.getElementById('rawDeviceInfo').textContent = 'No data';
    document.getElementById('deviceInfoPacketCount').textContent = '0';
    document.getElementById('lastInfoUpdate').textContent = 'Never';
}

async function disconnectDevice() {
    if (bluetoothDevice && bluetoothDevice.gatt.connected) {
        bluetoothDevice.gatt.disconnect();
        log('Device disconnected actively');
    }
    updateConnectionStatusWithAnimation(false);
    rxCharacteristic = null;
}



// Load switch3.bin firmware file automatically
async function loadDefaultFirmware() {
    try {
        log('Attempting to load firmware file: switch3.bin');
        const response = await fetch('./switch3.bin');
        if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();

            if (arrayBuffer.byteLength === 0) {
                log(`✗ 错误：固件文件 'switch3.bin' 为空或不存在。请确保文件位于正确的位置并且内容不为空。`);
                showNotification('固件文件加载失败', 'error');
                const startBtn = document.getElementById('startOtaBtn');
                if(startBtn) startBtn.disabled = true;
                return;
            }

            const originalData = new Uint8Array(arrayBuffer);
            
            // Pad firmware data to make it divisible by BLOCK_SIZE (2048 bytes)
            const paddedLength = Math.ceil(originalData.length / BLOCK_SIZE) * BLOCK_SIZE;
            firmwareData = new Uint8Array(paddedLength);
            firmwareData.fill(0xFF); // Fill with 0xFF to align with 2048-byte blocks
            firmwareData.set(originalData);
            
            totalPackets = Math.ceil(firmwareData.length / CHUNK_SIZE);
            
            // Update start button state
            const startBtn = document.getElementById('startOtaBtn');
            if (startBtn) {
                startBtn.disabled = !bluetoothDevice || !bluetoothDevice.gatt.connected;
            }
            
            log(`✓ Firmware file loaded successfully: switch3.bin`);
            log(`  Original size: ${originalData.length} bytes`);
            log(`  Padded size: ${firmwareData.length} bytes (${BLOCK_SIZE}-byte aligned)`);
            log(`  Estimated packets: ${totalPackets} packets (32 bytes each)`);
            log(`  Flash blocks: ${firmwareData.length / BLOCK_SIZE} blocks`);
            log(`  Estimated transmission time: ~${Math.ceil((totalPackets * 20 + (firmwareData.length / BLOCK_SIZE) * 200) / 1000)} seconds`);
        } else {
            log(`✗ Firmware file not found (HTTP ${response.status}): switch3.bin`);
            log(`  Please ensure switch3.bin exists in the current directory`);
        }
    } catch (error) {
        log(`✗ Failed to load firmware file: ${error.message}`);
        log(`  Please ensure switch3.bin exists in the current directory`);
    }
}

// CRC16计算 - 匹配固件中的算法
function calculateCRC16(startValue, data) {
    let crc = startValue;
    for (let i = 0; i < data.length; i++) {
        crc ^= (data[i] << 8);
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
            crc &= 0xFFFF;
        }
    }
    return crc;
}

// 创建OTA开始命令
function createStartCommand(dataLength, crc16) {
    const command = new Uint8Array(20);
    command.fill(0xFF); // Fill with 0xFF like in firmware
    
    const commandText = new TextEncoder().encode("ota start");
    command.set(commandText, 0);
    
    // 文件大小 (4字节, 大端序)
    command[10] = (dataLength >> 24) & 0xFF;
    command[11] = (dataLength >> 16) & 0xFF;
    command[12] = (dataLength >> 8) & 0xFF;
    command[13] = dataLength & 0xFF;
    
    // CRC16 (2字节, 大端序)
    command[14] = (crc16 >> 8) & 0xFF;
    command[15] = crc16 & 0xFF;
    
    return command;
}

// 创建数据包
function createDataPacket(chunkIndex, chunkData) {
    const packet = new Uint8Array(PACKET_SIZE);
    packet.fill(0xFF);

    // 地址 (4字节, 大端序)
    packet[0] = (chunkIndex >> 24) & 0xFF;
    packet[1] = (chunkIndex >> 16) & 0xFF;
    packet[2] = (chunkIndex >> 8) & 0xFF;
    packet[3] = chunkIndex & 0xFF;

    // 数据 (16字节)
    packet.set(chunkData, 4);

    return packet;
}

// 创建结束命令
function createEndCommand() {
    const command = new Uint8Array(20);
    command.fill(0xFF);
    
    const commandText = new TextEncoder().encode("ota finish");
    command.set(commandText, 0);
    
    return command;
}

async function sendPacket(packet, description, waitForAck = false, retryCount = 3) {
    if (!characteristic) {
        throw new Error('Bluetooth characteristic not connected');
    }

    for (let i = 0; i < retryCount; i++) {
        try {
            await characteristic.writeValue(packet);

            if (waitForAck) {
                const response = await waitForResponse(RESPONSE_TIMEOUT);
                log(`${description} acknowledged`);
                return response;
            } else {
                return null;
            }

        } catch (error) {
            if (error.message.includes('timeout') ||
                error.message.includes('GATT operation already in progress')) {
                log(`${description} failed, retry ${i + 1}/${retryCount}: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            } else {
                log(`Critical error for ${description}: ${error.message}`);
                throw error;
            }
        }
    }
    throw new Error(`${description} retry attempts exhausted`);
}

// 普通数据包：writeValueWithoutResponse，不等BLE协议层ACK
async function sendPacketNoAck(packet, description) {
    for (let i = 0; i < 8; i++) {
        try {
            await characteristic.writeValueWithoutResponse(packet);
            return;
        } catch (error) {
            if (error.message.includes('GATT operation already in progress') ||
                error.name === 'NetworkError') {
                // BLE队列满，短暂等待后重试（自然背压）
                await new Promise(resolve => setTimeout(resolve, 20));
                continue;
            }
            log(`sendPacketNoAck error: ${error.message}`);
            throw error;
        }
    }
    throw new Error(`${description} no-ack retry exhausted`);
}

function updateProgress(current, total) {
    updateProgressWithAnimation(current, total);
}

async function startOTA() {
    // 检查用户是否已登录
    if (!checkAuthentication()) {
        return;
    }
    
    if (!firmwareData || !characteristic) {
        log('Please select firmware file and connect device first');
        return;
    }
    
    // Check Bluetooth connection status
    if (!bluetoothDevice || !bluetoothDevice.gatt.connected) {
        log('Error: Device not connected');
        return;
    }

    isOtaInProgress = true;
    otaSequence = 0;
    sentPackets = 0;
    
    document.getElementById('startOtaBtn').disabled = true;
    document.getElementById('stopOtaBtn').disabled = false;
    
    try {
        log('Starting OTA upgrade...');
        
        // 1. 计算整个文件的CRC16
        const fileCRC = calculateCRC16(0xFFFF, firmwareData);
        log(`File CRC16: 0x${fileCRC.toString(16).toUpperCase()}`);
        
        // 2. 发送开始命令
        const startCommand = createStartCommand(firmwareData.length, fileCRC);
        await sendPacket(startCommand, 'START command', false);
        await new Promise(resolve => setTimeout(resolve, 50));  // 延时 50ms


        // 3. 发送数据包
        let offset = 0;
        let chunkIndex = 0;
        const totalChunks = Math.ceil(firmwareData.length / CHUNK_SIZE);

        while (offset < firmwareData.length && isOtaInProgress) {
            // Check connection status
            if (!bluetoothDevice || !bluetoothDevice.gatt.connected) {
                throw new Error('Device connection interrupted');
            }

            const remainingBytes = firmwareData.length - offset;
            const chunkSize = Math.min(CHUNK_SIZE, remainingBytes);
            const chunkData = firmwareData.slice(offset, offset + chunkSize);

            // 如果数据不足CHUNK_SIZE字节，用0xFF填充
            const paddedChunk = new Uint8Array(CHUNK_SIZE);
            paddedChunk.fill(0xFF);
            paddedChunk.set(chunkData);

            const dataPacket = createDataPacket(chunkIndex, paddedChunk);

            // 检查是否需要等待2048字节块的确认
            const isBlockEnd = ((offset + chunkSize) % BLOCK_SIZE === 0) || (offset + chunkSize >= firmwareData.length);

            if (chunkIndex % 128 === 0 || chunkIndex < 10) {
                log(`Send data packet ${chunkIndex}/${totalChunks}, offset: ${offset}, block_end: ${isBlockEnd}`);
            }

            if (isBlockEnd) {
                // 块最后一包：writeValue + 等待固件 "OK"
                await sendPacket(dataPacket, `block-end packet ${chunkIndex}`, true);
                await new Promise(resolve => setTimeout(resolve, 10));
            } else {
                // 普通包：writeValueWithoutResponse，不等BLE ACK，不加延时
                await sendPacketNoAck(dataPacket, `data packet ${chunkIndex}`);
            }

            offset += chunkSize;
            chunkIndex++;
            sentPackets++;

            updateProgress(sentPackets, totalPackets);
        }
        
        if (!isOtaInProgress) {
            log('OTA upgrade cancelled');
            return;
        }
        
        // 4. 发送结束命令
        log('Sending finish command...');
        const endCommand = createEndCommand();
        await sendPacket(endCommand, 'FINISH command', false);
        
        // 等待设备完成处理
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        log('OTA upgrade completed!');
        updateProgress(totalPackets, totalPackets);
        
    } catch (error) {
        log(`OTA upgrade failed: ${error.message}`);
    } finally {
        isOtaInProgress = false;
        document.getElementById('startOtaBtn').disabled = false;
        document.getElementById('stopOtaBtn').disabled = true;
    }
}

function stopOTA() {
    isOtaInProgress = false;
    log('User cancelled OTA upgrade');
    document.getElementById('startOtaBtn').disabled = false;
    document.getElementById('stopOtaBtn').disabled = true;
}

// Check browser support
if (!navigator.bluetooth) {
    log('Error: This browser does not support Web Bluetooth API');
    log('Please use Chrome, Edge, or other browsers that support Web Bluetooth');
    document.getElementById('connectBtn').disabled = true;
} else {
    log('Browser supports Web Bluetooth API');
}

// Initialize ALL effects when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check for file protocol, which can cause issues with fetch
    if (window.location.protocol === 'file:') {
        log('警告：页面似乎是通过 "file://"协议加载的。这可能会导致部分功能（如加载固件）因浏览器安全限制而失败。建议使用本地服务器（如 VS Code 的 Live Server）来运行。');
        showNotification('页面可能无法正常工作，建议使用Web服务器', 'warning', 5000);
    }

    // Initialize original functionalities from the old 'load' event
    loadDefaultFirmware();
    // 初始化各预设的holdTime输入框
    for (let i = 1; i <= 5; i++) {
        const element = document.getElementById(`holdTime${i}`);
        if (element) {
            element.value = holdTime[i];
        }
    }
    
    // 初始化各预设的profile下拉框
    for (let i = 1; i <= 5; i++) {
        const element = document.getElementById(`profile${i}`);
        if (element) {
            element.value = profile[i];
        }
    }
    
    // 初始化Hold Time显示
    updateHoldTimeDisplay();
    document.getElementById('brightness').value = currentB9State.byte13;
    updateBrightnessDisplay(currentB9State.byte13);

    updateLedPreview(0x00);
    const cards = document.querySelectorAll('.card');
    cards.forEach((card, index) => {
        card.style.animationDelay = `${index * 0.1}s`;
    });
    setTimeout(() => {
        showNotification('PY32F071 OTA升级工具已就绪', 'info', 2000);
    }, 1000);
    initCurrentTempChart();
    updateStarBorderEffect(); // Initial check

    // Initialize new visual effects
    const titleText = "EVO2*Dr.Dabber*";
    const circularTextContainer = document.getElementById('circular-text-container');
    if(circularTextContainer) {
        createCircularText(circularTextContainer, titleText);
        setupCircularTextHover();
    }
    initClickSpark();
    
    // 设置Device Status Monitor默认为开启状态
    const notifyToggle = document.getElementById('notifyToggle');
    const notifyStatus = document.getElementById('notifyStatus');
    if (notifyToggle && notifyStatus) {
        notifyToggle.checked = true;
        notifyStatus.textContent = 'Enabled';
        // 显示设备状态信息区域
        const deviceStatusInfo = document.getElementById('deviceStatusInfo');
        if (deviceStatusInfo) {
            deviceStatusInfo.style.display = 'block';
        }
    }
});

// 切换notifications开关
async function toggleNotifications() {
    // 检查用户是否已登录
    if (!checkAuthentication()) {
        return;
    }
    
    if (!rxCharacteristic) {
        log('Error: RX characteristic not available');
        showNotification('设备未连接，无法启用监控', 'error');
        return;
    }

    try {
        const toggle = document.getElementById('notifyToggle');
        
        if (notificationsEnabled) {
            // 禁用notifications
            await rxCharacteristic.stopNotifications();
            notificationsEnabled = false;
            document.getElementById('notifyStatus').textContent = 'Disabled';
            document.getElementById('deviceStatusInfo').style.display = 'none';
            toggle.checked = false;
            log('Device status notifications disabled');
            showNotification('实时监控已关闭', 'info', 2000);
        } else {
            // 启用notifications
            await rxCharacteristic.startNotifications();
            notificationsEnabled = true;
            document.getElementById('notifyStatus').textContent = 'Enabled';
            document.getElementById('deviceStatusInfo').style.display = 'block';
            toggle.checked = true;
            log('Device status notifications enabled');
            showNotification('实时监控已开启', 'success', 2000);
        }
    } catch (error) {
        log(`Failed to toggle notifications: ${error.message}`);
        showNotification(`监控切换失败: ${error.message}`, 'error');
    }
}


async function setBleSerial() {
    if (!checkAuthentication()) {
        return;
    }   
    if (!characteristic) {
        log('Error: Device not connected');
        showNotification('设备未连接', 'error');
        return;
    }
    try {
        const input = document.getElementById('bleSerialInput');
        const name = (input?.value || '').trim();
        if (!name) {
            showNotification('please input serial', 'warning');
            return;
        }
        const nameBytes = new TextEncoder().encode(name);
        if (nameBytes.length > 17) {
            showNotification('名称过长，最多17字节', 'error');
            return;
        }
        const packet = new Uint8Array(0x14);
        packet[0] = 0xD3;
        packet[1] = 0x14;
        for (let i = 0; i < nameBytes.length && i < 17; i++) {
            packet[2 + i] = nameBytes[i];
        }
        for (let i = 2 + nameBytes.length; i < 19; i++) {
            packet[i] = 0x00;
        }
        packet[19] = 0xD3;
        await characteristic.writeValue(packet);
        const packetHex = Array.from(packet).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        log(`✓ BLE serial set to "${name}"`);
        log(`  Packet data: ${packetHex}`);
        await new Promise(resolve => setTimeout(resolve, 100));



    } catch (error) {
        log(`✗ Failed to set serial number: ${error.message}`);
        showNotification(`set failed: ${error.message}`, 'error');
    }
}
// 同步时间功能 - 发送格式：b1 09 year(2 byte) month day hour minute b1

async function setBleName() {
    if (!checkAuthentication()) {
        return;
    }
    if (!characteristic) {
        log('Error: Device not connected');
        showNotification('设备未连接', 'error');
        return;
    }
    try {
        const input = document.getElementById('bleNameInput');
        const name = (input?.value || '').trim();
        if (!name) {
            showNotification('请输入蓝牙名称', 'warning');
            return;
        }
        const nameBytes = new TextEncoder().encode(name);
        if (nameBytes.length > 17) {
            showNotification('名称过长，最多17字节', 'error');
            return;
        }
        const packet = new Uint8Array(0x14);
        packet[0] = 0xD1;
        packet[1] = 0x14;
        for (let i = 0; i < nameBytes.length && i < 17; i++) {
            packet[2 + i] = nameBytes[i];
        }
        for (let i = 2 + nameBytes.length; i < 19; i++) {
            packet[i] = 0x00;
        }
        packet[19] = 0xD1;
        await characteristic.writeValue(packet);
        const packetHex = Array.from(packet).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        log(`✓ BLE name set to "${name}"`);
        log(`  Packet data: ${packetHex}`);
        await new Promise(resolve => setTimeout(resolve, 100));


        const packet1 = new Uint8Array(15);
        packet1[0] = 0xD2;
        packet1[1] = 0x0f;
        for (let i = 0; i < nameBytes.length && i < 12; i++) {
            packet1[2 + i] = 0x00;
        }
        packet1[14] = 0xD2;
        await characteristic.writeValue(packet1);

        const nameEl = document.getElementById('deviceName');
        if (nameEl) nameEl.textContent = name;
        showNotification('蓝牙名称已设置', 'success');
    } catch (error) {
        log(`✗ Failed to set BLE name: ${error.message}`);
        showNotification(`设置失败: ${error.message}`, 'error');
    }
}

async function setBleModel() {
    if (!checkAuthentication()) {
        return;
    }   
    if (!characteristic) {
        log('Error: Device not connected');
        showNotification('设备未连接', 'error');
        return;
    }
    try {
        const input = document.getElementById('bleModelInput');
        const name = (input?.value || '').trim();
        if (!name) {
            showNotification('please input model', 'warning');
            return;
        }
        const nameBytes = new TextEncoder().encode(name);
        if (nameBytes.length > 17) {
            showNotification('名称过长，最多17字节', 'error');
            return;
        }
        const packet = new Uint8Array(0x14);
        packet[0] = 0xD4;
        packet[1] = 0x14;
        for (let i = 0; i < nameBytes.length && i < 17; i++) {
            packet[2 + i] = nameBytes[i];
        }
        for (let i = 2 + nameBytes.length; i < 19; i++) {
            packet[i] = 0x00;
        }
        packet[19] = 0xD4;
        await characteristic.writeValue(packet);
        const packetHex = Array.from(packet).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        log(`✓ BLE model set to "${name}"`);
        log(`  Packet data: ${packetHex}`);
        await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
        log(`✗ Failed to set model number: ${error.message}`);
        showNotification(`set failed: ${error.message}`, 'error');
    }
}


async function syncTime() {
    // 检查用户是否已登录
    if (!checkAuthentication()) {
        return;
    }
    
    if (!characteristic) {
        log('Error: Device not connected');
        return;
    }

    try {
        // 获取当前时间
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // JavaScript月份从0开始
        const day = now.getDate();
        const hour = now.getHours();
        const minute = now.getMinutes();

        // 构造时间同步数据包：b1 09 year(2 byte) month day hour minute b1
        const timePacket = new Uint8Array(9);
        timePacket[0] = 0xB1;  // 起始标识
        timePacket[1] = 0x09;  // 命令类型 - 时间同步
        timePacket[2] = (year >> 8) & 0xFF;  // 年份高字节
        timePacket[3] = year & 0xFF;         // 年份低字节
        timePacket[4] = month;               // 月份
        timePacket[5] = day;                 // 日期
        timePacket[6] = hour;                // 小时
        timePacket[7] = minute;              // 分钟
        timePacket[8] = 0xB1;  // 结束标识

        // 发送时间同步数据包
        await characteristic.writeValue(timePacket);
        
        const timeStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const packetHex = Array.from(timePacket).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
        
                         log(`✓ Time sync packet sent: ${timeStr}`);
         log(`  Packet data: ${packetHex}`);
         
     } catch (error) {
         log(`✗ Failed to sync time: ${error.message}`);
     }
 }

 // 设置温度预设 - 发送格式：0xA3 + 8 + 预设索引 + 华氏温度(2字节) + 摄氏温度(2字节) + 0xA3
 async function setTemperature(presetIndex, tempF) {
     // 检查用户是否已登录
     if (!checkAuthentication()) {
         return;
     }
     
     if (!characteristic) {
         log('Error: Device not connected');
         return;
     }

     // 验证温度范围
     const temperature = parseInt(tempF);
     if (temperature < 250 || temperature > 650) {
         log(`Error: Temperature ${temperature}°F is out of range (300-600°F)`);
         // 恢复之前的值
         document.getElementById(`tempF${presetIndex}`).value = document.getElementById(`tempF${presetIndex}`).defaultValue;
         return;
     }

     try {
         // 华氏度转摄氏度 (C = (F - 32) * 5/9)
         const tempC = Math.round((temperature - 32) * 5 / 9);

         // 构造温度设置数据包：0xA3 + 8 + 预设索引 + 华氏温度(2字节) + 摄氏温度(2字节) + 0xA3
         const tempPacket = new Uint8Array(8);
         tempPacket[0] = 0xB3;                    // 起始标识
         tempPacket[1] = 8;                       // 数据长度
         tempPacket[2] = presetIndex;             // 预设索引 (1-5)
         tempPacket[3] = (temperature >> 8) & 0xFF;  // 华氏温度高字节
         tempPacket[4] = temperature & 0xFF;         // 华氏温度低字节
         tempPacket[5] = (tempC >> 8) & 0xFF;        // 摄氏温度高字节
         tempPacket[6] = tempC & 0xFF;               // 摄氏温度低字节
         tempPacket[7] = 0xB3;                    // 结束标识

         // 发送温度设置数据包
         await characteristic.writeValue(tempPacket);
         
         const packetHex = Array.from(tempPacket).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
         
         log(`✓ Temperature preset ${presetIndex} set to ${temperature}°F (${tempC}°C)`);
         log(`  Packet data: ${packetHex}`);
         
         // 自动上传温度预设数据
         await autoUploadOnPresetChange(presetIndex, temperature);
         
                   } catch (error) {
          log(`✗ Failed to set temperature: ${error.message}`);
      }
  }

  // 通用B9命令发送函数 - 可设置任意字节
  async function sendB9Command(updates, description) {
      if (!characteristic) {
          log('Error: Device not connected');
          return;
      }

      try {
          // 更新状态
          for (const [bytePos, value] of Object.entries(updates)) {
              currentB9State[bytePos] = value;
          }

          // 构造B9命令数据包：0xB9 + 长度(20) + 数据字节 + 0xB9
          const command = new Uint8Array(20);
          command[0] = 0xB9;        // 起始标识
          command[1] = 20;          // 数据长度
          command[2] = 0x00;
          command[3] = currentB9State.byte3 || 0x01;   // 预设值 (1-5)
          command[4] = currentB9State.byte4 || 40;     // 功率设置 (20-60)
          command[5] = 0x00;
          command[6] = currentB9State.byte6 || 0x00;   // LED值
          command[7] = 0x00;
          command[8] = currentB9State.byte8 || 0x00;   // Auto Shut Time (0-30分钟)
          command[9] = 0x0F;
          command[10] = currentB9State.byte10 || 0x00; // Session状态
          command[11] = currentB9State.byte11 || 0x00; // 未来扩展
          command[12] = currentB9State.byte12 || 0x00; // 未来扩展
          command[13] = currentB9State.byte13 || 0x00; // Brightness (0-100)
          command[14] = currentB9State.byte14 || 0x00; // 未来扩展
          command[15] = currentB9State.byte15 || 0x00; // 未来扩展
          command[16] = currentB9State.byte16 || 0x00; // 未来扩展
          command[17] = currentB9State.byte17 || 0x00; // 未来扩展
          command[18] = currentB9State.byte18 || 0x00; // Temperature Display Mode (0=Ideal, 1=Real)
          command[19] = 0xB9;       // 结束标识

          // 发送命令
          await characteristic.writeValue(command);
          
          const packetHex = Array.from(command).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
          
          log(`✓ ${description}`);
          log(`  Packet data: ${packetHex}`);
          
          // 显示更新的字节
          const updatedBytes = Object.entries(updates).map(([pos, val]) => 
              `${pos}: 0x${val.toString(16).padStart(2, '0')}`
          ).join(', ');
          log(`  Updated bytes: ${updatedBytes}`);
          
      } catch (error) {
          log(`✗ Failed to send B9 command (${description}): ${error.message}`);
      }
  }

  // 设置LED预设 - 调用通用B9命令函数
  async function setLedPreset(ledValue) {
      // 检查用户是否已登录
      if (!checkAuthentication()) {
          return;
      }
      
      // 解析十六进制值
      const ledPreset = parseInt(ledValue, 16);
      const colorName = LED_COLORS[ledPreset] || 'Unknown';
      
      // 验证LED值范围
      if (!(ledPreset in LED_COLORS)) {
          log(`Error: Invalid LED color value ${ledValue}`);
          return;
      }

      // 更新LED预览
      updateLedPreview(ledPreset);

      // 调用通用B9命令函数，只更新LED值（第6字节）
      await sendB9Command(
          { byte6: ledPreset },
          `LED color set to ${colorName} (${ledValue})`
      );
      
      showNotification(`LED颜色已设置为 ${colorName}`, 'success', 2000);
  }

  // 更新Session控制按钮状态并控制其他控件的启用/禁用
  function updateSessionControlButton(isSessionEnabled) {
      const sessionBtn = document.getElementById('sessionControlBtn');
      
      // 获取需要控制的元素
      const presetBtn = document.getElementById('presetBtn');
      const autoShutTimeInput = document.getElementById('autoShutTime');
    //   const holdTimeInput = document.getElementById('holdTime');
      const brightnessInput = document.getElementById('brightness');

      const ledPresetSelect = document.getElementById('ledPresetSelect');
      
      // 温度预设输入框
      const tempInputs = [
          document.getElementById('tempF1'),
          document.getElementById('tempF2'),
          document.getElementById('tempF3'),
          document.getElementById('tempF4'),
          document.getElementById('tempF5')
      ];
      
      if (isSessionEnabled) {
          // 加热中：按钮变红色，禁用其他控件
          sessionBtn.textContent = 'Stop Heating';
          sessionBtn.style.backgroundColor = '#dc3545'; // 红色
          sessionBtn.style.color = 'white';
          
          // 禁用其他控制项并添加视觉提示
          presetBtn.disabled = true;
          presetBtn.classList.add('heating-disabled');
          
          autoShutTimeInput.disabled = true;
          autoShutTimeInput.classList.add('heating-disabled');
          
        //   holdTimeInput.disabled = true;
        //   holdTimeInput.classList.add('heating-disabled');
          
          brightnessInput.disabled = true;
          brightnessInput.classList.add('heating-disabled');
          

          
          ledPresetSelect.disabled = true;
          ledPresetSelect.classList.add('heating-disabled');
          
          // 禁用所有温度预设输入框并添加视觉提示
          tempInputs.forEach(input => {
              if (input) {
                  input.disabled = true;
                  input.classList.add('heating-disabled');
                  // 为父容器也添加禁用类
                  const container = input.closest('.preset-container');
                  if (container) container.classList.add('heating-disabled');
              }
          });
          
          log('🔥 Heating started - Other controls disabled');
          
      } else {
          // 停止加热：按钮变绿色，启用其他控件
          sessionBtn.textContent = 'Press to Heat';
          sessionBtn.style.backgroundColor = '#28a745'; // 绿色
          sessionBtn.style.color = 'white';
          updateCleaningAssistButton(false);



          // 只有在设备连接时才启用其他控制项
          const isConnected = !sessionBtn.disabled; // 如果session按钮没被禁用，说明设备已连接
          
          if (isConnected) {
              presetBtn.disabled = false;
              presetBtn.classList.remove('heating-disabled');
              
              autoShutTimeInput.disabled = false;
              autoShutTimeInput.classList.remove('heating-disabled');
              
            //   holdTimeInput.disabled = false;
            //   holdTimeInput.classList.remove('heating-disabled');
              
              brightnessInput.disabled = false;
              brightnessInput.classList.remove('heating-disabled');
              

              
              ledPresetSelect.disabled = false;
              ledPresetSelect.classList.remove('heating-disabled');
              
              // 启用所有温度预设输入框并移除视觉提示
              tempInputs.forEach(input => {
                  if (input) {
                      input.disabled = false;
                      input.classList.remove('heating-disabled');
                      // 为父容器也移除禁用类
                      const container = input.closest('.preset-container');
                      if (container) container.classList.remove('heating-disabled');
                  }
              });
          }
          
       //   log('✅ Heating stopped - Other controls enabled');
      }
  }

  // 切换Session状态 - 调用通用B9命令函数
  async function toggleSession() {
      // 检查用户是否已登录
      if (!checkAuthentication()) {
          return;
      }
      
      // 获取当前按钮状态来判断要执行的操作
      const sessionBtn = document.getElementById('sessionControlBtn');
      const isCurrentlyHeating = sessionBtn.textContent === 'Stop Heating';
      const newSessionState = isCurrentlyHeating ? 0x00 : 0x01;
      const action = isCurrentlyHeating ? 'stop' : 'start';
      
      // Session data collection logic
      if (action === 'start') {
          // Start session data collection
          initializeSessionDataCollection();
          log('🔥 Starting heating session with data collection');
      } else if (action === 'stop') {
          // Finalize and upload session data
          const sessionData = finalizeSessionDataCollection();
          if (sessionData) {
              log('🔥 Stopping heating session - preparing to upload data');
              // Upload session data to Firebase (will be called after command succeeds)
              setTimeout(async () => {
                  await uploadSessionData(sessionData);
              }, 1000); // Delay to ensure UI updates complete
          }

          // 停止加热时清零 boost 值
          currentB9State.byte12 = 0;
          updateBoostButton(0);
          log('✓ Boost value reset to 0');
      }

      // 调用通用B9命令函数，更新Session状态和Boost值
      const updates = { byte10: newSessionState };
      if (action === 'stop') {
          updates.byte12 = 0; // 停止时同时发送清零的boost值
      }

      await sendB9Command(
          updates,
          `Session ${action} command sent`
      );
  }

  // 切换预设挡位 - 循环切换1→2→3→4→5→1
  async function switchPreset() {
      // 检查用户是否已登录
      if (!checkAuthentication()) {
          return;
      }
      
      // 循环切换预设值
      currentPreset = currentPreset >= 5 ? 1 : currentPreset + 1;
      
      // 更新按钮显示
      document.getElementById('presetBtn').textContent = currentPreset;
      // 更新Hold Time显示
      updateHoldTimeDisplay();
      updatePresetCardSelection(currentPreset);


      // 发送预设切换命令 - 使用B9命令格式，第3字节为预设值
      await sendB9Command(
          { byte3: currentPreset },
          `Preset switched to ${currentPreset}`
      );
      
      log(`✓ Preset switched to ${currentPreset}`);
  }

  // 更新Hold Time显示
  function updateHoldTimeDisplay() {
      const holdTimeDisplay = document.getElementById('holdTimeDisplay');
      if (holdTimeDisplay && currentPreset >= 1 && currentPreset <= 5) {
          holdTimeDisplay.textContent = holdTime[currentPreset] || 30;
      }
  }

  // 设置Auto Shut Time - 发送B9命令第8字节
  async function setAutoShutTime(minutes) {
      // 检查用户是否已登录
      if (!checkAuthentication()) {
          return;
      }
      
      // 验证时间范围
      const autoShutTime = parseInt(minutes);
      if (autoShutTime < 0 || autoShutTime > 30) {
          log(`Error: Auto Shut Time ${autoShutTime} is out of range (0-30 minutes)`);
          // 恢复之前的值
          document.getElementById('autoShutTime').value = currentB9State.byte8 || 2;
          return;
      }

      // 调用通用B9命令函数，只更新Auto Shut Time（第8字节）
      await sendB9Command(
          { byte8: autoShutTime },
          `Auto Shut Time set to ${autoShutTime} minutes`
      );
  }

  // 设置Hold Time - 发送B7命令格式：B7 06 01 holdTime(high) holdTime(low) B7
  async function setHoldTime(preset, seconds) {
      // 检查用户是否已登录
      if (!checkAuthentication()) {
          return;
      }
      
      if (!characteristic) {
          log('Error: Device not connected');
          return;
      }

      // 验证时间范围
      const holdTimeValue = parseInt(seconds);
      if (holdTimeValue < 10 || holdTimeValue > 90) {
          log(`Error: Hold Time ${holdTimeValue} is out of range (10-90 seconds)`);
          // 恢复之前的值
          const elementId = preset === 0 ? 'holdTime' : `holdTime${preset}`;
          document.getElementById(elementId).value = holdTime[preset] || 30;
          return;
      }

      try {
          // 构造B7命令数据包：B7 06 preset holdTime(high) holdTime(low) B7
          const holdTimeCommand = new Uint8Array(6);
          holdTimeCommand[0] = 0xB7;                      // 起始标识
          holdTimeCommand[1] = 0x06;                      // 数据长度
          holdTimeCommand[2] = preset;                    // 当前挡位
          holdTimeCommand[3] = (holdTimeValue >> 8) & 0xFF;    // holdTime高字节
          holdTimeCommand[4] = holdTimeValue & 0xFF;           // holdTime低字节
          holdTimeCommand[5] = 0xB7;                      // 结束标识

          // 发送Hold Time设置命令
          await characteristic.writeValue(holdTimeCommand);

          const packetHex = Array.from(holdTimeCommand).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');

          log(`✓ Hold Time for Preset ${preset} set to ${holdTimeValue} seconds`);
          log(`  Packet data: ${packetHex}`);

          // 更新holdTime数组
          holdTime[preset] = holdTimeValue;
          
      } catch (error) {
          log(`✗ Failed to set Hold Time: ${error.message}`);
      }
  }

  // 设置Profile模式 - 发送B8命令格式：B8 06 preset 0 profile B8
  async function setProfile(preset, profileValue) {
      // 检查用户是否已登录
      if (!checkAuthentication()) {
          return;
      }
      
      if (!characteristic) {
          log('Error: Device not connected');
          return;
      }

      try {
          // 将字符串形式的十六进制值转换为数字
          const profileHex = parseInt(profileValue, 16);
          
          // 构造B8命令数据包：B8 06 preset 0 profile B8
          const profileCommand = new Uint8Array(5);
          profileCommand[0] = 0xB5;                      // 起始标识
          profileCommand[1] = 0x05;                      // 数据长度
          profileCommand[2] = preset;                    // 当前挡位
          profileCommand[3] = profileHex;                // profile模式值
          profileCommand[4] = 0xB5;                      // 结束标识

          // 发送Profile设置命令
          await characteristic.writeValue(profileCommand);
          
          const packetHex = Array.from(profileCommand).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
          
          // 获取模式名称
          const modeName = getProfileName(profileHex);
          
          log(`✓ Profile for Preset ${preset} set to ${modeName} (${profileValue})`);
          log(`  Packet data: ${packetHex}`);
          
          // 更新profile数组
          profile[preset] = profileHex;
          
      } catch (error) {
          log(`✗ Failed to set Profile: ${error.message}`);
      }
  }

  // 获取Profile模式名称
  function getProfileName(profileValue) {
      switch(profileValue) {
          case 0xa1: return 'Steady';
          case 0xb1: return 'Ascent';
          case 0xc1: return 'Descent';
          case 0xd1: return 'Valley';
          case 0xe1: return 'Hill';
          case 0xf1: return 'Custom';
          default: return 'Unknown';
      }
  }

  // 更新亮度显示值（实时）
  function updateBrightnessDisplay(value) {
      document.getElementById('brightnessDisplay').textContent = value;
  }

  // 设置Brightness - 发送B9命令第13字节
  async function setBrightness(brightness) {
      // 检查用户是否已登录
      if (!checkAuthentication()) {
          return;
      }
      
      // 验证亮度范围
      const brightnessValue = parseInt(brightness);
      if (brightnessValue < 0 || brightnessValue > 100) {
          log(`Error: Brightness ${brightnessValue} is out of range (0-100)`);
          // 恢复之前的值
          document.getElementById('brightness').value = currentB9State.byte13;
          updateBrightnessDisplay(currentB9State.byte13);
          return;
      }

      // 调用通用B9命令函数，只更新Brightness（第13字节）
      await sendB9Command(
          { byte13: brightnessValue },
          `Brightness set to ${brightnessValue}`
      );
  }

  // 切换Haptic反馈状态 - 发送B9命令第11字节
  async function toggleHaptic() {
      // 检查用户是否已登录
      if (!checkAuthentication()) {
          return;
      }

      try {
          // 切换状态：0变1，1变0
          const newHapticState = currentB9State.byte11 === 0xAA ? 0x00 : 0xAA;

          // 调用通用B9命令函数，只更新Haptic状态（第11字节）
          await sendB9Command(
              { byte11: newHapticState },
              `Haptic ${newHapticState === 0xAA ? 'enabled' : 'disabled'}`
          );

          log(`✓ Haptic feedback ${newHapticState === 0xAA ? 'enabled' : 'disabled'}`);
      } catch (error) {
          log(`✗ Failed to toggle Haptic: ${error.message}`);
      }
  }

  // Session Boost - 点击式操作：每次点击发送递增的数值
  async function toggleBoost() {
      // 检查用户是否已登录
      if (!checkAuthentication()) {
          return;
      }

      try {
          // 每次点击递增byte12的值
          currentB9State.byte12 = (currentB9State.byte12 || 0) + 1;

          // 发送递增的值
          await sendB9Command(
              { byte12: currentB9State.byte12 },
              `Session boost value: ${currentB9State.byte12}`
          );

          // 更新按钮显示当前值
          updateBoostButton(currentB9State.byte12);
          showNotification(`Boost value: ${currentB9State.byte12}`, 'warning', 1500);

      } catch (error) {
          log(`✗ Failed to send boost value: ${error.message}`);
          showNotification('Boost send failed', 'error');
      }
  }

  // 更新Boost按钮显示
  function updateBoostButton(value) {
      const boostBtn = document.getElementById('boostBtn');
      if (boostBtn) {
          if (typeof value === 'number' && value > 0) {
              boostBtn.textContent = `Boost(${value})`;
              boostBtn.className = 'btn btn-warning tooltip';
              boostBtn.style.minWidth = '80px';
              boostBtn.style.padding = '6px 12px';
              boostBtn.style.fontSize = '0.8rem';
          } else {
              boostBtn.textContent = 'Boost';
              boostBtn.className = 'btn btn-secondary tooltip';
              boostBtn.style.minWidth = '80px';
              boostBtn.style.padding = '6px 12px';
              boostBtn.style.fontSize = '0.8rem';
          }
      }
  }


    async function toggleCleaningAssist() {

        try {
            // 切换状态
            cleaningAssistEnabled = !cleaningAssistEnabled;
            const commandValue = cleaningAssistEnabled ? 0xAA : 0x00;
            
            // 构造C6命令数据包：C6 04 AA/00 C6
            const cleaningCommand = new Uint8Array(4);
            cleaningCommand[0] = 0xC6;        // 起始标识
            cleaningCommand[1] = 0x04;        // 数据长度
            cleaningCommand[2] = commandValue; // AA=开启, 00=关闭
            cleaningCommand[3] = 0xC6;        // 结束标识

            // 发送清洁助手命令
            await characteristic.writeValue(cleaningCommand);
            
            const packetHex = Array.from(cleaningCommand).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
            const action = cleaningAssistEnabled ? 'enabled' : 'disabled';
            
            log(`✓ Cleaning Assist ${action}`);
            log(`  Packet data: ${packetHex}`);
            
            // 更新按钮显示
            updateCleaningAssistButton(cleaningAssistEnabled);
            
            showNotification(`清洁助手已${cleaningAssistEnabled ? '开启' : '关闭'}`, 'success', 2000);
            
        } catch (error) {
            // 发送失败时恢复状态
            cleaningAssistEnabled = !cleaningAssistEnabled;
            log(`✗ Failed to toggle Cleaning Assist: ${error.message}`);
            showNotification(`清洁助手操作失败: ${error.message}`, 'error');
        }
    }
          function updateCleaningAssistButton(isEnabled) {
              const cleaningBtn = document.getElementById('cleaningAssistBtn');
              if (isEnabled) {
                  cleaningBtn.textContent = 'Stop Cleaning';
              } else {
                  cleaningBtn.textContent = 'Cleaning Assist';
              }
          }
  // 切换温度显示模式 (0=Ideal, 1=Real)
  async function toggleTempDisplay() {
      try {
          // 切换byte18的值: 0 -> 1 或 1 -> 0
          const newValue = currentB9State.byte18 === 0 ? 1 : 0;

          await sendB9Command(
              { byte18: newValue },
              `Temperature display mode: ${newValue === 0 ? 'Ideal' : 'Real'}`
          );

          // 更新按钮显示
          updateTempDisplayButton(newValue);
          showNotification(`温度显示模式: ${newValue === 0 ? 'Ideal' : 'Real'}`, 'success');

      } catch (error) {
          log(`✗ Failed to toggle temperature display mode: ${error.message}`);
          showNotification('切换温度显示模式失败', 'error');
      }
  }

  // 更新温度显示模式按钮 (0=Ideal, 1=Real)
  function updateTempDisplayButton(mode) {
      const btn = document.getElementById('tempDisplayToggleBtn');
      if (btn) {
          if (mode === 1) {
              // 当前是Real模式，按钮显示切换到Ideal
              btn.innerHTML = '<i class="fas fa-thermometer-half"></i> Show real';
          } else {
              // 当前是Ideal模式（默认），按钮显示切换到Real
              btn.innerHTML = '<i class="fas fa-thermometer-half"></i> Show ideal';
          }
      }
  }

  let currentTempChart;
  let currentTempData = [];
  let currentTempLabels = [];
  const MAX_POINTS = 300; // 显示最近300个点

  function initCurrentTempChart() {
      const ctx = document.getElementById('currentTempChart').getContext('2d');
      currentTempChart = new Chart(ctx, {
          type: 'line',
          data: {
              labels: currentTempLabels,
              datasets: [{
                  label: 'Current 温度 (°F)',
                  data: currentTempData,
                  borderColor: '#667eea',
                  backgroundColor: 'rgba(102,126,234,0.1)',
                  tension: 0.2,
                  pointRadius: 0,
                  fill: true
              }]
          },
          options: {
              animation: false,
              responsive: true,
              scales: {
                  x: {
                      display: false
                  },
                  y: {
                      beginAtZero: false,
                      suggestedMin: 100,
                      suggestedMax: 600
                  }
              },
              plugins: {
                  legend: { display: false }
              }
          }
      });
  }

  /* --- Circular Text Title Logic --- */
  function createCircularText(element, text) {
      const letters = text.split('');
      const angleStep = 360 / letters.length;
  
      element.innerHTML = ''; // Clear previous content
  
      letters.forEach((letter, i) => {
          const span = document.createElement('span');
          // Replace space with non-breaking space for rendering
          span.textContent = letter === ' ' ? '\u00A0' : letter;
          const rotationDeg = angleStep * i;
          span.style.transform = `rotate(${rotationDeg}deg)`;
          element.appendChild(span);
      });
  }
  
  function setupCircularTextHover() {
      const container = document.getElementById('circular-text-container');
      if (!container) return;
  
      const originalDuration = 30; // seconds, matching CSS
      const hoverDuration = originalDuration / 4; // speedUp effect
  
      container.addEventListener('mouseenter', () => {
          container.style.animationDuration = `${hoverDuration}s`;
      });
  
      container.addEventListener('mouseleave', () => {
          container.style.animationDuration = `${originalDuration}s`;
      });
  }

  /* --- Click Spark Effect --- */
  function initClickSpark() {
      const canvas = document.createElement('canvas');
      document.body.appendChild(canvas);
  
      // Style the canvas to be a full-screen overlay
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      canvas.style.pointerEvents = 'none'; // Clicks pass through
      canvas.style.zIndex = '9999'; // On top of everything
  
      const ctx = canvas.getContext('2d');
      let sparks = [];
  
      // Get color from CSS variable for a consistent theme
      const sparkColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#667eea';
  
      const config = {
          sparkSize: 10,
          sparkRadius: 15,
          sparkCount: 8,
          duration: 400,
          extraScale: 1.0,
          easing: (t) => t * (2 - t) // ease-out
      };
  
      function resizeCanvas() {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
      }
  
      window.addEventListener('resize', resizeCanvas);
      resizeCanvas();
  
      document.addEventListener('click', (e) => {
          const x = e.clientX;
          const y = e.clientY;
          const now = performance.now();
          
          const newSparks = Array.from({ length: config.sparkCount }, (_, i) => ({
              x,
              y,
              angle: (2 * Math.PI * i) / config.sparkCount,
              startTime: now,
          }));
          sparks.push(...newSparks);
      });
  
      function draw(timestamp) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
  
          sparks = sparks.filter((spark) => {
              const elapsed = timestamp - spark.startTime;
              if (elapsed >= config.duration) {
                  return false;
              }
  
              const progress = elapsed / config.duration;
              const eased = config.easing(progress);
  
              const distance = eased * config.sparkRadius * config.extraScale;
              const lineLength = config.sparkSize * (1 - eased);
  
              const x1 = spark.x + distance * Math.cos(spark.angle);
              const y1 = spark.y + distance * Math.sin(spark.angle);
              const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
              const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);
  
              ctx.strokeStyle = sparkColor;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
  
              return true;
          });
  
          requestAnimationFrame(draw);
      }
  
      requestAnimationFrame(draw);
  }
