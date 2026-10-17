// Electron を（Linux では Xvfb 上で）起動し、test/e2e/scenario.js を実行する
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'test-output');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const electron = require('electron');
const args = [root, '--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--disable-gpu'];
const env = { ...process.env, FOLIO_E2E: '1', FOLIO_E2E_OUT: out, FOLIO_E2E_SCRIPT: path.join(root, 'test/e2e/scenario.js') };
const useXvfb = process.platform === 'linux' && !process.env.DISPLAY && existsSync('/usr/bin/xvfb-run');
const [cmd, cmdArgs] = useXvfb ? ['xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', electron, ...args]] : [electron, args];
const child = spawn(cmd, cmdArgs, { env, stdio: 'inherit' });
const timer = setTimeout(() => { console.error('e2e timeout'); child.kill('SIGKILL'); process.exit(3); }, 180_000);
child.on('exit', (code) => { clearTimeout(timer); console.log(`e2e exit code ${code}; outputs in ${out}`); process.exit(code ?? 1); });
