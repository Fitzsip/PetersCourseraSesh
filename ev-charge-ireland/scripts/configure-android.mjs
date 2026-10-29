// Adjusts the generated Android project: location permissions, version
// number and app icon. Usage: node scripts/configure-android.mjs <buildNumber>

import { cpSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';

const build = Number(process.argv[2]) || 1;
const app = 'android/app';

const manifestPath = `${app}/src/main/AndroidManifest.xml`;
let manifest = readFileSync(manifestPath, 'utf8');
const perms = ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION']
  .filter((p) => !manifest.includes(`android.permission.${p}`))
  .map((p) => `    <uses-permission android:name="android.permission.${p}" />`)
  .join('\n');
if (perms) manifest = manifest.replace('</manifest>', `${perms}\n</manifest>`);
writeFileSync(manifestPath, manifest);

const gradlePath = `${app}/build.gradle`;
let gradle = readFileSync(gradlePath, 'utf8');
gradle = gradle
  .replace(/versionCode \d+/, `versionCode ${build}`)
  .replace(/versionName "[^"]*"/, `versionName "0.3.${build}"`);
writeFileSync(gradlePath, gradle);

// Plain PNG icons; drop the adaptive-icon XML so Android uses them.
const res = `${app}/src/main/res`;
rmSync(`${res}/mipmap-anydpi-v26`, { recursive: true, force: true });
for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
  const src = `android-res/mipmap-${d}/ic_launcher.png`;
  if (!existsSync(src)) continue;
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'])
    cpSync(src, `${res}/mipmap-${d}/${name}`);
}
console.log(`Android project configured (build ${build})`);
