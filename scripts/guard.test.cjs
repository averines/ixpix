// Exercises the guard offline, including multiline markup and permitted embedded resources.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ixpix-guard-'));
const cases = [
  [false, '<script>\nfetch("settings.json");\n</script>'],
  [false, '<script>\nwindow.fetch\n("settings.json");\n</script>'],
  [false, '<script\n src="https://example.invalid/app.js">\n</script>'],
  [false, '<script\n type="module">\n</script>'],
  [false, '<link\n rel="stylesheet" href="app.css">'],
  [false, '<link rel="apple-touch-icon" href="media/icon.png">'],
  [false, '<style>@import "local.css";</style>'],
  [false, '<script>new Worker("worker.js");</script>'],
  [false, '<script>import("module.js");</script>'],
  [true, '<link rel="canonical" href="https://example.invalid/">'],
  [true, '<link rel="icon" href="data:image/svg+xml,<svg></svg>">'],
  [true, '<style>@import "data:text/css,body{}";</style>'],
  [true, '<script>fetch("data:text/plain,ok"); fetch("blob:test");</script>'],
  [true, '<script>new Worker(URL.createObjectURL(new Blob(["worker"])));</script>'],
  [true, '<!-- <script src="example.js"></script> -->'],
  [true, '<script>// fetch("local");\nconst text = "fetch(\'local\')";</script>'],
];
try {
  for (const [allowed, html] of cases) {
    const file = path.join(temp, 'sample.html');
    fs.writeFileSync(file, html);
    const result = spawnSync(process.execPath, [path.join(__dirname, 'guard.cjs'), file], { encoding: 'utf8' });
    assert.equal(result.status, allowed ? 0 : 1, `${html}\n${result.stdout}${result.stderr}`);
  }
  console.log(`GUARD: ${cases.length} passed, 0 failed`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
