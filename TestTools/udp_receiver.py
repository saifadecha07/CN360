import socket

UDP_IP = "0.0.0.0"
UDP_PORT = 4210

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind((UDP_IP, UDP_PORT))

print(f"Listening UDP on port {UDP_PORT}...")
print("Press Ctrl+C to stop")

while True:
    data, addr = sock.recvfrom(1024)

    message = data.decode("utf-8")

    print(f"From {addr}: {message}")