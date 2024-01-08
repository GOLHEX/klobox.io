const fs = require('fs');
const path = require('path');

const manifestPath = path.join(__dirname, '..', 'build', 'asset-manifest.json');
const swTemplatePath = path.join(__dirname, '..', 'src', 'service-worker-template.js');
const swPath = path.join(__dirname, '..', 'build', 'service-worker.js');

const manifest = require(manifestPath);
const urlsToCache = [
  '/',
  '/index.html',
  manifest.files['main.css'],
  manifest.files['main.js']
];

let swTemplate = fs.readFileSync(swTemplatePath, 'utf8');
swTemplate = swTemplate.replace('/* urlsToCache */', JSON.stringify(urlsToCache, null, 2));

fs.writeFileSync(swPath, swTemplate);
