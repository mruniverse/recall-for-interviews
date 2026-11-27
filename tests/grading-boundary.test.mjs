import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GRADING = join(ROOT, 'server', 'grading');
const SPECIFIER =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const specifiers = (file) => [...readFileSync(file, 'utf8').matchAll(SPECIFIER)].map((match) => match.slice(1).find(Boolean));

function resolveLocal(from, specifier) {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`unresolved import ${specifier} in ${relative(ROOT, from)}`);
}

test('the app import graph never reaches server/', () => {
  const pending = [join(ROOT, 'index.ts'), join(ROOT, 'App.tsx')];
  const visited = new Set();
  const external = [];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    if (!/\.(?:tsx?|jsx?|mjs)$/.test(file)) continue;
    for (const specifier of specifiers(file)) {
      if (specifier.startsWith('.')) pending.push(resolveLocal(file, specifier));
      else external.push(specifier);
    }
  }
  const files = [...visited].map((file) => relative(ROOT, file));
  assert.ok(files.includes('src/study/controller.ts'), 'the walk must reach the study controller');
  assert.deepEqual(files.filter((file) => file.startsWith('server/') || file.startsWith('..')), []);
  assert.deepEqual(external.filter((specifier) => specifier.includes('server/grading')), []);
});

test('the grading core imports only its own files, so it has no network, provider or secret access', () => {
  const files = readdirSync(GRADING).filter((name) => name.endsWith('.ts'));
  assert.ok(files.includes('verify.ts') && files.includes('prompt.ts'));
  for (const name of files) {
    for (const specifier of specifiers(join(GRADING, name))) {
      assert.match(specifier, /^\.\/[a-z-]+\.ts$/, `${name} imports ${specifier}`);
    }
  }
});

test('grading runs with network globals disabled', async (t) => {
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket']) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      get() {
        throw new Error(`${name} must not be used by grading`);
      },
    });
    t.after(() => (original ? Object.defineProperty(globalThis, name, original) : delete globalThis[name]));
  }
  const { buildGradingPrompt, verifyGrade } = await import('../server/grading/index.ts');
  const rubric = {
    deckId: 'demo-deck',
    cardId: 'card',
    revision: 1,
    locale: 'en',
    question: 'Why use an index?',
    reference: 'Indexes speed up lookups at a write cost.',
    points: [{ id: 'lookup', text: 'Faster lookups.' }],
  };
  const request = { attemptId: 'attempt-0001', deckId: 'demo-deck', cardId: 'card', revision: 1, locale: 'en', answer: 'An index makes lookups faster.' };
  const config = { canary: 'SyntheticCanary4f9e2b7c1d' };
  assert.equal(buildGradingPrompt(rubric, request, config).user, request.answer);
  const raw = JSON.stringify({
    rating: 'correct',
    points: [{ id: 'lookup', covered: true, evidence: 'makes lookups faster' }],
    hints: ['Mention the write cost.', 'Name a range query.'],
    comparison: 'You covered lookups but not the write cost.',
  });
  assert.equal(verifyGrade(rubric, request, raw, config).rating, 'correct');
});
