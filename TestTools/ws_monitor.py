#!/usr/bin/env python3
"""WebSocket receiver and monitor for CN360 Protocol v1.

Replaces the legacy UDP receiver (udp_receiver.py) to match the current
WebSocket-based architecture.

Usage:
    python ws_monitor.py [--port 8765] [--path /ws]
"""

import argparse
import asyncio
import sys

try:
    import websockets
except ImportError:
    print("Error: 'websockets' library is required. Install with: pip install websockets")
    sys.exit(1)


async def handler(websocket):
    client_ip = websocket.remote_address[0]
    print(f"\n[+] Client connected from {client_ip}")
    try:
        async for message in websocket:
            print(f"[{client_ip}] {message}")
    except websockets.exceptions.ConnectionClosed:
        print(f"[-] Client {client_ip} disconnected")


async def main():
    parser = argparse.ArgumentParser(description="CN360 WebSocket Monitor")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on (default: 8765)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host address (default: 0.0.0.0)")
    args = parser.parse_args()

    print(f"==================================================")
    print(f"CN360 WebSocket Monitor running on ws://{args.host}:{args.port}")
    print(f"Listening for Protocol v1 packets (DRIVE, HEAD, LIGHT)...")
    print(f"Press Ctrl+C to stop")
    print(f"==================================================")

    async with websockets.serve(handler, args.host, args.port):
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nMonitor stopped.")
