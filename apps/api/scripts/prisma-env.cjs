const { spawnSync } = require('child_process');
const path = require('path');

const dotenvPath = path.resolve(__dirname, '../../../.env');
require('dotenv').config({ path: dotenvPath });

const prismaBin = require.resolve('prisma/build/index.js');
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [prismaBin, ...args], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);

