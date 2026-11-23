/*
 * Signs latest.yml with an Ed25519 key so the manifest cannot be tampered with
 * in transit or on the release host. Companion verifier is embedded in the app.
 *
 * Usage:
 *   node scripts/sign-update-manifest.js <latest.yml> <private-key.pem>
 *
 * The canonical payload covers every integrity-critical field: version,
 * files[].url / sha512 / size / blockMapUrl, stagingPercentage, minimumSystemVersion.
 * Cosmetic fields (releaseDate, releaseNotes) are intentionally excluded.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const [file, keyFile] = process.argv.slice(2);
if (!file || !keyFile) {
  console.error('usage: node scripts/sign-update-manifest.js <latest.yml> <private-key.pem>');
  process.exit(1);
}

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

function verifySignedPayload(info, signature, publicKey) {
  return crypto.verify(null, Buffer.from(canonicalize(info), 'utf8'), publicKey, Buffer.from(signature, 'base64'));
}

const raw = fs.readFileSync(file, 'utf8');
const info = yaml.load(raw);
if (!info || !info.version || !Array.isArray(info.files) || info.files.length === 0) {
  console.error('invalid manifest'); process.exit(1);
}

const privateKey = crypto.createPrivateKey(fs.readFileSync(keyFile));
delete info.signature;
delete info.signatures;
const payload = Buffer.from(canonicalize(info), 'utf8');
const signature = crypto.sign(null, payload, privateKey).toString('base64');

// self-check
const pub = crypto.createPublicKey(privateKey);
if (!verifySignedPayload(info, signature, pub)) {
  console.error('self-check failed'); process.exit(1);
}

info.signature = signature;
info.signatures = [{ keyId: crypto.createHash('sha256').update(pub.export({ format: 'der', type: 'spki' })).digest('hex'), signature }];
fs.writeFileSync(file, yaml.dump(info, { lineWidth: -1, noRefs: true }), 'utf8');
console.log('SIGNED latest.yml | keyId=' + info.signatures[0].keyId);
