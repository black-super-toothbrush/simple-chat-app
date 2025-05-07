const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 静态托管网页
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', socket => {
  console.log('一个用户连接了');

  socket.on('chat message', msg => {
    // 广播给所有客户端
    io.emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    console.log('一个用户断开连接');
  });
});

const port = process.env.PORT || 3001;
server.listen(port, () => {
  console.log(`服务器已启动：http://localhost:${port}`);
});

