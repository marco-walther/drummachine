// Runs electron-vite with ELECTRON_RUN_AS_NODE removed. VS Code (and some of its
// terminals/extensions) set that variable, which makes Electron start as plain
// Node and exit immediately without opening a window.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const cli = fileURLToPath(new URL('../node_modules/electron-vite/bin/electron-vite.js', import.meta.url))
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env })
child.on('exit', (code) => process.exit(code ?? 0))
