const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Enable compression for better performance
app.use(express.json({ limit: '10mb' }));

const upload = multer({ 
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Serve static files with cache headers
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d' // Cache for 1 day
}));
app.use('/audio', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1h' // Cache audio files for 1 hour
}));

app.post('/upload', upload.single('voice'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const tempPath = req.file.path;
    const newPath = path.join(__dirname, 'uploads', req.file.filename + '.mp4');
    
    // Use async file operations
    await fs.rename(tempPath, newPath);
    
    const audioUrl = '/audio/' + path.basename(newPath);
    io.emit('voice message', audioUrl);
    res.json({ success: true, url: audioUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Clean up old files periodically (every hour)
setInterval(async () => {
  try {
    const files = await fs.readdir(path.join(__dirname, 'uploads'));
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const file of files) {
      const filePath = path.join(__dirname, 'uploads', file);
      const stats = await fs.stat(filePath);
      if (now - stats.mtime.getTime() > maxAge) {
        await fs.unlink(filePath);
        console.log(`Cleaned up old file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}, 60 * 60 * 1000); // Run every hour

io.on('connection', socket => {
  console.log('User connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const port = process.env.PORT || 3002;
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
