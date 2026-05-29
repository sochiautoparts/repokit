#!/usr/bin/env node
'use strict';

/**
 * RepoKit Lint — Basic code quality checks
 */

const fs = require('fs');
const path = require('path');

let issues = 0;

function checkFile(filePath, checks) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const relPath = path.relative(process.cwd(), filePath);
  
  for (const check of checks) {
    for (let i = 0; i < lines.length; i++) {
      if (check.pattern.test(lines[i])) {
        // Skip if line is a comment
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) continue;
        
        if (check.severity === 'error') {
          console.error(`❌ ${relPath}:${i + 1}: ${check.message}`);
          issues++;
        } else {
          console.warn(`⚠️  ${relPath}:${i + 1}: ${check.message}`);
        }
      }
    }
  }
}

console.log('\n🔍 RepoKit Lint\n');

const srcDir = path.join(__dirname, '..', 'src');

// Security checks
const securityChecks = [
  { pattern: /sk_starspay_|sk_live_|sk_test_/g, message: 'Hardcoded API key detected', severity: 'error' },
  { pattern: /password\s*[:=]\s*['"](?:postgres|root|admin|password)['"]/gi, message: 'Hardcoded password', severity: 'error' },
  { pattern: /nodeIntegration:\s*true/g, message: 'nodeIntegration: true is a security risk', severity: 'error' },
  { pattern: /console\.log\(/g, message: 'console.log in production code', severity: 'warning' },
];

// Check all JS files in src/
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.js'));
for (const file of files) {
  checkFile(path.join(srcDir, file), securityChecks);
}

// Check for required files
const requiredFiles = [
  'package.json',
  'action.yml', 
  'LICENSE',
  'README.md',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(__dirname, '..', file))) {
    console.error(`❌ Missing required file: ${file}`);
    issues++;
  }
}

// Check package.json
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
if (!pkg.name || !pkg.version || !pkg.description) {
  console.error('❌ package.json missing required fields (name, version, description)');
  issues++;
}

if (!pkg.repository || !pkg.repository.url) {
  console.warn('⚠️  package.json missing repository URL');
}

console.log('\n' + '='.repeat(40));
if (issues === 0) {
  console.log('✅ Lint passed — no critical issues found\n');
} else {
  console.log(`❌ Lint failed — ${issues} critical issue(s) found\n`);
  process.exit(1);
}
