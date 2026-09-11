#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CDC OTA flasher for the B91 bootloader.

Talks to the bootloader's USB-CDC firmware-update feature (see cdc_ota_proc() in
vendor/B91_bootloader/app.c). Pick a .bin, pick the "Telink CDC" serial port, and
this tool streams the image to flash offset 0x20000, erasing+programming one 4 KB
sector at a time, then verifies the flashed image with a CRC32 read-back.

Wire protocol
-------------
Host -> device (little-endian):
    START : b"OTA!" + u32 size
    DATA  : raw firmware bytes, grouped into 4 KB blocks
    VERIFY: b"CRC?" + u32 crc32(image)

Device -> host: line-based ASCII, one message per '\\n'-terminated line:
    "OK"            positive ack (START accepted / block programmed / verify ok)
    "ERR <reason>"  negative ack
    "LOG <text>"    progress/status (shown in the Device-log window)

After a successful VERIFY the device reboots into the new app (the port disappears).

Requires: pyserial  (pip install pyserial). Tkinter ships with CPython.
"""

import os
import sys
import time
import zlib
import queue
import threading

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext

try:
    import serial
    import serial.tools.list_ports as list_ports
except ImportError:
    print("pyserial is required:  pip install pyserial")
    sys.exit(1)

APP_FLASH_OFFSET = 0x20000
# App partition end. The bootloader accepts up to APP_END_ADDR = 0x200F8000
# (vendor/B91_bootloader/app.h), i.e. raw 0xF8000, and BLE_OTA_SD_MAX_SIZE agrees.
# We stop one sector-group short at 0xF6000 because app.c:109 documents the BLE
# stack's SMP pairing storage at raw 0xF6000 - writing past it would erase bonds.
# Raise to 0xF8000 only after confirming SMP lives elsewhere.
APP_FLASH_END    = 0xF6000          # app partition end (856 KB usable)
APP_MAX_SIZE     = APP_FLASH_END - APP_FLASH_OFFSET
ESP_OTA_MAX      = 0x180000         # ESP32-S2 ota_x partition size (1536 KB)
PAGE_SIZE        = 4096             # host block size; MUST match CDC_OTA_PAGE_SIZE in the bootloader

# Sanity size ranges per target (guards against picking the wrong .bin).
B91_SIZE_MIN = 500 * 1024          # 500 KB
B91_SIZE_MAX = APP_MAX_SIZE        # 856 KB app region (flash 0x20000..0xF6000)
ESP_SIZE_MIN = 1024 * 1024         # 1 MB
ESP_SIZE_MAX = 1843 * 1024         # ~1.8 MB
BL_SIZE_MIN  = 8 * 1024            # 8 KB
BL_SIZE_MAX  = 124 * 1024          # 124 KB bootloader region (flash 0x0000..0x1F000)

# USB identity of the bootloader's CDC port, from vendor/B91_bootloader/usb_default.h:
#   ID_VENDOR  = 0x248A                      (line 92)
#   ID_PRODUCT = 0x8002  when USB_CDC_ENABLE (line 95; enabled in app_config.h)
# and the product string "Telink CDC" (usbdesc.c). We auto-detect the port by
# these, so the user never has to pick a COM port by hand.
USB_VID      = 0x248A
USB_PID      = 0x8002
PRODUCT_NAME = "Telink CDC"


def find_device_port():
    """Return the COM path of the Telink CDC bootloader port, or None.

    Prefers an exact VID/PID match; falls back to the product/description
    string in case a particular board reports a different PID.
    """
    by_id = []
    by_desc = []
    for p in list_ports.comports():
        text = f"{p.description or ''} {p.product or ''}"
        if p.vid == USB_VID and p.pid == USB_PID:
            by_id.append(p.device)
        elif PRODUCT_NAME in text or "CDC" in text:
            by_desc.append(p.device)
    if by_id:
        return by_id[0]
    if by_desc:
        return by_desc[0]
    return None


class OtaError(Exception):
    pass


class LineReader:
    """Splits the device's byte stream into '\\n'-terminated text lines."""

    def __init__(self, ser):
        self.ser = ser
        self.buf = bytearray()

    def get_line(self, timeout):
        deadline = time.time() + timeout
        while True:
            nl = self.buf.find(b"\n")
            if nl >= 0:
                line = self.buf[:nl]
                del self.buf[:nl + 1]
                return line.rstrip(b"\r").decode("utf-8", "replace")
            remaining = deadline - time.time()
            if remaining <= 0:
                return None
            self.ser.timeout = min(0.2, max(0.01, remaining))
            # Read whatever is pending (at least 1 byte). read(64) here used
            # to stall the whole flash loop: pyserial only returns early when
            # the requested COUNT is reached, so a 3-byte "OK\n" reply sat
            # waiting out the full 200 ms timeout on EVERY 4 KB block
            # (~16 KB/s). Draining in_waiting returns as soon as the reply
            # arrives (~90 KB/s, flash-erase bound).
            chunk = self.ser.read(self.ser.in_waiting or 1)
            if chunk:
                self.buf += chunk


def read_response(reader, timeout, devlog):
    """Read device lines until a protocol response; route LOG lines to devlog.

    Returns True on "OK". Raises OtaError on "ERR"/"FAIL" or timeout.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        line = reader.get_line(deadline - time.time())
        if line is None:
            break
        if line == "":
            continue
        if line.startswith("LOG "):
            devlog(line[4:])
            continue
        if line == "OK":
            return True
        if line.startswith("ERR") or line.startswith("FAIL"):
            raise OtaError(f"device reported: {line}")
        # Anything else: treat as device chatter.
        devlog(line)
    raise OtaError("timed out waiting for device response")


def flash_firmware(port, data, log, devlog, progress, target="b91"):
    """Run the full START / DATA / VERIFY sequence. Raises OtaError on failure.

    target="b91" : write the B91's own app flash (0x20000), Adler-32 read-back, jump to app.
    target="esp" : forward the image over the B91's UART1 to the external ESP32-S2, which
                   runs its own UART OTA receiver (esp_ota into its next partition + reboot).
    target="bldr": write a new B91 BOOTLOADER to flash 0x0000 (handled by the running app's
                   CDC receiver), Adler-32 read-back, then the app reboots.
    """
    is_esp = (target == "esp")
    is_bldr = (target == "bldr")
    size = len(data)
    # Adler-32, not CRC32: B91 images are CRC32-terminated by the build, so their whole-file
    # CRC32 is always 0xFFFFFFFF (useless). Adler-32 is content-bound. (B91/bootloader
    # targets; the ESP32 verifies its own image internally via esp_ota_end.)
    checksum = zlib.adler32(data) & 0xFFFFFFFF
    start_magic = b"ESP!" if is_esp else (b"BLDR" if is_bldr else b"OTA!")
    max_size = ESP_OTA_MAX if is_esp else (BL_SIZE_MAX if is_bldr else APP_MAX_SIZE)
    log(f"File size : {size} bytes ({size / 1024:.1f} KB)")
    if is_esp:
        log("Dest      : ESP32-S2 OTA partition (forwarded over B91 UART1)")
    elif is_bldr:
        log(f"Adler32   : 0x{checksum:08X}")
        log(f"Flash dest: 0x000000 .. 0x{size:06X}  (B91 bootloader, via the running app)")
    else:
        log(f"Adler32   : 0x{checksum:08X}")
        log(f"Flash dest: 0x{APP_FLASH_OFFSET:06X} .. 0x{APP_FLASH_OFFSET + size:06X}")

    if size == 0:
        raise OtaError("file is empty")
    if size > max_size:
        raise OtaError(f"file too large: {size} > {max_size} (0x{max_size:X}) bytes")

    log(f"Opening {port} ...")
    # Baud rate is irrelevant for a USB-CDC ACM port, but pyserial needs a value.
    ser = serial.Serial(port, baudrate=115200, timeout=0.2, write_timeout=8)
    reader = LineReader(ser)
    try:
        # Some CDC stacks gate bulk traffic on the control-line state; assert both.
        for attr in ("dtr", "rts"):
            try:
                setattr(ser, attr, True)
            except Exception:
                pass
        try:
            ser.reset_input_buffer()
            ser.reset_output_buffer()
        except Exception:
            pass

        # Listen briefly for the device's idle heartbeat to confirm the link is live.
        log("Listening for device heartbeat (1.5s) ...")
        seen = False
        t_end = time.time() + 1.5
        while time.time() < t_end:
            line = reader.get_line(t_end - time.time())
            if line:
                devlog(line[4:] if line.startswith("LOG ") else line)
                seen = True
        if seen:
            log("Device heartbeat detected - link OK.")
        else:
            log("WARNING: no heartbeat seen. Is the device sitting in the bootloader "
                "(DFU) running the CDC-OTA firmware? Trying anyway ...")

        # ---- START ----
        # For ESP32 the device first commands the ESP32 into UART OTA mode, which erases
        # an OTA partition (several seconds) before it ACKs — so allow a long timeout.
        log("-> START" + (" (ESP32: waiting for ESP OTA begin, may take ~15s)" if is_esp else ""))
        try:
            ser.write(start_magic + size.to_bytes(4, "little"))
            ser.flush()
        except serial.SerialTimeoutException:
            raise OtaError(
                "write timed out - the device is not draining its CDC OUT endpoint. "
                "Confirm it is in the bootloader (DFU) running the CDC-OTA firmware "
                "(you should see heartbeat lines above), then retry.")
        read_response(reader, timeout=20 if is_esp else 3, devlog=devlog)
        log("<- OK (device ready)")

        # ---- DATA ----
        t0 = time.time()
        offset = 0
        block_no = 0
        total_blocks = (size + PAGE_SIZE - 1) // PAGE_SIZE

        def _report(off):
            elapsed = time.time() - t0
            spd = (off / 1024) / elapsed if elapsed > 0 else 0.0      # KB/s
            et  = ((size - off) / 1024) / spd if spd > 0 else 0.0     # seconds
            progress(off, size, spd, et)
            return spd, et

        if is_esp:
            # Streaming: write continuously with NO per-block ACK. The B91's USB OUT
            # endpoint NAKs while it forwards a chunk to the ESP32, which flow-controls us
            # (ser.write blocks until the B91 has consumed). flush() every ~64 KB bounds the
            # look-ahead so the progress bar tracks real consumption; it syncs at USB level
            # only (does NOT wait for the slow per-block ESP round-trip), which is the win.
            ser.write_timeout = 30
            while offset < size:
                n = min(PAGE_SIZE, size - offset)
                ser.write(data[offset:offset + n])
                offset += n
                block_no += 1
                if block_no % 16 == 0 or offset >= size:
                    ser.flush()
                    spd, et = _report(offset)
                    log(f"   sent {offset}/{size} bytes  ({offset * 100 // size}%)  "
                        f"{spd:.1f} KB/s  ETA {et:.0f}s")
        else:
            while offset < size:
                block = data[offset:offset + PAGE_SIZE]
                ser.write(block)
                ser.flush()
                # B91 erase+program of a 4 KB sector (~ms); wait for its per-block OK.
                read_response(reader, timeout=5, devlog=devlog)
                offset += len(block)
                block_no += 1
                spd, et = _report(offset)
                if block_no % 16 == 0 or offset >= size:
                    log(f"   programmed {offset}/{size} bytes  ({offset * 100 // size}%)  "
                        f"{spd:.1f} KB/s  ETA {et:.0f}s  block {block_no}/{total_blocks}")
        dt = time.time() - t0
        rate = (size / 1024) / dt if dt > 0 else 0
        log(f"All blocks {'sent' if is_esp else 'programmed'} in {dt:.1f}s ({rate:.1f} KB/s)")

        # ---- FINISH / VERIFY ----
        # Same "CRC?" frame triggers the device's finish step for both targets, and BOTH
        # reboot the B91 on success (so the port drops right after the OK):
        #  - B91: reads the image back, checks Adler-32, replies OK, jumps to the app.
        #  - ESP32: B91 sends the finish frame; the ESP32 commits (esp_ota_end +
        #    set_boot_partition) and reboots itself; the B91 then clears its OTA flag and
        #    reboots out of DFU too.
        # A disconnect here therefore means SUCCESS for either target.
        if is_esp:
            log("-> FINISH (ESP32 commits + reboots; B91 then reboots out of DFU)")
        else:
            log("-> VERIFY (Adler-32 read-back on device, then jump to app)")
        try:
            ser.write(b"CRC?" + checksum.to_bytes(4, "little"))
            ser.flush()
            read_response(reader, timeout=20, devlog=devlog)
            if is_esp:
                log("*** ESP32 UPDATE OK *** ESP32 is rebooting; B91 is restarting out of DFU.")
            else:
                log("*** VERIFY OK *** device is rebooting into the new app.")
        except (serial.SerialException, OSError) as e:
            # The B91 reboots on success for both targets, dropping the port - so a
            # disconnect here almost certainly means the update PASSED.
            if is_esp:
                log("B91 disconnected after ESP update - it reboots out of DFU on success, "
                    "so the ESP32 update most likely completed and the B91 is restarting.")
            else:
                log("Device disconnected during verify - it reboots on success, so this "
                    "almost certainly means VERIFY PASSED and the new app is booting.")
            log(f"(disconnect detail: {e})")
    finally:
        try:
            ser.close()
        except Exception:
            pass


def send_reset_and_reconnect(port, log, devlog):
    """Send "reset" to the running app, then wait for it to re-enter the bootloader.

    The firmware's cdc_cmd_proc() (vendor/B91_module/app.c) matches the ASCII
    command "reset", sets the OTA flag (0xAA) and reboots into the CDC-OTA
    bootloader. The current USB-CDC port therefore drops and a fresh one appears
    ~1s later; we poll find_device_port() until it comes back. Returns the new
    port path, or None if the device did not reappear.
    """
    log(f"Opening {port} to send reset ...")
    ser = serial.Serial(port, baudrate=115200, timeout=0.2, write_timeout=3)
    try:
        # Some CDC stacks gate traffic on the control-line state; assert both.
        for attr in ("dtr", "rts"):
            try:
                setattr(ser, attr, True)
            except Exception:
                pass
        ser.write(b"reset\n")
        ser.flush()
        log("-> 'reset' sent. Waiting for device ACK ...")
        # The firmware replies "RESET-ACK" the moment cdc_cmd_proc() matches the
        # command, just before it reboots. Seeing it confirms host->device RX works;
        # not seeing it means the command never reached the running app.
        acked = False
        rxbuf = bytearray()
        t_end = time.time() + 1.5
        while time.time() < t_end:
            chunk = ser.read(ser.in_waiting or 1)
            if chunk:
                rxbuf += chunk
                if b"RESET-ACK" in rxbuf:
                    acked = True
                    break
        for ln in rxbuf.decode("utf-8", "replace").splitlines():
            ln = ln.strip()
            if ln:
                devlog(ln[4:] if ln.startswith("LOG ") else ln)
        if acked:
            log("<- RESET-ACK received. Device is rebooting into the bootloader ...")
        else:
            log("WARNING: no RESET-ACK. The running app did not receive 'reset' "
                "(check it enumerated as CDC and the flashed app includes "
                "cdc_cmd_proc).")
    except (serial.SerialException, OSError) as e:
        # A write/close error here usually just means the port already vanished.
        log(f"(reset send note: {e})")
    finally:
        try:
            ser.close()
        except Exception:
            pass

    # Give USB ~1s to tear down and the bootloader to re-enumerate, then poll.
    log("Waiting 1s for re-enumeration ...")
    time.sleep(1.0)
    new_port = None
    deadline = time.time() + 8
    while time.time() < deadline:
        new_port = find_device_port()
        if new_port:
            break
        time.sleep(0.3)
    if new_port:
        log(f"Reconnected: device is back on {new_port} (bootloader CDC-OTA).")
    else:
        log("Device did not reappear within 8s. Check the cable and click Refresh.")
    return new_port


# ----------------------------- GUI -----------------------------

class App:
    def __init__(self, root):
        self.root = root
        root.title("B91 Bootloader - CDC OTA Flasher")
        root.geometry("900x600")
        root.minsize(760, 480)

        self.q = queue.Queue()
        self.worker = None
        self.listening = False
        self.listen_thread = None
        self.listen_stop = threading.Event()

        pad = {"padx": 6, "pady": 4}
        top = ttk.Frame(root)
        top.pack(fill="x", **pad)

        # Device row (auto-detected by USB VID/PID; no manual port selection)
        ttk.Label(top, text="Device:").grid(row=0, column=0, sticky="w")
        self.device_port = None
        self.device_var = tk.StringVar()
        ttk.Label(top, textvariable=self.device_var).grid(row=0, column=1, sticky="w", padx=4)
        ttk.Button(top, text="Refresh", command=self.refresh_device).grid(row=0, column=2, padx=2)

        # File rows: separate firmware selectors for B91 and ESP32
        ttk.Label(top, text="B91 firmware (.bin):").grid(row=1, column=0, sticky="w")
        self.b91_file_var = tk.StringVar()
        ttk.Entry(top, textvariable=self.b91_file_var).grid(row=1, column=1, sticky="we", padx=4)
        ttk.Button(top, text="Browse...", command=lambda: self.browse("b91")).grid(row=1, column=2, padx=2)

        ttk.Label(top, text="ESP32 firmware (.bin):").grid(row=2, column=0, sticky="w")
        self.esp_file_var = tk.StringVar()
        ttk.Entry(top, textvariable=self.esp_file_var).grid(row=2, column=1, sticky="we", padx=4)
        ttk.Button(top, text="Browse...", command=lambda: self.browse("esp")).grid(row=2, column=2, padx=2)

        ttk.Label(top, text="B91 bootloader firmware (.bin):").grid(row=3, column=0, sticky="w")
        self.bl_file_var = tk.StringVar()
        ttk.Entry(top, textvariable=self.bl_file_var).grid(row=3, column=1, sticky="we", padx=4)
        ttk.Button(top, text="Browse...", command=lambda: self.browse("bldr")).grid(row=3, column=2, padx=2)

        top.columnconfigure(1, weight=1)

        # Progress + action
        mid = ttk.Frame(root)
        mid.pack(fill="x", **pad)
        self.progress = ttk.Progressbar(mid, mode="determinate", maximum=100)
        self.progress.pack(side="left", fill="x", expand=True)
        self.pct_var = tk.StringVar(value="0%")
        ttk.Label(mid, textvariable=self.pct_var, width=26, anchor="w").pack(side="left", padx=6)
        self.listen_btn = ttk.Button(mid, text="Open CDC", command=self.toggle_listen)
        self.listen_btn.pack(side="left", padx=4)
        self.reset_btn = ttk.Button(mid, text="Reset", command=self.start_reset)
        self.reset_btn.pack(side="left", padx=4)
        self.reboot_btn = ttk.Button(mid, text="Reboot", command=self.start_reboot)
        self.reboot_btn.pack(side="left", padx=4)
        self.flash_btn = ttk.Button(mid, text="Update B91", command=self.start_flash)
        self.flash_btn.pack(side="left", padx=4)
        self.esp_btn = ttk.Button(mid, text="Update ESP32",
                                  command=lambda: self.start_flash(target="esp"))
        self.esp_btn.pack(side="left", padx=4)
        self.bl_btn = ttk.Button(mid, text="Update BL",
                                 command=lambda: self.start_flash(target="bldr"))
        self.bl_btn.pack(side="left", padx=4)

        # Two log windows side by side: PC log (left) and Device log (right)
        logs = ttk.Panedwindow(root, orient="horizontal")
        logs.pack(fill="both", expand=True, padx=6, pady=(2, 6))

        left = ttk.Labelframe(logs, text="PC log")
        self.log_box = scrolledtext.ScrolledText(left, wrap="word", state="disabled",
                                                  font=("Consolas", 9))
        self.log_box.pack(fill="both", expand=True)
        logs.add(left, weight=1)

        right = ttk.Labelframe(logs, text="Device log")
        self.dev_box = scrolledtext.ScrolledText(right, wrap="word", state="disabled",
                                                  font=("Consolas", 9))
        self.dev_box.pack(fill="both", expand=True)
        logs.add(right, weight=1)

        self.refresh_device()
        self.root.after(60, self._drain_queue)

    # --- thread-safe logging via the queue ---
    def log(self, msg):
        self.q.put(("log", msg))

    def dlog(self, msg):
        self.q.put(("dlog", msg))

    def set_progress(self, done, total, speed=0.0, eta=0.0):
        self.q.put(("progress", (done, total, speed, eta)))

    @staticmethod
    def _append(box, text):
        box.configure(state="normal")
        box.insert("end", text + "\n")
        box.see("end")
        box.configure(state="disabled")

    def _drain_queue(self):
        try:
            while True:
                kind, payload = self.q.get_nowait()
                if kind == "log":
                    self._append(self.log_box, payload)
                elif kind == "dlog":
                    self._append(self.dev_box, payload)
                elif kind == "progress":
                    done, total, speed, eta = payload
                    pct = (done * 100 // total) if total else 0
                    self.progress["value"] = pct
                    if speed > 0:
                        self.pct_var.set(f"{pct}%  {speed:.1f} KB/s  ETA {eta:.0f}s")
                    else:
                        self.pct_var.set(f"{pct}%")
                elif kind == "done":
                    self.flash_btn.configure(state="normal")
                    self.esp_btn.configure(state="normal")
                    self.bl_btn.configure(state="normal")
                    self.listen_btn.configure(state="normal")
                    self.reset_btn.configure(state="normal")
                    self.reboot_btn.configure(state="normal")
                    self.log("==== DONE ====" if payload else "==== FAILED ====")
                elif kind == "redetect":
                    self.refresh_device()
                elif kind == "lstate":
                    # payload True == listening/open, False == closed
                    self.listening = payload
                    self.listen_btn.configure(
                        text="Close CDC" if payload else "Open CDC", state="normal")
                    state = "disabled" if payload else "normal"
                    self.flash_btn.configure(state=state)
                    self.esp_btn.configure(state=state)
                    self.bl_btn.configure(state=state)
                    self.reset_btn.configure(state=state)
                    self.reboot_btn.configure(state=state)
        except queue.Empty:
            pass
        self.root.after(60, self._drain_queue)

    # --- UI actions ---
    def refresh_device(self):
        """Re-scan USB ports and update the auto-detected device path."""
        self.device_port = find_device_port()
        if self.device_port:
            self.device_var.set(
                f"{self.device_port}  ({PRODUCT_NAME}  VID 0x{USB_VID:04X} / "
                f"PID 0x{USB_PID:04X})")
        else:
            self.device_var.set(
                "Not found - plug in the device (in bootloader/DFU) and click Refresh")
        return self.device_port

    def browse(self, target="b91"):
        names = {"esp": "ESP32", "bldr": "B91 bootloader", "b91": "B91"}
        fn = filedialog.askopenfilename(
            title=f"Select {names.get(target, 'B91')} firmware bin",
            filetypes=[("Firmware image", "*.bin"), ("All files", "*.*")])
        if fn:
            var = {"esp": self.esp_file_var, "bldr": self.bl_file_var}.get(target, self.b91_file_var)
            var.set(fn)

    def _require_device(self):
        """Auto-detect the device port; show an insert-and-refresh hint if absent."""
        port = self.refresh_device()
        if not port:
            messagebox.showerror(
                "Device not found",
                f"No {PRODUCT_NAME} device detected "
                f"(USB VID 0x{USB_VID:04X} / PID 0x{USB_PID:04X}).\n\n"
                "Plug in the device in bootloader (DFU) mode running the CDC-OTA "
                "firmware, then click Refresh and try again.")
        return port

    # --- CDC listen / "open port and watch device data" ---
    def toggle_listen(self):
        if self.listening or (self.listen_thread and self.listen_thread.is_alive()):
            # request stop; worker will post lstate=False when it has closed the port
            self.listen_stop.set()
            self.listen_btn.configure(state="disabled")
            return
        if self.worker and self.worker.is_alive():
            messagebox.showinfo("Busy", "A flash is in progress.")
            return
        port = self._require_device()
        if not port:
            return
        self.listen_stop.clear()
        self.listen_btn.configure(state="disabled")
        self.listen_thread = threading.Thread(
            target=self._listen_worker, args=(port,), daemon=True)
        self.listen_thread.start()

    def _listen_worker(self, port):
        ser = None
        try:
            ser = serial.Serial(port, baudrate=115200, timeout=0.2)
            for attr in ("dtr", "rts"):
                try:
                    setattr(ser, attr, True)
                except Exception:
                    pass
            try:
                ser.reset_input_buffer()
            except Exception:
                pass
            self.q.put(("lstate", True))
            self.log(f"CDC opened on {port}. Watching for device data ...")
            buf = bytearray()
            total = 0
            last_note = time.time()
            while not self.listen_stop.is_set():
                chunk = ser.read(ser.in_waiting or 1)
                if chunk:
                    total += len(chunk)
                    buf += chunk
                    while True:
                        nl = buf.find(b"\n")
                        if nl < 0:
                            break
                        line = bytes(buf[:nl]).rstrip(b"\r")
                        del buf[:nl + 1]
                        text = line.decode("utf-8", "replace")
                        self.dlog(text[4:] if text.startswith("LOG ") else text)
                else:
                    now = time.time()
                    if now - last_note >= 3 and total == 0:
                        self.log("   (no data received yet ...)")
                        last_note = now
            if buf:
                self.dlog(bytes(buf).decode("utf-8", "replace"))
            self.log(f"CDC closed. {total} bytes received total.")
        except serial.SerialException as e:
            self.log(f"CDC open/listen error: {e}")
        except Exception as e:  # noqa: BLE001
            self.log(f"CDC unexpected error: {e!r}")
        finally:
            try:
                if ser:
                    ser.close()
            except Exception:
                pass
            self.q.put(("lstate", False))

    def start_flash(self, target="b91"):
        if self.worker and self.worker.is_alive():
            return
        if self.listening:
            messagebox.showinfo("CDC open", "Close the CDC monitor before flashing.")
            return
        port = self._require_device()
        if not port:
            return
        file_vars = {"esp": self.esp_file_var, "bldr": self.bl_file_var, "b91": self.b91_file_var}
        names     = {"esp": "ESP32", "bldr": "B91 bootloader", "b91": "B91"}
        ranges    = {"esp": (ESP_SIZE_MIN, ESP_SIZE_MAX),
                     "bldr": (BL_SIZE_MIN, BL_SIZE_MAX),
                     "b91": (B91_SIZE_MIN, B91_SIZE_MAX)}
        name = names.get(target, "B91")
        path = file_vars.get(target, self.b91_file_var).get().strip()
        if not path or not os.path.isfile(path):
            messagebox.showerror("No file", f"Select a valid {name} firmware .bin file.")
            return
        try:
            with open(path, "rb") as f:
                data = f.read()
        except OSError as e:
            messagebox.showerror("Read error", str(e))
            return

        # Sanity-check the firmware size for the chosen target (catches wrong-file picks).
        lo, hi = ranges.get(target, (B91_SIZE_MIN, B91_SIZE_MAX))
        if not (lo <= len(data) <= hi):
            messagebox.showerror(
                "Firmware size out of range",
                f"{name} firmware must be {lo // 1024}KB..{hi // 1024}KB, "
                f"but this file is {len(data) // 1024}KB.\nWrong .bin selected?")
            return

        self.flash_btn.configure(state="disabled")
        self.esp_btn.configure(state="disabled")
        self.bl_btn.configure(state="disabled")
        self.reset_btn.configure(state="disabled")
        self.reboot_btn.configure(state="disabled")
        self.progress["value"] = 0
        self.pct_var.set("0%")
        self.log("=" * 60)
        dest = {"esp": "ESP32-S2 (via B91 UART)", "bldr": "B91 bootloader (flash 0x0000)"}
        self.log(f"Target: {dest.get(target, 'B91 app flash (0x20000)')}")
        self.log(f"Port: {port}")
        self.log(f"File: {path}")

        self.worker = threading.Thread(
            target=self._worker, args=(port, data, target), daemon=True)
        self.worker.start()

    # --- Reset: tell the running app to reboot into the bootloader ---
    def start_reset(self):
        if self.worker and self.worker.is_alive():
            return
        if self.listening:
            messagebox.showinfo("CDC open", "Close the CDC monitor before resetting.")
            return
        port = self._require_device()
        if not port:
            return
        self.flash_btn.configure(state="disabled")
        self.esp_btn.configure(state="disabled")
        self.bl_btn.configure(state="disabled")
        self.reset_btn.configure(state="disabled")
        self.reboot_btn.configure(state="disabled")
        self.listen_btn.configure(state="disabled")
        self.log("=" * 60)
        self.log(f"Reset: sending 'reset' to {port}")
        self.worker = threading.Thread(
            target=self._reset_worker, args=(port,), daemon=True)
        self.worker.start()

    def _reset_worker(self, port):
        ok = False
        try:
            new_port = send_reset_and_reconnect(port, self.log, self.dlog)
            self.q.put(("redetect", None))
            ok = new_port is not None
        except serial.SerialException as e:
            self.log(f"SERIAL ERROR: {e}")
        except Exception as e:  # noqa: BLE001
            self.log(f"UNEXPECTED ERROR: {e!r}")
        self.q.put(("done", ok))

    # --- Reboot: tell the bootloader to clear its OTA flag and reboot out of DFU ---
    def start_reboot(self):
        if self.worker and self.worker.is_alive():
            return
        if self.listening:
            messagebox.showinfo("CDC open", "Close the CDC monitor before rebooting.")
            return
        port = self._require_device()
        if not port:
            return
        self.flash_btn.configure(state="disabled")
        self.esp_btn.configure(state="disabled")
        self.bl_btn.configure(state="disabled")
        self.reset_btn.configure(state="disabled")
        self.reboot_btn.configure(state="disabled")
        self.listen_btn.configure(state="disabled")
        self.log("=" * 60)
        self.log(f"Reboot: sending 'reboot' to {port}")
        self.worker = threading.Thread(
            target=self._reboot_worker, args=(port,), daemon=True)
        self.worker.start()

    def _reboot_worker(self, port):
        # The bootloader clears its OTA flag and sys_reboot()s on "reboot", so the port
        # drops - which is the expected success here (no reply is read).
        ok = False
        try:
            ser = serial.Serial(port, baudrate=115200, timeout=0.2, write_timeout=5)
            try:
                for attr in ("dtr", "rts"):
                    try:
                        setattr(ser, attr, True)
                    except Exception:
                        pass
                ser.write(b"reboot")
                ser.flush()
                self.log("Sent 'reboot' - B91 is clearing its OTA flag and restarting out of DFU.")
                ok = True
            finally:
                try:
                    ser.close()
                except Exception:
                    pass
            self.q.put(("redetect", None))
        except (serial.SerialException, OSError) as e:
            # Port already gone = device rebooted = success.
            self.log(f"Port closed (device rebooting): {e}")
            ok = True
            self.q.put(("redetect", None))
        except Exception as e:  # noqa: BLE001
            self.log(f"UNEXPECTED ERROR: {e!r}")
        self.q.put(("done", ok))

    def _worker(self, port, data, target="b91"):
        ok = False
        try:
            flash_firmware(port, data, self.log, self.dlog, self.set_progress, target)
            ok = True
        except OtaError as e:
            self.log(f"ERROR: {e}")
        except serial.SerialException as e:
            self.log(f"SERIAL ERROR: {e}")
        except Exception as e:  # noqa: BLE001
            self.log(f"UNEXPECTED ERROR: {e!r}")
        self.q.put(("done", ok))


def main():
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
