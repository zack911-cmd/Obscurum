# GhostShell Desktop

## Development

- Install dependencies with `npm install`
- Start the app in Electron dev mode with `npm run electron:dev`

## Packaging

- Build Linux installer: `npm run electron:build:linux`
- Build Windows installer: `npm run electron:build:win`
- Build macOS installer: `npm run electron:build:mac`

> The packaging step requires real icon assets in `build/icons/` for Windows and macOS builds. The Linux build can use the placeholder PNGs in `build/icons/linux/` for local testing.
