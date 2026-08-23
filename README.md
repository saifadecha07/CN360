# CN360 Robot Rescue VR

CN360 is a robot rescue project combining embedded robot control, ROS 2 support, UDP testing tools, and a Unity-based virtual reality application.

## Project Areas

- `Robot/ESP32/` contains the ESP32 control code.
- `Robot/RaspberryPi/` contains the Raspberry Pi control code.
- `Robot/ROS2/` contains the ROS 2 code.
- `TestTools/` contains utilities for testing communication, including the UDP receiver.
- `UnityProjects/CN360_Robot_Rescue_VR/` contains the Unity VR project.
- `Docs/` contains project documentation.

## Getting Started

1. Open the required robot or ROS 2 Python file under `Robot/`.
2. Use `TestTools/udp_receiver.py` when testing UDP communication.
3. Open `UnityProjects/CN360_Robot_Rescue_VR/` with the compatible Unity Editor version.
4. Refer to [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the repository layout.

## Requirements

- Python for the robot and testing scripts
- ROS 2 for the ROS 2 integration
- Unity with XR support for the VR application

## Project Structure

```text
CN360/
├── Docs/
├── Robot/
│   ├── ESP32/code.py
│   ├── RaspberryPi/code.py
│   └── ROS2/code.py
├── TestTools/
│   └── udp_receiver.py
└── UnityProjects/
	└── CN360_Robot_Rescue_VR/
		├── Assets/
		│   ├── Scenes/
		│   ├── Scripts/
		│   ├── Settings/
		│   └── XR/
		├── Packages/
		├── ProjectSettings/
		└── UserSettings/
```

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) for the expanded file listing.

## License

No license has been specified yet.
