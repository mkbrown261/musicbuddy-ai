#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const srcPath = path.join(__dirname, '../src/index.tsx');
const src = fs.readFileSync(srcPath, 'utf8');
const lines = src.split('\n');
let scriptStart = -1, scriptEnd = -1;
for (let i = 2299; i < lines.length; i++) {
  if (lines[i].trim() === '<script>' && scriptStart === -1) { scriptStart = i + 1; }
  if (scriptStart > 0 && lines[i].trim() === '</script>') { scriptEnd = i; break; }
}
if (scriptStart < 0 || scriptEnd < 0) { console.error('Script block not found'); process.exit(1); }
const jsLines = lines.slice(scriptStart, scriptEnd);
const tsPatterns = [
  { re: /\(\s*\w+\s*:\s*(any|string|number|boolean|void|never|unknown)\b/, name: 'TS type annotation' },
  { re: /\)\s+as\s+(any|string|number|boolean)\b/, name: 'TS as-cast' },
];
let errors = [];
jsLines.forEach((line, i) => {
  const stripped = line.trim();
  if (stripped.startsWith('//') || stripped.startsWith('*') || !stripped) return;
  for (const { re, name } of tsPatterns) {
    if (re.test(line)) errors.push(`Line ${scriptStart + i + 1}: [${name}] ${line.trim().slice(0, 100)}`);
  }
});
if (errors.length > 0) {
  console.error('TypeScript syntax in browser JS:');
  errors.forEach(e => console.error('  ' + e));
  process.exit(1);
} else {
  console.log('Browser JS check OK');
}
