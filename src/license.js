'use strict';

const fs = require('fs-extra');
const path = require('path');
const fetch = require('node-fetch');
const chalk = require('chalk');

const API_URL = 'https://starspay-api.onrender.com/api/v1/verify';
const API_KEY = 'sk_starspay_repokit_xK9mP2vL4nQ7rW';
const LICENSE_FILE = path.join(require('os').homedir(), '.repokit-license');
const LICENSE_PREFIX = 'SP-RPK-';

/**
 * Get license key from environment variable or file
 */
function getLicenseKey() {
  // Check environment variable first
  if (process.env.STARSPAY_LICENSE_KEY) {
    const key = process.env.STARSPAY_LICENSE_KEY.trim();
    if (isValidKeyFormat(key)) {
      return key;
    }
  }

  // Check license file
  if (fs.existsSync(LICENSE_FILE)) {
    try {
      const data = fs.readJsonSync(LICENSE_FILE);
      if (data && data.key && isValidKeyFormat(data.key)) {
        // Check if license has expired
        if (data.expires_at) {
          const expiresAt = new Date(data.expires_at);
          if (expiresAt < new Date()) {
            return null;
          }
        }
        return data.key;
      }
    } catch (e) {
      // Invalid file, ignore
    }
  }

  return null;
}

/**
 * Validate key format: SP-RPK-XXXX-XXXX
 */
function isValidKeyFormat(key) {
  return /^SP-RPK-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(key);
}

/**
 * Verify license key against StarsPay API
 */
async function verifyLicense(key) {
  if (!key || !isValidKeyFormat(key)) {
    return { pro: false, error: 'Invalid key format' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({ key }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // API error, try local cache
      return verifyLocalCache(key);
    }

    const data = await response.json();

    if (data.valid) {
      // Cache the license locally
      saveLicenseCache(key, data);

      return {
        pro: true,
        plan: data.plan || 'pro',
        expires_at: data.expires_at || null,
        email: data.email || null
      };
    }

    return { pro: false, error: data.message || 'Invalid license key' };
  } catch (error) {
    // Network error, try local cache
    return verifyLocalCache(key);
  }
}

/**
 * Verify license from local cache (offline fallback)
 */
function verifyLocalCache(key) {
  if (fs.existsSync(LICENSE_FILE)) {
    try {
      const data = fs.readJsonSync(LICENSE_FILE);
      if (data && data.key === key && data.valid) {
        // Check expiration
        if (data.expires_at) {
          const expiresAt = new Date(data.expires_at);
          if (expiresAt < new Date()) {
            return { pro: false, error: 'License expired' };
          }
        }
        return {
          pro: true,
          plan: data.plan || 'pro',
          expires_at: data.expires_at || null,
          email: data.email || null,
          cached: true
        };
      }
    } catch (e) {
      // Invalid cache file
    }
  }

  return { pro: false, error: 'Could not verify license (offline)' };
}

/**
 * Save license data to local cache
 */
function saveLicenseCache(key, data) {
  try {
    fs.writeJsonSync(LICENSE_FILE, {
      key,
      valid: data.valid,
      plan: data.plan || 'pro',
      expires_at: data.expires_at || null,
      email: data.email || null,
      verified_at: new Date().toISOString()
    }, { spaces: 2 });
  } catch (e) {
    // Can't write cache, ignore
  }
}

/**
 * Activate a license key (save it locally)
 */
async function activateLicense(key) {
  if (!key) {
    console.log(chalk.red('❌ No license key provided'));
    console.log(chalk.gray('Usage: repokit activate SP-RPK-XXXX-XXXX'));
    return false;
  }

  if (!isValidKeyFormat(key)) {
    console.log(chalk.red('❌ Invalid key format'));
    console.log(chalk.gray('Key must be in format: SP-RPK-XXXX-XXXX'));
    return false;
  }

  const ora = require('ora');
  const spinner = ora('Verifying license key...').start();

  const result = await verifyLicense(key);

  if (result.pro) {
    spinner.succeed(chalk.green('✅ License activated successfully!'));
    console.log(chalk.cyan(`   Plan: ${result.plan}`));
    if (result.expires_at) {
      console.log(chalk.cyan(`   Expires: ${new Date(result.expires_at).toLocaleDateString()}`));
    }
    if (result.email) {
      console.log(chalk.cyan(`   Email: ${result.email}`));
    }
    console.log();
    console.log(chalk.gray('   You now have access to all Pro templates!'));
    return true;
  } else {
    spinner.fail(chalk.red('❌ License verification failed'));
    if (result.error) {
      console.log(chalk.gray(`   ${result.error}`));
    }
    return false;
  }
}

/**
 * Deactivate / remove license
 */
function deactivateLicense() {
  if (fs.existsSync(LICENSE_FILE)) {
    fs.removeSync(LICENSE_FILE);
    console.log(chalk.green('✅ License deactivated'));
  } else {
    console.log(chalk.yellow('⚠️  No license found'));
  }
}

/**
 * Check if user has Pro access
 */
async function checkProAccess() {
  const key = getLicenseKey();

  if (!key) {
    return { pro: false };
  }

  try {
    // Try to verify online first, with short timeout
    const result = await verifyLicense(key);
    return result;
  } catch (e) {
    // If network fails, just check local cache
    return verifyLocalCache(key);
  }
}

/**
 * Show license status
 */
async function showStatus() {
  const key = getLicenseKey();

  if (!key) {
    console.log(chalk.yellow('⚠️  No active license'));
    console.log();
    console.log(chalk.gray('To activate a Pro license:'));
    console.log(chalk.cyan('  repokit activate SP-RPK-XXXX-XXXX'));
    console.log();
    console.log(chalk.gray('Get a license at: https://t.me/allstarspay_bot?start=buy_repokit_month'));
    return;
  }

  const result = await verifyLicense(key);

  if (result.pro) {
    console.log(chalk.green('✅ Pro License Active'));
    console.log(chalk.cyan(`   Key: ${key.substring(0, 7)}****`));
    console.log(chalk.cyan(`   Plan: ${result.plan}`));
    if (result.expires_at) {
      const expires = new Date(result.expires_at);
      const days = Math.ceil((expires - new Date()) / (1000 * 60 * 60 * 24));
      console.log(chalk.cyan(`   Expires: ${expires.toLocaleDateString()} (${days} days)`));
    }
    if (result.cached) {
      console.log(chalk.yellow('   ⚠️  Verified from cache (offline)'));
    }
  } else {
    console.log(chalk.red('❌ License Invalid or Expired'));
    if (result.error) {
      console.log(chalk.gray(`   ${result.error}`));
    }
  }
}

module.exports = {
  getLicenseKey,
  isValidKeyFormat,
  verifyLicense,
  activateLicense,
  deactivateLicense,
  checkProAccess,
  showStatus
};
