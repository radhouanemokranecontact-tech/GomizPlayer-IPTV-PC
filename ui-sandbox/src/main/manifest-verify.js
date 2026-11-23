/*
 * Verifies the Ed25519 signature of an update manifest (latest.yml) against
 * the public key baked into this app. Runs before electron-updater downloads
 * any artifact. Companion to scripts/sign-update-manifest.js.
 */
const crypto = require('crypto');

const EMBEDDED_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAEj8hQFvwkVqk4v6xx2HFRppWx0Oho09Jtih05uMgSJc=
-----END PUBLIC KEY-----`;

function canonicalString(v) { return JSON.stringify(String(v)); }
function canonicalize(info) {
  const parts = [];
  parts.push('version=' + canonicalString(info.version));
  if (info.stagingPercentage !== undefined) parts.push('stagingPercentage=' + JSON.stringify(Number(info.stagingPercentage)));
  if (info.minimumSystemVersion !== undefined) parts.push('minimumSystemVersion=' + canonicalString(info.minimumSystemVersion));
  const files = Array.isArray(info.files) ? info.files : [];
  parts.push('files=' + files.length);
  for (const f of files) {
    const e = [];
    e.push('url=' + canonicalString(f.url));
    e.push('sha512=' + canonicalString(f.sha512));
    e.push('size=' + JSON.stringify(Number(f.size)));
    if (f.blockMapUrl !== undefined) e.push('blockMapUrl=' + canonicalString(f.blockMapUrl));
    parts.push('file{' + e.join(',') + '}');
  }
  return parts.join('\n');
}

function verify(manifestText, publicKeyPem) {
  let info;
  try {
    const yaml = require('js-yaml');
    info = yaml.load(manifestText);
  } catch (_) { return { ok: false, reason: 'parse-error' }; }
  if (!info || !info.version || !Array.isArray(info.files) || info.files.length === 0) {
    return { ok: false, reason: 'invalid-manifest' };
  }
  const sig = info.signature || (info.signatures && info.signatures[0] && info.signatures[0].signature);
  if (!sig) return { ok: false, reason: 'not-signed' };
  // strip signature fields before canonicalizing (same as the signer)
  delete info.signature;
  delete info.signatures;
  try {
    const key = publicKeyPem ? crypto.createPublicKey(publicKeyPem) : crypto.createPublicKey(EMBEDDED_PUBLIC_KEY);
    const valid = crypto.verify(null, Buffer.from(canonicalize(info), 'utf8'), key, Buffer.from(sig, 'base64'));
    return valid ? { ok: true } : { ok: false, reason: 'bad-signature' };
  } catch (_) { return { ok: false, reason: 'key-error' }; }
}

module.exports = { verify, canonicalize, EMBEDDED_PUBLIC_KEY };
