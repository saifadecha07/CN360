# CN360 — PICO 4 Dev Environment Setup

Engine: **Unity** (2022.3 LTS recommended — this is the version PICO's
Unity Integration SDK officially supports at the time of writing; check
developer.picoxr.com for the current supported range before installing).

This machine currently has: JDK 21 (Eclipse Adoptium) only. Unity Hub,
Android Build Support, and the PICO SDK still need to be installed
manually (see checklist below) — none of that has been installed yet.

## 1. PICO Developer Account
- Sign up at https://developer.picoxr.com using your project email
- Create an Organization (or join the team's existing one)
- Create an App entry in the Developer Console → note the **App ID**
  (needed later for PICO SDK features like hand tracking / anchors)

## 2. PICO 4 Device
- Install the **PICO Developer Center** app on the headset
- Bind the headset to your developer account/organization
- Enable **Developer Mode**: Settings → General → Developer
- Enable **USB Debugging** in the same Developer menu
- Connect via USB-C to this PC and accept the RSA debugging prompt
  when it appears in the headset

## 3. Unity Hub + Editor
- Install Unity Hub: `winget install Unity.UnityHub`
- In Unity Hub → Installs, add **Unity 2022.3 LTS**
- During install, check the **Android Build Support** module,
  including its **OpenJDK** and **Android SDK & NDK Tools** sub-items
  (Unity Hub bundles these — you don't need a separate Android
  Studio install unless you want one)

## 4. PICO Unity Integration SDK
- Open (or create) the Unity project in `/unity`
- Download the **PICO Unity Integration SDK** (`.unitypackage`) from
  developer.picoxr.com → Downloads
- Assets → Import Package → Custom Package… → import the `.unitypackage`
- Switch build target to Android: File → Build Settings → Android → Switch Platform
- Set Player Settings per PICO's docs (min API level, package name,
  XR Plug-in Management → enable PICO XR / OpenXR)

## 5. Verify the pipeline
- `adb devices` shows the headset (after installing Android
  platform-tools, which comes with the Android Build Support module)
- Build & Run a sample scene from Unity to the headset over USB

---
Once Unity Hub / Android tooling are actually installed on this
machine, come back and we can automate steps 3–5 (winget install +
Unity Hub CLI module add) instead of doing them by hand.
