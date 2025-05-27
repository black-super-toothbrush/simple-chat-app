/* asciihex.js  ——  双向转换脚本 */

/* 把普通字符串转换成十六进制：返回形如 "61 62 63" */
function asciiToHex(str) {
  return Array.from(str)
    .map(ch => ch.charCodeAt(0).toString(16).padStart(2, '0'))
    .join(' ');
}

/* 把十六进制（允许空格/换行分隔）转换成字符串 */
function hexToAscii(hex) {
  // 去掉所有非十六进制字符
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  // 两两分组
  const bytes = clean.match(/.{1,2}/g) || [];
  return bytes.map(byte => String.fromCharCode(parseInt(byte, 16))).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  const asciiEl = document.getElementById('ascii');
  const hexEl   = document.getElementById('hex');

  document.getElementById('toHex').addEventListener('click', () => {
    hexEl.value = asciiToHex(asciiEl.value);
  });

  document.getElementById('toAscii').addEventListener('click', () => {
    asciiEl.value = hexToAscii(hexEl.value);
  });
});
