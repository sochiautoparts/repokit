'use strict';

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const chalk = require('chalk');

const LICENSES_URL = 'https://raw.githubusercontent.com/sochiautoparts/stars-pay-bot/main/data/licenses.json';
const API_URL = process.env.STARSPAY_API_URL || '';
const API_KEY = process.env.STARSPAY_API_KEY || '';
const LICENSE_FILE = path.join(require('os').homedir(), '.repokit-license');
const LICENSE_PREFIX = 'SP-RPK-';

/**
 * Validate STARSPAY_API_URL to prevent SSRF
 */
function _validate_api_url(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    // Allow known StarsPay domains
    const allowedHosts = ['starspay-api.onrender.com', 'api.starspay.io', 'starspay.io'];
    if (allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) return true;
    // At minimum, require https
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Compute SHA-256 hash of the license key (first 16 hex chars)
 */
function _compute_key_hash(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * Verify license key against public licenses.json (primary method)
 */
async function _verify_via_json(key) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(LICENSES_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'repokit/1.0' }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { pro: false, error: 'Could not fetch licenses.json' };
    }

    const licenses = await response.json();
    if (!Array.isArray(licenses)) {
      return { pro: false, error: 'Invalid licenses format' };
    }

    const keyHash = _compute_key_hash(key);

    for (const entry of licenses) {
      if (entry.key_hash === keyHash) {
        // Check if active
        if (entry.active === false) {
          return { pro: false, error: 'License is deactivated' };
        }
        // Check expiration (0 = lifetime)
        if (entry.expires_at && entry.expires_at !== 0) {
          const expiresAt = typeof entry.expires_at === 'number'
            ? new Date(entry.expires_at * 1000)
            : new Date(entry.expires_at);
          if (expiresAt < new Date()) {
            return { pro: false, error: 'License expired' };
          }
        }
        return {
          pro: true,
          plan: entry.plan || 'pro',
          expires_at: entry.expires_at || null,
          email: entry.email || null,
          source: 'json'
        };
      }
    }

    return { pro: false, error: 'License key not found' };
  } catch (error) {
    return { pro: false, error: 'Could not verify license (network error)' };
  }
}

/**
 * Verify license key via REST API (fallback method)
 */
async function _verify_via_api(key) {
  if (!_validate_api_url(API_URL)) {
    return { pro: false, error: 'API URL not configured or invalid' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {})
      },
      body: JSON.stringify({ key }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { pro: false, error: `API returned ${response.status}` };
    }

    const data = await response.json();

    if (data.valid) {
      saveLicenseCache(key, data);
      return {
        pro: true,
        plan: data.plan || 'pro',
        expires_at: data.expires_at || null,
        email: data.email || null,
        source: 'api'
      };
    }

    return { pro: false, error: data.message || 'Invalid license key' };
  } catch (error) {
    return { pro: false, error: 'API verification failed' };
  }
}

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
 * Verify license key — tries JSON first, then API fallback
 */
async function verifyLicense(key) {
  if (!key || !isValidKeyFormat(key)) {
    return { pro: false, error: 'Invalid key format' };
  }

  // Primary: verify via public licenses.json
  const jsonResult = await _verify_via_json(key);
  if (jsonResult.pro) {
    // Cache the result
    saveLicenseCache(key, jsonResult);
    return jsonResult;
  }

  // If JSON says "not found" (not a network error), don't try API
  if (jsonResult.error && !jsonResult.error.includes('network') && !jsonResult.error.includes('fetch')) {
    return jsonResult;
  }

  // Fallback: try API if configured
  if (API_URL) {
    const apiResult = await _verify_via_api(key);
    if (apiResult.pro) return apiResult;
  }

  // Last resort: try local cache
  return verifyLocalCache(key);
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
        // Cache is valid for 7 days max
        if (data.verified_at) {
          const verifiedAt = new Date(data.verified_at);
          const cacheAge = Date.now() - verifiedAt.getTime();
          const sevenDays = 7 * 24 * 60 * 60 * 1000;
          if (cacheAge > sevenDays) {
            return { pro: false, error: 'Cache expired, re-verification needed' };
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
      valid: data.valid !== undefined ? data.valid : data.pro,
      plan: data.plan || 'pro',
      expires_at: data.expires_at || null,
      email: data.email || null,
      verified_at: new Date().toISOString()
    }, { spaces: 2 });
    // Restrict file permissions
    try {
      fs.chmodSync(LICENSE_FILE, 0o600);
    } catch (e) {
      // chmod not available on all platforms
    }
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
    if (result.source) {
      console.log(chalk.gray(`   Verified via: ${result.source}`));
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
    // Try to verify online first
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
    if (result.source) {
      console.log(chalk.gray(`   Verified via: ${result.source}`));
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
