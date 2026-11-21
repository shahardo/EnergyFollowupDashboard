#!/usr/bin/env node
// Runs an executable from backend/.venv, cross-platform (bin/ on Linux/macOS, Scripts/ on Windows).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const backendDir = join(repoRoot, 'backend');

const [bin, ...args] = process.argv.slice(2);
if (!bin) {
  console.error('Usage: node scripts/venv-run.mjs <executable> [args...]');
  process.exit(1);
}

const binDir = process.platform === 'win32' ? 'Scripts' : 'bin';
const ext = process.platform === 'win32' ? '.exe' : '';
const venvBin = join(backendDir, '.venv', binDir, bin + ext);

if (!existsSync(venvBin)) {
  console.error(
    `${venvBin} not found.\n` +
      'Create the virtualenv first (see README.md):\n' +
      '  cd backend\n' +
      '  python3.12 -m venv .venv\n' +
      '  .venv/bin/pip install -e ".[dev]"   # on Windows: .venv\\Scripts\\pip install -e ".[dev]"\n' +
      '  cd ..'
  );
  process.exit(1);
}

const result = spawnSync(venvBin, args, { stdio: 'inherit', cwd: backendDir });
process.exit(result.status ?? 1);
