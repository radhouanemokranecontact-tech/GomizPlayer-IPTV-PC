'use strict';
// Extracted pure helpers (refactor sandbox).

function sleep(ms) { return new Promise((r) => setTimeout(r, Math.max(0, ms || 0))); }

function sanitizeFfmpegHeaderValue(value) {
  return String(value == null ? '' : value).replace(/[]+/g, ' ').trim();
}

function isPathInsideDir(targetPath, dirPath) {
  try {
    const target = path.resolve(targetPath);
    const dir = path.resolve(dirPath);
    return target === dir || target.startsWith(dir + path.sep);
  } catch (_) { return false; }
}

function isPrivateIPv4(parts) {
  if (!Array.isArray(parts) || parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a,b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

function extractIPv4FromMappedIPv6(h) {
  // dotted form: ::ffff:127.0.0.1
  let m = h.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (m) return m[1].split('.').map((n) => Number(n));
  // hex form: ::ffff:7f00:1
  m = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (m) {
    const hi = parseInt(m[1], 16), lo = parseInt(m[2], 16);
    return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255];
  }
  return null;
}

function isPrivateOrLocalHostname(hostname) {
  let h = String(hostname || '').toLowerCase().trim();
  if (h.endsWith('.')) h = h.slice(0, -1); // strip trailing dot
  h = h.replace(/^\[|\]$/g, '');
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;

  const ipType = net.isIP(h);
  if (ipType === 4) {
    const parts = h.split('.').map((n) => Number(n));
    return isPrivateIPv4(parts);
  }
  if (ipType === 6) {
    if (h === '::' || h === '::1' || h === '0:0:0:0:0:0:0:0' || h === '0:0:0:0:0:0:0:1') return true;
    const mapped = extractIPv4FromMappedIPv6(h);
    if (mapped) return isPrivateIPv4(mapped);
    // fc00::/7 (fc00..fdff)
    const first = (h.split(':')[0] || '0');
    const f = parseInt(first || '0', 16);
    if ((f & 0xfe00) === 0xfc00) return true; // works for fc00/fd00 first hextet forms like fc00, fd12
    if (/^(fc|fd)[0-9a-f]{2}/i.test(h.replace(/:/g,'').padEnd(4,'0'))) return true;
    // fe80::/10
    if (/^fe[89ab][0-9a-f]/i.test(h.replace(/:/g,'').padEnd(4,'0')) || /^fe80:/i.test(h)) return true;
    // generic checks by prefix string for common forms
    if (/^f[cd]/i.test(h)) return true; // fc00::/7
    if (/^fe[89ab]/i.test(h)) return true; // fe80::/10
    return false;
  }
  // Not a literal IP (domain) - treat localhost-like names as local
  return false;
}

async function assertSafeUrl(rawUrl, opts = {}) {
  const u = new URL(String(rawUrl || ''));
  const proto = String(u.protocol || '').toLowerCase();
  const allowRecording = !!opts.allowRecordingProtocols;
  const allowed = allowRecording ? ['http:', 'https:', 'rtmp:', 'rtmps:', 'rtsp:', 'rtsps:', 'udp:'] : ['http:', 'https:'];
  if (!allowed.includes(proto)) throw new Error('URL protocol not allowed');
  if (opts.blockLocalPrivate) {
    // normalize trailing dot in hostname for checks
    let host = String(u.hostname || '').toLowerCase();
    if (host.endsWith('.')) host = host.slice(0, -1);
    if (host === 'metadata.google.internal' || host === 'metadata' || host.startsWith('metadata.')) {
      throw new Error('Local/private URL not allowed');
    }
    if (isPrivateOrLocalHostname(host)) throw new Error('Local/private URL not allowed');
    // DNS rebinding / resolved address check
    if (net.isIP(host) === 0) {
      const addrs = await dns.lookup(host, { all: true, verbatim: true });
      if (!Array.isArray(addrs) || addrs.length === 0) throw new Error('Local/private URL not allowed');
      for (const a of addrs) {
        const addr = a && a.address ? String(a.address) : '';
        if (!addr || isPrivateOrLocalHostname(addr)) throw new Error('Local/private URL not allowed');
      }
    }
  }
  return u;
}

function safeName(value) {
  let s = String(value || 'recording');
  s = s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
  s = s.replace(/\.\.+/g, '_');
  s = s.replace(/[\\\/]+/g, '_').trim();
  if (!s) s = 'recording';
  return s.slice(0, 60);
}

module.exports = { sleep, sanitizeFfmpegHeaderValue, isPathInsideDir, isPrivateIPv4, extractIPv4FromMappedIPv6, isPrivateOrLocalHostname, assertSafeUrl, safeName };
