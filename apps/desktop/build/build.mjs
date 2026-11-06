// Builds SeedhaPrint-Setup.exe, the one Windows app shops install, from macOS or Linux:
//
//   npm install --prefix apps/desktop --ignore-scripts
//   npm run app:build -- [--version 1.0.0] [--web https://seedhaprint.in] [--api https://api.seedhaprint.in]
//
//   1. icon from the brand mark
//   2. SeedhaPrintAgent.exe: Go 1.20, windows/386, no console window
//   3. Electron 22 for Windows (32-bit) with the app inside, renamed and given its icon
//   4. the installer via NSIS (makensis)
//
// All of it runs on Windows 7 to 11, 32 and 64-bit. Tools are fetched into .toolchain/.
// Needs: makensis (brew install makensis).

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.resolve(here, '..');
const root = path.resolve(desktop, '../..');
const agentDir = path.join(root, 'apps/agent');
const toolchain = path.join(root, '.toolchain');
const out = path.join(here, 'out');
const stage = path.join(out, 'stage');
const appDir = path.join(stage, 'app');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const VERSION = arg('version', '1.0.0');
const WEB = arg('web', 'https://seedhaprint.in');
const API = arg('api', 'https://api.seedhaprint.in');
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) throw new Error('--version must look like 1.2.3');

const ELECTRON = '22.3.27'; // the last Electron that runs on Windows 7
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const fetchTo = (url, dest) => {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  run('curl', ['-sSL', '--fail', '-o', dest, url]);
};
const goEnv = { ...process.env, PATH: `${path.join(toolchain, 'go/bin')}:${process.env.PATH}`, GOPATH: path.join(toolchain, 'gopath'), GOTOOLCHAIN: 'local', GOFLAGS: '-mod=mod' };

// ---- tools
const goBin = path.join(toolchain, 'go/bin/go');
if (!fs.existsSync(goBin)) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const os = process.platform === 'darwin' ? 'darwin' : 'linux';
  console.log('Fetching Go 1.20.14, the last Go that supports Windows 7…');
  fs.mkdirSync(toolchain, { recursive: true });
  run('sh', ['-c', `curl -sSL https://go.dev/dl/go1.20.14.${os}-${arch}.tar.gz | tar xz -C "${toolchain}"`]);
}
const rsrc = path.join(toolchain, 'gopath/bin/rsrc');
if (!fs.existsSync(rsrc)) run(goBin, ['install', 'github.com/akavel/rsrc@v0.10.2'], { env: goEnv });
const sumatra = path.join(toolchain, 'sumatra/SumatraPDF-3.4.6-32.exe');
if (!fs.existsSync(sumatra)) {
  console.log('Fetching SumatraPDF 3.4.6 (32-bit)…');
  fs.mkdirSync(path.dirname(sumatra), { recursive: true });
  run('sh', ['-c', `cd "${path.dirname(sumatra)}" && curl -sSL -o s.zip https://www.sumatrapdfreader.org/dl/rel/3.4.6/SumatraPDF-3.4.6.zip && unzip -o -q s.zip && rm s.zip`]);
}
const electronBase = `https://github.com/electron/electron/releases/download/v${ELECTRON}`;
const electronZip = path.join(toolchain, `electron-cache/electron-v${ELECTRON}-win32-ia32.zip`);
if (!fs.existsSync(electronZip)) {
  console.log(`Fetching Electron ${ELECTRON} for Windows…`);
  fetchTo(`${electronBase}/${path.basename(electronZip)}`, electronZip);
}
const shas = path.join(toolchain, 'electron-cache/SHASUMS256.txt');
if (!fs.existsSync(shas)) fetchTo(`${electronBase}/SHASUMS256.txt`, shas);
const want = fs.readFileSync(shas, 'utf8').split('\n').find((l) => l.endsWith(path.basename(electronZip)))?.split(' ')[0];
if (want !== crypto.createHash('sha256').update(fs.readFileSync(electronZip)).digest('hex')) throw new Error('Electron download failed its checksum');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

// ---- 1. icon: PNG-compressed .ico (supported since Windows Vista)
const sharp = createRequire(path.join(root, 'apps/api/package.json'))('sharp');
const markSvg = (size) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="#0b1220"/>
  <g transform="translate(2.24 2.24) scale(0.86)" style="isolation:isolate">
    <circle cx="11.6" cy="12" r="8.6" fill="#00a3e0"/>
    <circle cx="20.4" cy="12" r="8.6" fill="#e5007d" style="mix-blend-mode:multiply"/>
    <circle cx="16" cy="20" r="8.6" fill="#ffd200" style="mix-blend-mode:multiply"/>
  </g></svg>`);
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map((s) => sharp(markSvg(s), { density: 72 * Math.max(1, s / 32) }).resize(s, s).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(s >= 256 ? 0 : s, e);
  header.writeUInt8(s >= 256 ? 0 : s, e + 1);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
const ico = path.join(stage, 'app.ico');
fs.writeFileSync(ico, Buffer.concat([header, ...pngs]));
fs.writeFileSync(path.join(desktop, 'src/icon.png'), pngs[sizes.indexOf(256)]);

// ---- 2. the agent
const syso = path.join(agentDir, 'rsrc_windows_386.syso');
const agentOut = path.join(stage, 'agent');
fs.mkdirSync(agentOut);
run(rsrc, ['-arch', '386', '-ico', ico, '-manifest', path.join(here, 'agent.manifest'), '-o', syso]);
try {
  run(goBin, ['test', './...'], { cwd: agentDir, env: goEnv });
  run(goBin, ['build', '-trimpath', '-ldflags', `-H windowsgui -s -w -X main.version=${VERSION} -X main.defaultServer=${API}`, '-o', path.join(agentOut, 'SeedhaPrintAgent.exe'), '.'], {
    cwd: agentDir,
    env: { ...goEnv, GOOS: 'windows', GOARCH: '386', CGO_ENABLED: '0' },
  });
} finally {
  fs.rmSync(syso, { force: true });
}
fs.copyFileSync(sumatra, path.join(agentOut, 'SumatraPDF.exe'));

// ---- 3. the app: Electron with our files inside, no Wine needed
fs.mkdirSync(appDir);
run('unzip', ['-q', electronZip, '-d', appDir]);
fs.rmSync(path.join(appDir, 'resources/default_app.asar'), { force: true });
for (const f of fs.readdirSync(path.join(appDir, 'locales'))) if (f !== 'en-US.pak') fs.rmSync(path.join(appDir, 'locales', f));
const inner = path.join(appDir, 'resources/app');
fs.mkdirSync(inner, { recursive: true });
fs.cpSync(path.join(desktop, 'src'), path.join(inner, 'src'), { recursive: true });
fs.writeFileSync(path.join(inner, 'src/config.json'), JSON.stringify({ webUrl: WEB, apiUrl: API }));
const pkg = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(inner, 'package.json'), JSON.stringify({ name: pkg.name, productName: pkg.productName, version: VERSION, main: pkg.main }));
fs.cpSync(agentOut, path.join(appDir, 'resources/agent'), { recursive: true });

const requireDesktop = createRequire(path.join(desktop, 'package.json'));
const ResEdit = requireDesktop('resedit');
const exePath = path.join(appDir, 'SeedhaPrint.exe');
fs.renameSync(path.join(appDir, 'electron.exe'), exePath);
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const res = ResEdit.NtExecutableResource.from(exe);
const icons = ResEdit.Data.IconFile.from(fs.readFileSync(ico)).icons.map((i) => i.data);
for (const group of ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, group.id, group.lang, icons);
}
const info = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
const [major, minor, patch] = VERSION.split('.').map(Number);
info.setFileVersion(major, minor, patch, 0);
info.setProductVersion(major, minor, patch, 0);
for (const { lang, codepage } of info.getAllLanguagesForStringValues()) {
  info.setStringValues({ lang, codepage }, { ProductName: 'SeedhaPrint', FileDescription: 'SeedhaPrint', CompanyName: 'SeedhaPrint', OriginalFilename: 'SeedhaPrint.exe', InternalName: 'SeedhaPrint', LegalCopyright: 'SeedhaPrint', FileVersion: VERSION, ProductVersion: VERSION });
}
info.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));

// ---- 4. installer
const setup = path.join(out, 'SeedhaPrint-Setup.exe');
const nsi = path.join(out, 'installer.nsi');
fs.writeFileSync(nsi, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), fs.readFileSync(path.join(here, 'installer.nsi'))])); // makensis wants a UTF-8 BOM
run('makensis', ['-WX', '-V2', `-DVERSION=${VERSION}`, `-DSRC=${stage}`, `-DOUTFILE=${setup}`, nsi], { env: { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' } });

const pub = path.join(root, 'apps/web/public/downloads');
fs.mkdirSync(pub, { recursive: true });
fs.copyFileSync(setup, path.join(pub, 'SeedhaPrint-Setup.exe'));

console.log(`\nSeedhaPrint ${VERSION}: ${WEB} + ${API}`);
console.log(`  installer  ${setup} (${(fs.statSync(setup).size / 1024 / 1024).toFixed(1)} MB)`);
console.log('  It is too big for git, so copy it to the server: apps/web/public/downloads/SeedhaPrint-Setup.exe');
