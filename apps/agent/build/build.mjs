// Builds the Windows installer from macOS/Linux:
//
//   node apps/agent/build/build.mjs --server https://api.yourdomain.com [--version 1.0.0]
//
//   1. icon (.ico) drawn from the brand mark
//   2. Windows resources (icon + manifest) via rsrc
//   3. QuickPrintAgent.exe: Go 1.20, windows/386, no console window
//   4. QuickPrintAgent-Setup.exe via NSIS (makensis), with SumatraPDF 3.4.6 (32-bit)
//   5. copies the installer to apps/web/public/downloads/ for the dashboard's download button
//
// Needs: makensis (brew install makensis). Go 1.20, rsrc and SumatraPDF are fetched into .toolchain/.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const agentDir = path.resolve(here, '..');
const root = path.resolve(agentDir, '../..');
const toolchain = path.join(root, '.toolchain');
const out = path.join(here, 'out');
const stage = path.join(out, 'stage');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const SERVER = arg('server', process.env.AGENT_SERVER || 'http://localhost:4100');
const VERSION = arg('version', '1.0.0');
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) throw new Error('--version must look like 1.2.3');

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const goEnv = {
  ...process.env,
  PATH: `${path.join(toolchain, 'go/bin')}:${process.env.PATH}`,
  GOPATH: path.join(toolchain, 'gopath'),
  GOTOOLCHAIN: 'local',
  GOFLAGS: '-mod=mod',
};

// ---- 0. tools
const goBin = path.join(toolchain, 'go/bin/go');
if (!fs.existsSync(goBin)) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const os = process.platform === 'darwin' ? 'darwin' : 'linux';
  console.log(`Fetching Go 1.20.14 (${os}-${arch}), the last Go that supports Windows 7…`);
  fs.mkdirSync(toolchain, { recursive: true });
  run('sh', ['-c', `curl -sSL https://go.dev/dl/go1.20.14.${os}-${arch}.tar.gz | tar xz -C "${toolchain}"`]);
}
const rsrc = path.join(toolchain, 'gopath/bin/rsrc');
if (!fs.existsSync(rsrc)) run(goBin, ['install', 'github.com/akavel/rsrc@v0.10.2'], { env: goEnv });
const sumatra = path.join(toolchain, 'sumatra/SumatraPDF-3.4.6-32.exe');
if (!fs.existsSync(sumatra)) {
  console.log('Fetching SumatraPDF 3.4.6 (32-bit, runs on Windows 7+)…');
  fs.mkdirSync(path.dirname(sumatra), { recursive: true });
  run('sh', ['-c', `cd "${path.dirname(sumatra)}" && curl -sSL -o s.zip https://www.sumatrapdfreader.org/dl/rel/3.4.6/SumatraPDF-3.4.6.zip && unzip -o -q s.zip && rm s.zip`]);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

// ---- 1. icon: PNG-compressed .ico (supported since Windows Vista)
const require = createRequire(path.join(root, 'apps/api/package.json'));
const sharp = require('sharp');
const markSvg = (size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0b1220"/>
  <g transform="translate(3.2 3.2) scale(0.8)" style="isolation:isolate">
    <circle cx="12" cy="12.5" r="8.5" fill="#00a3e0"/>
    <circle cx="20" cy="12.5" r="8.5" fill="#e5007d" style="mix-blend-mode:multiply"/>
    <circle cx="16" cy="19.5" r="8.5" fill="#ffd200" style="mix-blend-mode:multiply"/>
  </g></svg>`);
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map((s) => sharp(markSvg(s)).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(s >= 256 ? 0 : s, e);
  header.writeUInt8(s >= 256 ? 0 : s, e + 1);
  header.writeUInt16LE(1, e + 4); // planes
  header.writeUInt16LE(32, e + 6); // bpp
  header.writeUInt32LE(pngs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
const ico = path.join(stage, 'agent.ico');
fs.writeFileSync(ico, Buffer.concat([header, ...pngs]));
fs.writeFileSync(path.join(out, 'agent.png'), pngs[sizes.indexOf(256)]);

// ---- 2. resources (icon + manifest) linked into the exe
const syso = path.join(agentDir, 'rsrc_windows_386.syso');
run(rsrc, ['-arch', '386', '-ico', ico, '-manifest', path.join(here, 'agent.manifest'), '-o', syso]);

// ---- 3. the agent
try {
  run(goBin, ['test', './...'], { cwd: agentDir, env: goEnv });
  run(
    goBin,
    ['build', '-trimpath', '-ldflags', `-H windowsgui -s -w -X main.version=${VERSION} -X main.defaultServer=${SERVER}`, '-o', path.join(stage, 'QuickPrintAgent.exe'), '.'],
    { cwd: agentDir, env: { ...goEnv, GOOS: 'windows', GOARCH: '386', CGO_ENABLED: '0' } },
  );
} finally {
  fs.rmSync(syso, { force: true });
}
fs.copyFileSync(sumatra, path.join(stage, 'SumatraPDF.exe'));

// ---- 4. installer
const setup = path.join(out, 'QuickPrintAgent-Setup.exe');
const nsi = path.join(out, 'installer.nsi');
fs.writeFileSync(nsi, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fs.readFileSync(path.join(here, 'installer.nsi'))])); // makensis wants a UTF-8 BOM
run('makensis', ['-WX', '-V2', `-DVERSION=${VERSION}`, `-DSERVER=${SERVER}`, `-DSRC=${stage}`, `-DOUTFILE=${setup}`, nsi], {
  env: { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' },
});

// ---- 5. publish for the dashboard download button
const pub = path.join(root, 'apps/web/public/downloads');
fs.mkdirSync(pub, { recursive: true });
fs.copyFileSync(setup, path.join(pub, 'QuickPrintAgent-Setup.exe'));

const mb = (f) => (fs.statSync(f).size / 1024 / 1024).toFixed(1) + ' MB';
console.log(`\nQuickPrint Agent ${VERSION} for ${SERVER}`);
console.log(`  agent      ${path.join(stage, 'QuickPrintAgent.exe')} (${mb(path.join(stage, 'QuickPrintAgent.exe'))})`);
console.log(`  installer  ${setup} (${mb(setup)})`);
console.log(`  published  apps/web/public/downloads/QuickPrintAgent-Setup.exe`);
