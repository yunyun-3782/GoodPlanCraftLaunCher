/*
 * CaelLab BY-SA Code License
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / CaelLabGameTS

 * Source: https://github.com/yunyun-3782/GoodPlanCraftLauncher
 */

const fs = require('fs');
const path = require('path');

const dest = path.resolve('build/app');

if (fs.existsSync(dest)) {
  fs.rmSync(dest, { recursive: true, force: true });
}

fs.mkdirSync(path.join(dest, 'renderer'), { recursive: true });

const files = [
  'main.js',
  'preload.js',
  'gpcl-icon.ico',
  'package.json'
];

files.forEach(file => {
  const src = path.resolve(file);
  const target = path.join(dest, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, target);
  }
});

const rendererSrc = path.resolve('renderer');
const rendererDest = path.join(dest, 'renderer');
if (fs.existsSync(rendererSrc)) {
  fs.cpSync(rendererSrc, rendererDest, { recursive: true });
}

const iconSrc = path.resolve('static', 'icon');
const iconDest = path.join(dest, 'static', 'icon');
if (fs.existsSync(iconSrc)) {
  fs.mkdirSync(path.join(dest, 'static'), { recursive: true });
  fs.cpSync(iconSrc, iconDest, { recursive: true });
}

console.log('✅ copy-files 完成');