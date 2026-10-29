// Copies the web app into www/ for the Android build, swapping the CDN copies
// of Leaflet for local ones so the app shell works without them.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const OUT = 'www';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/vendor`, { recursive: true });

for (const f of ['styles.css', 'config.js', 'js']) cpSync(f, `${OUT}/${f}`, { recursive: true });

const vendor = {
  'leaflet/dist/leaflet.js': 'leaflet.js',
  'leaflet/dist/leaflet.css': 'leaflet.css',
  'leaflet/dist/images': 'images',
  'leaflet.markercluster/dist/leaflet.markercluster.js': 'leaflet.markercluster.js',
  'leaflet.markercluster/dist/MarkerCluster.css': 'MarkerCluster.css',
  'leaflet.markercluster/dist/MarkerCluster.Default.css': 'MarkerCluster.Default.css',
};
for (const [from, to] of Object.entries(vendor)) cpSync(`node_modules/${from}`, `${OUT}/vendor/${to}`, { recursive: true });

const cdn = {
  'leaflet/1.9.4/leaflet.min.css': 'leaflet.css',
  'leaflet/1.9.4/leaflet.min.js': 'leaflet.js',
  'leaflet.markercluster/1.5.3/MarkerCluster.min.css': 'MarkerCluster.css',
  'leaflet.markercluster/1.5.3/MarkerCluster.Default.min.css': 'MarkerCluster.Default.css',
  'leaflet.markercluster/1.5.3/leaflet.markercluster.min.js': 'leaflet.markercluster.js',
};
let html = readFileSync('index.html', 'utf8');
for (const [path, local] of Object.entries(cdn)) {
  const url = `https://cdnjs.cloudflare.com/ajax/libs/${path}`;
  if (!html.includes(url)) throw new Error(`index.html no longer references ${url}`);
  html = html.replace(url, `vendor/${local}`);
}
writeFileSync(`${OUT}/index.html`, html);
console.log(`Built ${OUT}/`);
