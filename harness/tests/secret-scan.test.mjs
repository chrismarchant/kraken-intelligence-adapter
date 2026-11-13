import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkRepo, write, commitAll, SCAN } from './helpers.mjs';

// Fake secrets are assembled at runtime so this file contains no credential-shaped literal.
const rand = (n, seed = 7) => {
  const cs = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = ''; let x = seed;
  for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; s += cs[x % cs.length]; }
  return s;
};
const skKey = () => 'sk' + '-' + rand(40);
const ghTok = () => 'gh' + 'p_' + rand(36);
const awsKey = () => 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
const pem = () => '-----BEGIN ' + 'RSA PRIVATE KEY-----';

function scan(files, { allowlist } = {}) {
  const root = mkRepo({ gitInit: true });
  for (const [p, c] of Object.entries(files)) write(root, p, c);
  if (allowlist) write(root, 'harness/config/secret-scan-allowlist.txt', allowlist);
  commitAll(root);
  const r = spawnSync('node', [SCAN, '--root', root, '--json'], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr, json: JSON.parse(r.stdout) };
}

test('flags provider key prefixes and prints path and line only, never the value', () => {
  const key = skKey();
  const r = scan({ 'a.txt': `line1\nconst k = "${key}";\n` });
  assert.equal(r.code, 1);
  assert.deepEqual(r.json.findings.map((f) => [f.path, f.line]), [['a.txt', 2]]);
  assert.ok(!r.out.includes(key) && !r.err.includes(key));
});

test('flags github tokens, aws keys, bearer tokens, private key blocks', () => {
  const r = scan({
    'b.txt': ghTok() + '\n', 'c.txt': awsKey() + '\n', 'd.txt': 'Authorization: Bearer ' + rand(40, 3) + '\n', 'e.txt': pem() + '\n',
  });
  assert.deepEqual(r.json.findings.map((f) => f.path).sort(), ['b.txt', 'c.txt', 'd.txt', 'e.txt']);
});

test('flags a tracked .env file but not .env.example', () => {
  const r = scan({ '.env': 'A=1\n', '.env.example': 'A=\n' });
  assert.deepEqual(r.json.findings.map((f) => f.path), ['.env']);
});

test('flags high-entropy assignments to KEY/TOKEN/SECRET/PASSWORD names', () => {
  const v = rand(32, 11);
  const r = scan({
    'f.env.txt': `MY_API_KEY=${v}\n`, 'g.json': `{"client_secret": "${rand(30, 5)}"}\n`, 'h.py': `PASSWORD = '${rand(24, 9)}'\n`,
    'i.txt': `AUTH_TOKEN: ${rand(28, 2)}\n`,
  });
  assert.deepEqual(r.json.findings.map((f) => f.path).sort(), ['f.env.txt', 'g.json', 'h.py', 'i.txt']);
});

test('does not flag placeholders proxy-injected and dummy', () => {
  const r = scan({
    'ok1.txt': 'MISTRAL_API_KEY=proxy-injected\n', 'ok2.txt': 'API_KEY=dummy\nTOKEN="dummy-dummy-dummy-dummy-1234"\n',
    'ok3.txt': 'Authorization: Bearer proxy-injected\n', 'ok4.txt': 'k = "sk' + '-dummy-dummy-dummy-dummy-dummy"\n',
  });
  assert.equal(r.code, 0, r.out);
});

test('does not flag ordinary code, short values, env references or numeric settings', () => {
  const r = scan({
    'ok.js': [
      'const max_tokens = 4096;', 'const TOKEN_FILE = "harness/config/x.json";', 'API_KEY=${API_KEY}', 'const k = process.env.MISTRAL_API_KEY;',
      'password: "short"', 'MAX_TOKENS=100000000000000000000', 'the key to success is a long-lived-token-policy',
    ].join('\n') + '\n',
  });
  assert.equal(r.code, 0, r.out);
});

test('inline secret-scan:allow marker suppresses a finding', () => {
  const r = scan({ 'm.txt': `${skKey()} # secret-scan:allow test fixture\n` });
  assert.equal(r.code, 0);
});

test('allowlist file suppresses by path and line pattern, and needs a justification', () => {
  const key = skKey();
  const files = { 'fixtures/x.txt': `${key}\n`, 'other.txt': `${key}\n` };
  const r = scan(files, { allowlist: '# comment\nfixtures/** | sk- | recorded fixture, not a live key\n' });
  assert.deepEqual(r.json.findings.map((f) => f.path), ['other.txt']);
  const noWhy = scan(files, { allowlist: 'fixtures/** | sk-\n' });
  assert.equal(noWhy.json.findings.length, 2, 'entries without justification are ignored');
});

test('clean repository passes; non-git directory errors', () => {
  assert.equal(scan({ 'readme.txt': 'hello\n' }).code, 0);
  const root = mkRepo({});
  const r = spawnSync('node', [SCAN, '--root', root], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
