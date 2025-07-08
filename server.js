const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const upload = multer({ dest: path.join(__dirname, 'uploads') });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/audio', express.static(path.join(__dirname, 'uploads')));
app.use(express.json()); // 支持JSON请求体解析

app.post('/upload', upload.single('voice'), (req, res) => {
  const tempPath = req.file.path;
  const newPath = path.join(__dirname, 'uploads', req.file.filename + '.mp4');
  fs.rename(tempPath, newPath, () => {
    io.emit('voice message', '/audio/' + path.basename(newPath));
    res.sendStatus(200);
  });
});

// 温度预设数据收集API
app.post('/api/temperature-presets', (req, res) => {
  try {
    const {
      userId,
      userEmail,
      deviceInfo,
      temperaturePresets,
      timestamp,
      sessionData
    } = req.body;

    // 验证必需字段
    if (!userId || !userEmail || !temperaturePresets) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, userEmail, temperaturePresets'
      });
    }

    // 验证温度预设数据格式
    if (!Array.isArray(temperaturePresets) || temperaturePresets.length !== 5) {
      return res.status(400).json({
        success: false,
        error: 'temperaturePresets must be an array of 5 elements'
      });
    }

    // 创建数据记录
    const dataRecord = {
      userId,
      userEmail,
      deviceInfo: deviceInfo || {},
      temperaturePresets,
      timestamp: timestamp || new Date().toISOString(),
      sessionData: sessionData || {},
      receivedAt: new Date().toISOString()
    };

    // 确保数据目录存在
    const dataDir = path.join(__dirname, 'temperature-data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 保存到文件（以用户ID和时间戳命名）
    const filename = `temp-presets-${userId}-${Date.now()}.json`;
    const filepath = path.join(dataDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(dataRecord, null, 2));

    // 记录到总日志文件
    const logFile = path.join(dataDir, 'temperature-log.txt');
    const logEntry = `${new Date().toISOString()} - User: ${userEmail} (${userId}) - Presets: [${temperaturePresets.join(', ')}]°F\n`;
    fs.appendFileSync(logFile, logEntry);

    console.log(`Temperature presets saved for user ${userEmail}:`, temperaturePresets);

    // 通过Socket.IO广播数据（可选，用于实时监控）
    io.emit('temperature-data', {
      userId,
      userEmail,
      temperaturePresets,
      timestamp: dataRecord.receivedAt
    });

    res.json({
      success: true,
      message: 'Temperature presets saved successfully',
      filename,
      data: dataRecord
    });

  } catch (error) {
    console.error('Error saving temperature presets:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
});

// 获取温度预设数据统计API
app.get('/api/temperature-stats', (req, res) => {
  try {
    const dataDir = path.join(__dirname, 'temperature-data');
    
    if (!fs.existsSync(dataDir)) {
      return res.json({
        success: true,
        totalRecords: 0,
        users: 0,
        latestRecord: null
      });
    }

    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
    const records = files.map(file => {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf8');
      return JSON.parse(content);
    });

    const uniqueUsers = new Set(records.map(r => r.userId)).size;
    const latestRecord = records.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))[0];

    res.json({
      success: true,
      totalRecords: records.length,
      users: uniqueUsers,
      latestRecord: latestRecord ? {
        userEmail: latestRecord.userEmail,
        temperaturePresets: latestRecord.temperaturePresets,
        timestamp: latestRecord.receivedAt
      } : null
    });

  } catch (error) {
    console.error('Error getting temperature stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

io.on('connection', socket => {
  console.log('a user connected');
});

const port = process.env.PORT || 3002;
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
