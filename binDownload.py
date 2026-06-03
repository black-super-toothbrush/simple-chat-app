import tkinter as tk
from tkinter import filedialog, messagebox
from tkinter.ttk import Progressbar
import serial
import serial.tools.list_ports
import threading
import os
import crcmod.predefined

# 文件路径，用于存储和读取数字
FILE_PATH = "default_value.txt"

def read_default_value():
    """读取文本文件中的默认值"""
    if os.path.exists(FILE_PATH):
        with open(FILE_PATH, 'r') as file:
            value = file.read().strip()
            if value.isdigit():
                return value
    # 如果文件不存在或内容无效，返回默认值 "39470001"
    return "39470001"
    
def write_default_value(value):
    """将新的值写入文本文件"""
    with open(FILE_PATH, 'w') as file:
        file.write(value)
        
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

def update_progress_bar(value):
    progress_bar['value'] = value
    root.update_idletasks()

def send_data(ser, data):
    ser.write(data)
    response = ser.read_until(expected=b'dataok')
    if response != b'dataok':
        raise ConnectionError("No response or incorrect acknowledgment from device.")

def start_download_thread():
    threading.Thread(target=start_download).start()

def start_download():
    file_path = file_label.cget("text")
    if not file_path:
        messagebox.showerror("Error", "Please select a file first.")
        return

    with open(file_path, 'rb') as f:
        file_data = f.read()
    
    file_size = len(file_data)
    # Calculate padding size to make the file data a multiple of 32
    padding_size = (-file_size) % 32  # This will give us how many bytes we need to add to make it divisible by 32
    # Append 0xFF bytes if padding is needed
    if padding_size:
        file_data += b'\xFF' * padding_size
    # Now, file_data is guaranteed to be a multiple of 32 in size
    file_size = len(file_data)  # Update the file size after padding
    file_checksum16 = crc16(file_data)

    try:
        #ser = serial.Serial(com_var.get(), baudrate=115200, timeout=1)
        ser = serial.Serial(com_var.get(), baudrate=1000000, timeout=10)
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
            update_progress_bar((i + chunk_size) / file_size * 100)
        
        finish_packet = b'finish' + file_checksum16.to_bytes(2, 'big')
        ser.write(finish_packet)
        if ser.read_until(expected=b'downloadok') != b'downloadok':
            raise ConnectionError("Device did not acknowledge completion of download.")

        messagebox.showinfo("Success", "File downloaded successfully.")
        update_progress_bar(0)

    except serial.SerialException as e:
        messagebox.showerror("Error", str(e))
    except ConnectionError as e:
        messagebox.showerror("Connection Error", str(e))
    finally:
        ser.close()

def select_file():
    file_path = filedialog.askopenfilename(filetypes=[("Binary files", "*.bin")])
    if file_path:
        file_label.config(text=file_path)
        
def send_input_data():
    input_data = input_text.get()
    # 检查输入框内容是否为数字
    if not input_data.isdigit():
        messagebox.showerror("Error", "Input must be a number.")
        return    
    if input_data and com_var.get():
        try:
            ser = serial.Serial(com_var.get(), baudrate=1000000, timeout=10)
            ser.write(("SE" + input_data + '\n').encode())
            # 等待回复
            response = ser.read_until(expected=b'\n').decode().strip()
            # 检查回复是否与发送的内容相同
            input_data_with_prefix  = "SE" + input_data
            if response == input_data_with_prefix :
                messagebox.showinfo("Success", f"Data sent successfully: {input_data}")
                #new_value = str(int(input_data) + 1)
                new_value = str(int(input_data) + 1).zfill(len(input_data))
                input_text.delete(0, tk.END)  # 清除当前输入框内容
                input_text.insert(0, new_value)  # 插入加1后的新值
                
                # 将新的数字写入文本文件
                write_default_value(new_value)                
            else:
                messagebox.showerror("Failure", f"Data mismatch. Sent: {input_data}, Received: {response}")     
            ser.close()
        except serial.SerialException as e:
            messagebox.showerror("Error", str(e))
    else:
        messagebox.showwarning("Warning", "Please select a COM port and enter some text.")
def send_erase():
    try:
        ser = serial.Serial(com_var.get(), baudrate=1000000, timeout=10)
        ser.write(("ER\n").encode())
        # 等待回复
        response = ser.read_until(expected=b'\n').decode().strip()
        if response == "ER" :
            messagebox.showinfo("Success", f"erase serial number Ok")
        else:
            messagebox.showerror("Failure", f"erase serial number Fail")     
        ser.close()
    except serial.SerialException as e:
        messagebox.showerror("Error", str(e))
def send_clear():
    try:
        ser = serial.Serial(com_var.get(), baudrate=1000000, timeout=10)
        ser.write(("CL\n").encode())
        response = ser.read_until(expected=b'\n').decode().strip()
        if response == "ER" :
            messagebox.showinfo("Success", f"erase serial number Ok")
        else:
            messagebox.showinfo("Success", f"erase serial number Ok")    
        ser.close()
    except serial.SerialException as e:
        messagebox.showerror("Error", str(e))        
        
def send_boot():
    try:
        ser = serial.Serial(com_var.get(), baudrate=1000000, timeout=10)
        ser.write(("BO\n").encode())
        # 等待回复
        response = ser.read_until(expected=b'\n').decode().strip()
        if response == "BO" :
            messagebox.showinfo("Success", f"enter boot Ok")
        else:
            messagebox.showerror("Failure", f"enter boot Fail")     
        ser.close()
    except serial.SerialException as e:
        messagebox.showerror("Error", str(e))        
        
def create_gui():
    global root, com_var, file_label, progress_bar,input_text
    
    root = tk.Tk()
    root.title("BIN Downloader")

    tk.Label(root, text="Select COM Port:").grid(row=0, column=0, sticky="e")
    # 初始化 Tkinter 的 StringVar
    com_var = tk.StringVar(root)

    # 获取可用端口
    available_ports = [port.device for port in serial.tools.list_ports.comports()]

    # 如果有可用的端口，选择第一个作为默认值，否则设置一个占位符
    if available_ports:
        com_var.set(available_ports[0])  # 设置默认值为第一个可用端口
    else:
        com_var.set("No ports available")  # 如果没有可用端口，设置默认值为占位符

    # 创建 OptionMenu
    com_dropdown = tk.OptionMenu(root, com_var, *available_ports if available_ports else ["No ports available"])
    com_dropdown.grid(row=0, column=1)


    open_button = tk.Button(root, text="Select BIN File", command=select_file)
    open_button.grid(row=1, column=0, columnspan=2, pady=5)

    file_label = tk.Label(root, text="")
    file_label.grid(row=2, column=0, columnspan=2)

    start_button = tk.Button(root, text="Start Download", command=start_download_thread)
    start_button.grid(row=3, column=0, columnspan=2, pady=5)

    progress_bar = Progressbar(root, orient=tk.HORIZONTAL, length=300, mode='determinate')
    progress_bar.grid(row=4, column=0, columnspan=2, pady=5)

    # Adding input text field and send button
    tk.Label(root, text="Input Serial Number:").grid(row=5, column=0, sticky="e")
    input_text = tk.Entry(root, width=30)
    input_text.grid(row=5, column=1)
    default_value = read_default_value()
    input_text.insert(0, default_value)

    send_button = tk.Button(root, text="Send Data", command=send_input_data)
    send_button.grid(row=6, column=0, columnspan=1, pady=5)
    
    erase_button = tk.Button(root, text="Erase Serial", command=send_erase)
    erase_button.grid(row=6, column=1, columnspan=1, pady=5)

    boot_button = tk.Button(root, text="Enter boot", command=send_boot)
    boot_button.grid(row=6, column=2, columnspan=1, pady=5)
 
    boot_button = tk.Button(root, text="Clear Session", command=send_clear)
    boot_button.grid(row=6, column=3, columnspan=1, pady=5)

    
    root.mainloop()

if __name__ == "__main__":
    create_gui()





