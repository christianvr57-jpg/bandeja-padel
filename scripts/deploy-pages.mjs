/**
 * Publica la demo estática (API + PostgreSQL en el navegador) en la rama
 * gh-pages del repositorio, que GitHub Pages sirve como web pública.
 *
 *   npm run deploy:pages
 */
import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

const remote = out('git remote get-url origin');
const commit = out('git rev-parse --short HEAD');

run('npx vite build --mode demo');

const dir = mkdtempSync(join(tmpdir(), 'bandeja-pages-'));
try {
  cpSync('dist/demo', dir, { recursive: true });
  // Sin Jekyll: GitHub Pages sirve los ficheros tal cual.
  writeFileSync(join(dir, '.nojekyll'), '');
  run('git init -q -b gh-pages', dir);
  run('git add -A', dir);
  run(`git -c user.name="${out('git config user.name')}" -c user.email="${out('git config user.email')}" commit -q -m "Demo publicada desde ${commit}"`, dir);
  run(`git push -f "${remote}" gh-pages`, dir);
  console.log('\nDemo publicada en la rama gh-pages.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
