// Generate the local-only ad configuration required by the WeChat project.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const platform = path.resolve(__dirname, '..');
const target = path.join(platform, 'game', 'ad-units.js');

if (!fs.existsSync(target)) {
  const local = path.join(platform, 'materials', '密钥', 'ad-units.js');
  if (fs.existsSync(local)) fs.copyFileSync(local, target, fs.constants.COPYFILE_EXCL);
  else fs.writeFileSync(target, "'use strict';\nmodule.exports = { rewarded: {}, interstitial: '' };\n", { flag: 'wx', mode: 0o600 });
  fs.chmodSync(target, 0o600);
}
