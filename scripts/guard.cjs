// Static launch-constraint checks; this is a development tool, not a browser dependency.
const fs = require('node:fs');
const path = require('node:path');
const file = process.argv[2];
const source = fs.readFileSync(file, 'utf8');
let violations = 0;

function report(message, index) {
  const line = source.slice(0, index).split('\n').length;
  console.error(`VIOLATION: ${message}\n  ${path.basename(file)}:${line}`);
  violations++;
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? match[1] ?? match[2] ?? match[3] : null;
}

const embedded = (url) => /^(?:data:|blob:|#)/i.test(url.trim());
// Preserve positions while ignoring comments and quoted text in executable code.
function codeOnly(text) {
  const out = text.split('');
  let pos = 0;
  function erase(from, to) {
    for (let i = from; i < to; i++) if (out[i] !== '\r' && out[i] !== '\n') out[i] = ' ';
  }
  function quoted(quote) {
    erase(pos, ++pos);
    while (pos < text.length) {
      const start = pos;
      if (text[pos] === '\\') {
        pos = Math.min(text.length, pos + 2);
      } else if (text[pos] === quote) {
        erase(pos, ++pos);
        return;
      } else if (quote === '`' && text.startsWith('${', pos)) {
        erase(pos, pos + 2);
        pos += 2;
        scan(true);
        continue;
      } else pos++;
      erase(start, pos);
    }
  }
  function scan(inExpression) {
    let depth = 0;
    let canStartRegex = true;
    while (pos < text.length) {
      const start = pos;
      const ch = text[pos];
      if (/\s/.test(ch)) { pos++; continue; }
      if (text.startsWith('//', pos)) {
        while (pos < text.length && text[pos] !== '\n') pos++;
        erase(start, pos);
      } else if (text.startsWith('/*', pos)) {
        const end = text.indexOf('*/', pos + 2);
        pos = end < 0 ? text.length : end + 2;
        erase(start, pos);
      } else if (ch === '"' || ch === "'" || ch === '`') {
        quoted(ch);
        canStartRegex = false;
      } else if (text.startsWith('++', pos) || text.startsWith('--', pos)) {
        // Prefix keeps the operand position; postfix keeps the completed expression.
        pos += 2;
      } else if (ch === '/' && canStartRegex) {
        pos++;
        let inClass = false;
        let closed = false;
        while (pos < text.length && text[pos] !== '\n' && text[pos] !== '\r') {
          const c = text[pos++];
          if (c === '\\') pos++;
          else if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) { closed = true; break; }
        }
        // An uncertain slash must not hide the remaining executable code.
        if (!closed) { pos = start + 1; canStartRegex = true; continue; }
        while (pos < text.length && /[a-z]/i.test(text[pos])) pos++;
        erase(start, pos);
        canStartRegex = false;
      } else if (/[\w$]/.test(ch)) {
        while (pos < text.length && /[\w$]/.test(text[pos])) pos++;
        canStartRegex = /^(return|throw|case|yield|await|void|typeof|delete|in|of)$/.test(text.slice(start, pos));
      } else if (ch === '}' && inExpression && depth === 0) {
        erase(pos, ++pos);
        return;
      } else {
        if (ch === '{') depth++;
        if (ch === '}') depth--;
        canStartRegex = ![')', ']', '}', '.'].includes(ch);
        pos++;
      }
    }
  }
  scan(false);
  return out.join('');
}

const html = source.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\r\n]/g, ' '));
for (const match of html.matchAll(/<(script|link)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi)) {
  const tag = match[0];
  if (match[1].toLowerCase() === 'script') {
    if (attribute(tag, 'src') !== null) report('external script', match.index);
    if (attribute(tag, 'type')?.toLowerCase() === 'module') report('ES module', match.index);
  } else {
    const rel = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    const href = attribute(tag, 'href');
    if (href !== null && !embedded(href) && !rel.every((r) => ['canonical', 'alternate', 'author', 'license', 'help', 'search', 'next', 'prev'].includes(r))) {
      report('external linked resource', match.index);
    }
  }
}

for (const block of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
  const css = block[1].replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\r\n]/g, ' '));
  for (const match of css.matchAll(/@import\s+(?:url\(\s*)?['"]?([^'"\s;)]+)/gi)) {
    if (!embedded(match[1])) report('external CSS import', block.index + block[0].indexOf(block[1]) + match.index);
  }
}

for (const block of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
  const js = block[1];
  const code = codeOnly(js);
  const start = block.index + block[0].indexOf(js);
  for (const match of code.matchAll(/\bfetch\s*\(/g)) {
    const argument = js.slice(match.index + match[0].length);
    if (!/^\s*(['"`])(?:data|blob):/i.test(argument)) report('fetch(): only embedded data: and blob: URLs', start + match.index);
  }
  for (const match of code.matchAll(/\bnew\s+Worker\s*\(/g)) {
    if (!/^\s*URL\s*\.\s*createObjectURL\s*\(/.test(code.slice(match.index + match[0].length))) {
      report('Worker must use URL.createObjectURL()', start + match.index);
    }
  }
  for (const match of code.matchAll(/(?:^|[;\n])\s*(?:import|export)\s|\bimport\s*\(/g)) {
    report('ES module import/export', start + match.index);
  }
}

if (violations === 0) console.log('OK: no forbidden constructs');
else console.error(`Violations: ${violations}`);
process.exitCode = violations === 0 ? 0 : 1;
