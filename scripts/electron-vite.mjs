// Runs electron-vite with ELECTRON_RUN_AS_NODE removed. VS Code (and some of its
// terminals/extensions) set that variable, which makes Electron start as plain
// Node and exit immediately without opening a window.
import { spawn } from 'node:child_process'

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const child = spawn('npx', ['electron-vite', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})
child.on('exit', (code) => process.exit(code ?? 0))
