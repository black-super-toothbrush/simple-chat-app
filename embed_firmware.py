"""
开发用工具：把 .bin 文件加密压缩后嵌入 _firmware.py
只需运行一次，之后打包时不再需要原始 .bin 文件
"""
import zlib
import base64
import os

BIN_FILE = "Switch2(v20)_260529_1.bin"
OUT_FILE = "_firmware.py"
KEY = 0xA7  # XOR 混淆密钥

with open(BIN_FILE, "rb") as f:
    raw = f.read()

compressed = zlib.compress(raw, level=9)
encrypted = bytes(b ^ KEY for b in compressed)
b64 = base64.b64encode(encrypted).decode()

with open(OUT_FILE, "w", encoding="utf-8") as f:
    f.write("# AUTO-GENERATED — do not edit manually\n")
    f.write(f"_K = {KEY}\n")
    f.write(f"_D = \"{b64}\"\n")

size_kb = len(raw) / 1024
print(f"Done: {BIN_FILE} ({size_kb:.1f} KB) -> {OUT_FILE}")
print(f"Original: {len(raw)} bytes, Compressed+encrypted: {len(encrypted)} bytes")
