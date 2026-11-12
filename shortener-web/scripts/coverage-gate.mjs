import { readFileSync } from 'node:fs';

const summary = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'));
const totalLines = (predicate) => {
  const rows = Object.entries(summary).filter(([path]) => predicate(path.replace(/\\/g, '/')));
  if (rows.length === 0) throw new Error('гейт: ни один файл не попал в выборку');
  const covered = rows.reduce((sum, [, v]) => sum + v.lines.covered, 0);
  const total = rows.reduce((sum, [, v]) => sum + v.lines.total, 0);
  return { ratio: covered / total, files: rows.length };
};
const branches = (predicate) => {
  const rows = Object.entries(summary).filter(([path]) => predicate(path.replace(/\\/g, '/')));
  const covered = rows.reduce((sum, [, v]) => sum + v.branches.covered, 0);
  const total = rows.reduce((sum, [, v]) => sum + v.branches.total, 0);
  return total === 0 ? { ratio: 1, files: rows.length } : { ratio: covered / total, files: rows.length };
};

const isCore = (p) => p.includes('/src/api/') || p.includes('/src/lib/');
const core = totalLines(isCore);
const rest = totalLines((p) => p.includes('/src/') && !isCore(p));
const restBranches = branches((p) => p.includes('/src/') && !isCore(p));

const report = (name, got, need) => `${name}: ${(got * 100).toFixed(2)}% (нужно ${(need * 100).toFixed(0)}%)`;
const checks = [
  [core, 1, 'api+lib строки'],
  [rest, 0.8, 'компоненты строки'],
  [restBranches, 0.75, 'компоненты ветки']
];
for (const [got, need, name] of checks) console.warn(report(name, got.ratio ?? got, need));
const failed = checks.filter(([got, need]) => (got.ratio ?? got) < need);
if (failed.length > 0) {
  console.error('ГЕЙТ ПОКРЫТИЯ НЕ ПРОЙДЕН: ' + failed.map(([, need, name]) => name + ' < ' + need).join(', '));
  process.exit(1);
}
console.warn('Гейт покрытия пройден.');
