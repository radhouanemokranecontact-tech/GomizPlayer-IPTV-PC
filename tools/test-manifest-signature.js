const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { verify } = require(path.join(__dirname, '..', 'src', 'main', 'manifest-verify.js'));
const yaml = require('js-yaml');

function ok(n) { console.log('PASS ' + n); }
function fail(n) { console.log('FAIL ' + n); process.exitCode = 1; }

const dir = fs.mkdtempSync(require('os').tmpdir() + '/gomiz-sign-');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

// Build a valid manifest and sign it with the exact same canonicalization as the tool.
const info = { version: '9.9.9', files: [{ url: 'Setup.exe', sha512: 'abc', size: 123 }] };
function canon(i) {
  const p = ['version=' + JSON.stringify(i.version), 'files=' + i.files.length];
  for (const f of i.files) p.push('file{url=' + JSON.stringify(f.url) + ',sha512=' + JSON.stringify(f.sha512) + ',size=' + JSON.stringify(f.size) + '}');
  return p.join('\n');
}
const sig = crypto.sign(null, Buffer.from(canon(info)), privateKey).toString('base64');
info.signature = sig;

if (verify(yaml.dump(info), publicKey).ok) ok('verify accepts a correctly signed manifest'); else fail('valid signature');
const tampered = JSON.parse(JSON.stringify(info)); tampered.version = '0.0.1';
if (!verify(yaml.dump(tampered), publicKey).ok) ok('verify rejects a tampered manifest'); else fail('tamper detection');
const unsigned = { version: '9.9.9', files: [{ url: 'x', sha512: 'y', size: 1 }] };
if (!verify(yaml.dump(unsigned), publicKey).ok) ok('verify rejects an unsigned manifest'); else fail('unsigned');
