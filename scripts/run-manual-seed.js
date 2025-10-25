#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const sqlFile = path.join(projectRoot, 'backend', 'prisma', 'manual_seed.sql');

if (!fs.existsSync(sqlFile)) {
  console.error('Manual seed SQL not found at', sqlFile);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    console.error(`Failed to execute ${command}:`, result.error.message);
    process.exit(result.status ?? 1);
  }
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

run('docker', ['cp', sqlFile, 'ontrack-postgres:/tmp/manual_seed.sql']);
run('docker', ['exec', '-i', 'ontrack-postgres', 'psql', '-U', 'postgres', '-d', 'ontrack', '-f', '/tmp/manual_seed.sql']);

console.log('Manual seed applied successfully.');
