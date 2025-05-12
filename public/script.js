const socket = io();
const recordBtn = document.getElementById('record');
const messages = document.getElementById('messages');

let mediaRecorder;
let chunks = [];
let recording = false;

recordBtn.onclick = async () => {
  if (!recording) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.start();
    chunks = [];
    recording = true;
    recordBtn.textContent = '🛑 停止录音';

    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'audio/mp4' });
      const formData = new FormData();
      formData.append('voice', blob, 'voice.mp4');

      await fetch('/upload', {
        method: 'POST',
        body: formData
      });

      recordBtn.textContent = '🎤 开始录音';
      recording = false;
    };
  } else {
    mediaRecorder.stop();
  }
};

socket.on('voice message', url => {
  const li = document.createElement('li');
  const audio = document.createElement('audio');
  audio.src = url;
  audio.controls = true;
  li.appendChild(audio);
  messages.appendChild(li);
});
