let bluetoothDevice;
let characteristic;
let firmwareData;
let isOtaInProgress = false;
let otaSequence = 0;
let totalPackets = 0;
let sentPackets = 0;
let waitingForResponse = false;
let responsePromise = null;

// 认证检查函数
function checkAuthentication() {
    if (!window.currentUser) {
        showNotification('请先登录才能使用设备功能', 'warning');
        return false;
    }
    return true;
}

// Notify监听相关变量
let rxCharacteristic = null;
let notificationsEnabled = false;
let notifyPacketCount = 0;
let deviceInfoPacketCount = 0;
let globalPresetIndex = 0;
let globalTempF = [0,0,0,0,0,0];
let globalTempC = [0,0,0,0,0,0];
let currentPreset = 1; // 当前预设值 (1-5)
let holdTime = 30;
// 当前设备状态跟踪 - B9命令的所有字节状态
let currentB9State = {
    byte3: 0x01,   // 预设值 (1-5)
    byte6: 0x00,   // LED值
    byte8: 0x02,   // Auto Shut Time (0-30分钟)
    byte10: 0x00,  // Session状态
    byte13: 25,    // Brightness (0-100)
    // 后续可以继续添加更多字节：byte11, byte12, byte14 等等
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
    0x11: 'Lime Light'
};

// OTA协议常量 - 匹配固件代码格式
const CHUNK_SIZE = 32;  // 每个数据包的数据大小
const PACKET_SIZE = 36; // 总包大小：4字节地址 + 32字节数据
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
        
        // 启用设备控制相关的控件
        const sessionControlBtn = document.getElementById('sessionControlBtn');
        const presetBtn = document.getElementById('presetBtn');
        const autoShutTimeInput = document.getElementById('autoShutTime');
        const holdTimeInput = document.getElementById('holdTime');
        const brightnessInput = document.getElementById('brightness');
        const ledPresetSelect = document.getElementById('ledPresetSelect');
        
        if (sessionControlBtn) sessionControlBtn.disabled = false;
        if (presetBtn) presetBtn.disabled = false;
        if (autoShutTimeInput) autoShutTimeInput.disabled = false;
        if (holdTimeInput) holdTimeInput.disabled = false;
        if (brightnessInput) brightnessInput.disabled = false;
        if (ledPresetSelect) ledPresetSelect.disabled = false;
        
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
        const holdTimeInput = document.getElementById('holdTime');
        const brightnessInput = document.getElementById('brightness');
        const ledPresetSelect = document.getElementById('ledPresetSelect');
        
        if (sessionControlBtn) sessionControlBtn.disabled = true;
        if (presetBtn) presetBtn.disabled = true;
        if (autoShutTimeInput) autoShutTimeInput.disabled = true;
        if (holdTimeInput) holdTimeInput.disabled = true;
        if (brightnessInput) {
            brightnessInput.disabled = true;
            brightnessInput.value = 25;
            updateBrightnessDisplay(25);
        }
        if (ledPresetSelect) ledPresetSelect.disabled = true;
        
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
    log(`Received response: length=${data.length} bytes, content=${Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
    // 检查是否是设备状态notify数据包 (20字节，包头包尾都是0xA9)
    if (data.length === 20 && data[0] === 0xA9 && data[19] === 0xA9) {
        handleNotifyData(data);
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

    // 检查是否是设备信息命令 C1-C7
    if (data.length >= 2 && data[0] >= 0xC1 && data[0] <= 0xC7) {
        handleDeviceInfoCommand(data);
        return;
    }

    //log(`Received response: length=${data.length} bytes, content=${Array.from(data).map(b => String.fromCharCode(b)).join('')}`);
    
    // 检查是否是OK响应
    const responseText = Array.from(data).map(b => String.fromCharCode(b)).join('');
    if (responseText.startsWith('OK')) {
        log(`Block confirmed: ${responseText}`);
        if (responsePromise) {
            responsePromise.resolve(data);
            responsePromise = null;
        }
        waitingForResponse = false;
    } else {
        log(`Unexpected response: ${responseText}`);
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
    
    // 更新显示
    updateDeviceStatus({
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
    });
    
    // 更新原始数据显示
    const rawDataHex = Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    document.getElementById('rawData').textContent = rawDataHex;
    document.getElementById('packetCount').textContent = notifyPacketCount;
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    
    //log(`Received device status notify: temp=${realTemp}°${tempUnit}, battery=${batteryLevel}%, preset=${preset}`);
}


        
function handleTempTimeData(data) {
    if (data[1] !== 6) {
        log(`Invalid temp time packet length field: ${data[1]}`);
        return;
    }    
    holdTime = (data[3] << 8) | data[4];
    
    // 更新Hold Time输入框
    document.getElementById('holdTime').value = holdTime;
    
    log(`Received hold time: ${holdTime} seconds`);
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
    
    // 显示原始数据
    const rawDataHex = Array.from(data).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
    document.getElementById('rawDeviceInfo').textContent = rawDataHex;
    document.getElementById('deviceInfoPacketCount').textContent = deviceInfoPacketCount;
    document.getElementById('lastInfoUpdate').textContent = new Date().toLocaleTimeString();
    
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
    document.getElementById('hapticFeedback').textContent = status.hapticFeedback ? 'On' : 'Off';
    document.getElementById('sessionBoost').textContent = status.sessionBoost ? 'Enabled' : 'Disabled';
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
            filters: [
                { name: 'PY32F071' },
                { namePrefix: 'PY32' }
            ],
            optionalServices: [SERVICE_UUID]
        });

        log(`Found device: ${bluetoothDevice.name}`);
        
        const server = await bluetoothDevice.gatt.connect();
        log('GATT server connected successfully');
        
        const service = await server.getPrimaryService(SERVICE_UUID);
        log('Service obtained successfully');
        
        characteristic = await service.getCharacteristic(TX_CHARACTERISTIC_UUID);
        log('TX characteristic obtained successfully');
        
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
    const packet = new Uint8Array(36);
    packet.fill(0xFF);
    
    // 地址 (4字节, 大端序)
    packet[0] = (chunkIndex >> 24) & 0xFF;
    packet[1] = (chunkIndex >> 16) & 0xFF;
    packet[2] = (chunkIndex >> 8) & 0xFF;
    packet[3] = chunkIndex & 0xFF;
    
    // 数据 (32字节, 从16改为32)
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
          //  log(`Send ${description}: ${Array.from(packet.slice(0, 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}...`);
            
            // 发送数据包
            await characteristic.writeValue(packet);
            
            if (waitForAck) {
                // 等待设备响应
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
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                continue;
            } else {
                log(`Critical error for ${description}: ${error.message}`);
                throw error;
            }
        }
    }
    throw new Error(`${description} retry attempts exhausted`);
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
            
            // 如果数据不足32字节，用0xFF填充 (从16改为32)
            const paddedChunk = new Uint8Array(CHUNK_SIZE);
            paddedChunk.fill(0xFF);
            paddedChunk.set(chunkData);
            
            const dataPacket = createDataPacket(chunkIndex, paddedChunk);
            
            // 检查是否需要等待2048字节块的确认
            const isBlockEnd = ((offset + chunkSize) % BLOCK_SIZE === 0) || (offset + chunkSize >= firmwareData.length);
            
            if (chunkIndex % 32 === 0 || chunkIndex < 10) { // Log every 32 packets or first 10
                log(`Send data packet ${chunkIndex}/${totalChunks}, offset: ${offset}, size: ${chunkSize}, block_end: ${isBlockEnd}`);
            }
            
            await sendPacket(dataPacket, `data packet ${chunkIndex}`, isBlockEnd);
            
            offset += chunkSize;
            chunkIndex++;
            sentPackets++;
            
            updateProgress(sentPackets, totalPackets);
            
            // 每个数据包之间的延时，块结束时等待更长时间
            if (isBlockEnd) {
                await new Promise(resolve => setTimeout(resolve, 50)); // 块结束等待100ms
            } else {
                await new Promise(resolve => setTimeout(resolve, 5)); // 普通包等待10ms
            }
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
    document.getElementById('holdTime').value = holdTime;
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
    const titleText = "switch3*Dr.Dabber*";
    const circularTextContainer = document.getElementById('circular-text-container');
    if(circularTextContainer) {
        createCircularText(circularTextContainer, titleText);
        setupCircularTextHover();
    }
    initClickSpark();
    initRibbonsEffect();
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

// 同步时间功能 - 发送格式：b1 09 year(2 byte) month day hour minute b1
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
          command[4] = 0x00;
          command[5] = 0x00;
          command[6] = currentB9State.byte6 || 0x00;   // LED值
          command[7] = 0x00;
          command[8] = currentB9State.byte8 || 0x00;   // Auto Shut Time (0-30分钟)
          command[9] = 0x00;
          command[10] = currentB9State.byte10 || 0x00; // Session状态
          command[11] = currentB9State.byte11 || 0x00; // 未来扩展
          command[12] = currentB9State.byte12 || 0x00; // 未来扩展
          command[13] = currentB9State.byte13 || 0x00; // Brightness (0-100)
          command[14] = currentB9State.byte14 || 0x00; // 未来扩展
          command[15] = currentB9State.byte15 || 0x00; // 未来扩展
          command[16] = currentB9State.byte16 || 0x00; // 未来扩展
          command[17] = currentB9State.byte17 || 0x00; // 未来扩展
          command[18] = currentB9State.byte18 || 0x00; // 未来扩展
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
      const holdTimeInput = document.getElementById('holdTime');
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
          
          holdTimeInput.disabled = true;
          holdTimeInput.classList.add('heating-disabled');
          
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
          
          // 只有在设备连接时才启用其他控制项
          const isConnected = !sessionBtn.disabled; // 如果session按钮没被禁用，说明设备已连接
          
          if (isConnected) {
              presetBtn.disabled = false;
              presetBtn.classList.remove('heating-disabled');
              
              autoShutTimeInput.disabled = false;
              autoShutTimeInput.classList.remove('heating-disabled');
              
              holdTimeInput.disabled = false;
              holdTimeInput.classList.remove('heating-disabled');
              
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
          
          log('✅ Heating stopped - Other controls enabled');
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
      
      // 调用通用B9命令函数，只更新Session状态（第10字节）
      await sendB9Command(
          { byte10: newSessionState },
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
      
      // 发送预设切换命令 - 使用B9命令格式，第3字节为预设值
      await sendB9Command(
          { byte3: currentPreset },
          `Preset switched to ${currentPreset}`
      );
      
      log(`✓ Preset switched to ${currentPreset}`);
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
  async function setHoldTime(seconds) {
      // 检查用户是否已登录
      if (!checkAuthentication()) {
          return;
      }
      
      if (!characteristic) {
          log('Error: Device not connected');
          return;
      }

      // 验证时间范围
      const holdTime = parseInt(seconds);
      if (holdTime < 10 || holdTime > 90) {
          log(`Error: Hold Time ${holdTime} is out of range (10-90 seconds)`);
          // 恢复之前的值
          document.getElementById('holdTime').value = window.holdTime || 30;
          return;
      }

      try {
          // 构造B7命令数据包：B7 06 01 holdTime(high) holdTime(low) B7
          const holdTimeCommand = new Uint8Array(6);
          holdTimeCommand[0] = 0xB7;                      // 起始标识
          holdTimeCommand[1] = 0x06;                      // 数据长度
          holdTimeCommand[2] = 0x01;                      // 固定字节
          holdTimeCommand[3] = (holdTime >> 8) & 0xFF;    // holdTime高字节
          holdTimeCommand[4] = holdTime & 0xFF;           // holdTime低字节
          holdTimeCommand[5] = 0xB7;                      // 结束标识

          // 发送Hold Time设置命令
          await characteristic.writeValue(holdTimeCommand);
          
          const packetHex = Array.from(holdTimeCommand).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
          
          log(`✓ Hold Time set to ${holdTime} seconds`);
          log(`  Packet data: ${packetHex}`);
          
          // 更新全局holdTime变量
          window.holdTime = holdTime;
          
      } catch (error) {
          log(`✗ Failed to set Hold Time: ${error.message}`);
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
