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

app.post('/upload', upload.single('voice'), (req, res) => {
  const tempPath = req.file.path;
  const newPath = path.join(__dirname, 'uploads', req.file.filename + '.mp4');
  fs.rename(tempPath, newPath, () => {
    io.emit('voice message', '/audio/' + path.basename(newPath));
    res.sendStatus(200);
  });
});

io.on('connection', socket => {
  console.log('a user connected');
});

const port = process.env.PORT || 3002;
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
