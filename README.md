#AI Use Notification!! This tool was "vibecoded" with Claude AI/Code. This was something I wanted for myself and decicded to share it for anyone that has an intrest. Im work in cyber security, im not a programmer by trade.

# RoboCopy GUI - Build Instructions

## Prerequisites
- Node.js 18+ (https://nodejs.org)
- Windows 10/11 (for building the Windows .exe)

## Quick Build (2 steps)

### 1. Install dependencies
Open a terminal in this folder and run:
```
npm install
```

### 2. Build the Windows executable
```
npm run dist:win
```

This will produce two files inside the `release/` folder:
- **RoboCopy GUI Setup 2.0.0.exe** — NSIS installer (installs to Program Files, creates Start Menu + Desktop shortcuts)
- **RoboCopyGUI-Portable-2.0.0.exe** — Single portable .exe, no installation needed

---

## Development (live preview)
```
npm run dev
```
Opens the app in a live Electron window with hot-reload.

## Notes
- Settings and queue are saved to your user profile's localStorage (AppData)
- The app generates RoboCopy commands and copies them to clipboard
- "Export .bat" saves a runnable Windows batch script
- Scheduled jobs use Windows Task Scheduler via `schtasks`
