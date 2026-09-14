#!/usr/bin/env node

'use strict';

const path = require('path');

try {
  const cli = require(path.join(__dirname, '..', 'src', 'cli'));
  cli.run();
} catch (error) {
  console.error('Failed to start RepoKit:', error.message);
  process.exit(1);
}
