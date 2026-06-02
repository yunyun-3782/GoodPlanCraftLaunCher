/*
 * CaelLab BY-SA Code License
 * Copyright (c) 2026 Yunyun(云云) By 虚舟实验室(CaelLab) / CaelLabGameTS

 * Source: https://github.com/yunyun-3782/GoodPlanCraftLauncher
 */

const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');

const output = {
  name: pkg.name,
  version: pkg.version,
  main: pkg.main,
  type: pkg.type
};

const destPath = path.resolve('build/app/package.json');
fs.writeFileSync(destPath, JSON.stringify(output, null, 2));

console.log('✅ copy-static 完成');