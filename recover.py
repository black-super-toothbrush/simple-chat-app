import tkinter as tk
from tkinter import messagebox
from tkinter.ttk import Progressbar
import serial
import serial.tools.list_ports
import threading
import zlib
import base64
from _firmware import _K, _D

TARGET_VID = 0x19F5
TARGET_PID = 0x5740


def get_firmware_bytes() -> bytes:
    """Decrypt firmware from memory, no disk write."""
    encrypted = base64.b64decode(_D)
    return zlib.decompress(bytes(b ^ _K for b in encrypted))


def crc16(data: bytes):
    crc = 0xFFFF
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            if crc & 0x8000:
                crc = (crc << 1) ^ 0x1021
            else:
                crc = crc << 1
            crc &= 0xFFFF
    return crc


def find_target_port():
    for port in serial.tools.list_ports.comports():
        if port.vid == TARGET_VID and port.pid == TARGET_PID:
            return port.device
    return None


def update_status(msg):
    status_label.config(text=msg)
    root.update_idletasks()


def update_progress(value):
    progress_bar['value'] = value
    root.update_idletasks()


def send_data(ser, data):
    ser.write(data)
    response = ser.read_until(expected=b'dataok')
    if response != b'dataok':
        raise ConnectionError("No response or incorrect acknowledgment from device.")


def do_download(com_port):
    update_status(f"Device found: {com_port}, starting download...")
    start_button.config(state=tk.DISABLED)

    file_data = get_firmware_bytes()

    file_size = len(file_data)
    padding_size = (-file_size) % 32
    if padding_size:
        file_data += b'\xFF' * padding_size
    file_size = len(file_data)
    file_checksum16 = crc16(file_data)

    try:
        ser = serial.Serial(com_port, baudrate=1000000, timeout=10)
        ser.write(b'startdownload' + file_size.to_bytes(4, 'big'))
        if ser.read_until(expected=b'startdownload') != b'startdownload':
            raise ConnectionError("Device did not acknowledge start of download.")

        chunk_size = 32
        for i in range(0, file_size, chunk_size):
            chunk = file_data[i:i + chunk_size]
            if len(chunk) < chunk_size:
                chunk = chunk.ljust(chunk_size, b'\xff')
            chunk_address = i.to_bytes(4, 'big')
            chunk_checksum16 = crc16(chunk)
            data_packet = b'data' + chunk_address + chunk + chunk_checksum16.to_bytes(2, 'big')
            send_data(ser, data_packet)
            update_progress((i + chunk_size) / file_size * 100)
            update_status(f"Downloading... {min(i + chunk_size, file_size)}/{file_size} bytes")

        finish_packet = b'finish' + file_checksum16.to_bytes(2, 'big')
        ser.write(finish_packet)
        if ser.read_until(expected=b'downloadok') != b'downloadok':
            raise ConnectionError("Device did not acknowledge completion of download.")

        update_status("Download complete!")
        messagebox.showinfo("Success", "Firmware downloaded successfully!")
        update_progress(0)

    except serial.SerialException as e:
        messagebox.showerror("Serial Error", str(e))
        update_status("Serial error, please retry.")
    except ConnectionError as e:
        messagebox.showerror("Connection Error", str(e))
        update_status("Connection error, please retry.")
    finally:
        try:
            ser.close()
        except Exception:
            pass
        start_button.config(state=tk.NORMAL)


def start_download_thread():
    com_port = find_target_port()
    if not com_port:
        messagebox.showerror("Device Not Found",
                             f"No device found with VID=0x{TARGET_VID:04X} PID=0x{TARGET_PID:04X}.\nPlease check the connection.")
        update_status("Target device not found.")
        return
    threading.Thread(target=do_download, args=(com_port,), daemon=True).start()


def create_gui():
    global root, progress_bar, status_label, start_button

    root = tk.Tk()
    root.title("Switch2 Recover")
    root.resizable(False, False)

    tk.Label(root, text="Device:", font=("Arial", 10)).grid(row=0, column=0, sticky="e", padx=8, pady=6)
    tk.Label(root, text=f"VID=0x{TARGET_VID:04X}  PID=0x{TARGET_PID:04X}",
             font=("Arial", 10), fg="navy").grid(row=0, column=1, sticky="w", padx=4)

    start_button = tk.Button(root, text="Start Download", font=("Arial", 11, "bold"),
                             bg="#2196F3", fg="white", padx=12, pady=4,
                             command=start_download_thread)
    start_button.grid(row=1, column=0, columnspan=2, pady=10)

    progress_bar = Progressbar(root, orient=tk.HORIZONTAL, length=380, mode='determinate')
    progress_bar.grid(row=2, column=0, columnspan=2, padx=10, pady=4)

    status_label = tk.Label(root, text="Click Start Download to begin", font=("Arial", 9), fg="gray")
    status_label.grid(row=3, column=0, columnspan=2, pady=(2, 10))

    root.mainloop()


if __name__ == "__main__":
    create_gui()
