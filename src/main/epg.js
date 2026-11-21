'use strict';

// Minimal XMLTV / EPG parser (tolerant, no external deps).

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function stripTags(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function parseXmltvTime(value) {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
  if (!m) {
    const d = Date.parse(value);
    return Number.isFinite(d) ? d : null;
  }
  const [, y, mo, d, h, mi, se, tz] = m;
  let ts = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se || 0));
  if (tz) {
    const sign = tz[0] === '-' ? -1 : 1;
    const hours = Number(tz.slice(1, 3));
    const mins = Number(tz.slice(3, 5));
    ts -= sign * (hours * 60 + mins) * 60000;
  }
  return ts;
}

function parseEpg(xml) {
  const programmes = [];
  const re = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const body = m[2];
    const attr = (name) => {
      const mm = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'));
      return mm ? decodeEntities(mm[1]) : '';
    };
    const start = parseXmltvTime(attr('start'));
    const stop = parseXmltvTime(attr('stop'));
    const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const descMatch = body.match(/<desc[^>]*>([\s\S]*?)<\/desc>/i);
    const catMatch = body.match(/<category[^>]*>([\s\S]*?)<\/category>/i);
    programmes.push({
      channel: attr('channel'),
      start,
      stop,
      title: titleMatch ? stripTags(titleMatch[1]) : '',
      desc: descMatch ? stripTags(descMatch[1]) : '',
      category: catMatch ? stripTags(catMatch[1]) : ''
    });
    if (programmes.length >= 200000) break;
  }
  return programmes;
}


module.exports = { parseEpg, parseXmltvTime };
