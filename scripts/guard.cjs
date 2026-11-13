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
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`/g,
    (value) => value.replace(/[^\r\n]/g, ' '));
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
