import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardContentHash } from '../src/content/deck.ts';
import { approve, asSchemaOne, sampleDeck } from './content-support.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'recall-deck-')));
test.after(() => rmSync(sandbox, { recursive: true, force: true }));

// The pipeline runs from a disposable copy so tests never touch the real .generated/, and its
// fixture deck is synthetic so these tests do not depend on the public sample content.
const checkout = join(sandbox, 'checkout');
cpSync(join(repo, 'scripts', 'prepare-deck.mjs'), join(checkout, 'scripts', 'prepare-deck.mjs'));
cpSync(join(repo, 'src', 'content'), join(checkout, 'src', 'content'), { recursive: true });
const fixtureFile = join(checkout, 'src', 'content', 'fixtures', 'deck.json');
writeFileSync(fixtureFile, JSON.stringify(sampleDeck()));
const output = join(checkout, '.generated', 'deck.json');

function prepare(...args) {
  return spawnSync(process.execPath, ['--no-warnings', join(checkout, 'scripts', 'prepare-deck.mjs'), ...args], { encoding: 'utf8' });
}

function writeDeck(dir, deck) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'deck.json'), typeof deck === 'string' ? deck : JSON.stringify(deck));
  return dir;
}

function writePrevious(name, deck) {
  const file = join(sandbox, `${name}.json`);
  writeFileSync(file, typeof deck === 'string' ? deck : JSON.stringify(deck));
  return file;
}

// Each failure must also remove a bundle left by an earlier successful run.
function assertFailsClosed(args, expected) {
  mkdirSync(join(checkout, '.generated'), { recursive: true });
  writeFileSync(output, '{"stale": true}');
  const run = prepare(...args);
  assert.equal(run.status, 1, `${args.join(' ')}: ${run.stdout}${run.stderr}`);
  assert.match(run.stderr, expected, args.join(' '));
  assert.equal(existsSync(output), false, `${args.join(' ')} left a bundle behind`);
  return run;
}

test('the bundle path is ignored by git in the real checkout', () => {
  execFileSync('git', ['check-ignore', '--quiet', '--no-index', '.generated/deck.json'], { cwd: repo });
});

test('fixtures mode writes a schema-2 bundle with both locales and without provenance or review records', () => {
  const run = prepare('--mode', 'fixtures');
  assert.equal(run.status, 0, run.stderr);
  const bundle = JSON.parse(readFileSync(output, 'utf8'));
  assert.deepEqual([bundle.schemaVersion, bundle.mode], [2, 'fixtures']);
  assert.deepEqual(bundle.cards.map((card) => card.id), sampleDeck().cards.map((card) => card.id));
  for (const card of bundle.cards) {
    assert.ok(!('provenance' in card) && !('review' in card), card.id);
    assert.deepEqual([typeof card.level, typeof card.round], ['string', 'string'], card.id);
    assert.deepEqual(Object.keys(card.prompt).sort(), ['en', 'pt-BR'], card.id);
  }
});

test('fixtures mode fails closed on a fixture deck that breaks the schema', () => {
  const restore = readFileSync(fixtureFile, 'utf8');
  try {
    writeFileSync(fixtureFile, JSON.stringify(asSchemaOne(sampleDeck())));
    assertFailsClosed(['--mode', 'fixtures'], /deck\.schemaVersion: must be 2/);
    const long = sampleDeck();
    long.cards[0].prompt['pt-BR'] = Array.from({ length: 31 }, () => 'palavra').join(' ');
    writeFileSync(fixtureFile, JSON.stringify(long));
    assertFailsClosed(['--mode', 'fixtures'], /card networking-open-1\.prompt\.pt-BR: has 31 words; the limit is 30/);
  } finally {
    writeFileSync(fixtureFile, restore);
  }
});

test('the mode is explicit and unknown or misplaced arguments are rejected', () => {
  assertFailsClosed([], /--mode must be fixtures or private/);
  assertFailsClosed(['--mode', 'release'], /--mode must be fixtures or private/);
  assertFailsClosed(['--mode', 'fixtures', '--deck', sandbox], /--deck is only accepted with --mode private/);
  assertFailsClosed(['--mode', 'fixtures', '--out', join(checkout, 'src')], /Unknown option '--out'/);
  assertFailsClosed(['--mode', 'private'], /requires --deck/);
  assertFailsClosed(['--mode', 'private', '--deck', ''], /requires --deck/);
});

test('private mode accepts an approved, sourced deck outside the checkout and bundles no reviewer or source data', async () => {
  const dir = writeDeck(join(sandbox, 'private-ok'), await approve(sampleDeck()));
  const run = prepare('--mode', 'private', '--deck', dir);
  assert.equal(run.status, 0, run.stderr);
  const text = readFileSync(output, 'utf8');
  assert.equal(JSON.parse(text).mode, 'private');
  for (const secret of ['Reviewer B', 'Author A', 'review-log', 'interview-reports', 'Example Corp']) assert.ok(!text.includes(secret), secret);
});

test('private mode requires a deck that exists outside the checkout after resolving symlinks', async () => {
  const deck = await approve(sampleDeck());
  const inside = writeDeck(join(checkout, 'private'), deck);
  symlinkSync(inside, join(sandbox, 'dir-link'));
  const fileLink = join(sandbox, 'file-link');
  mkdirSync(fileLink);
  symlinkSync(join(inside, 'deck.json'), join(fileLink, 'deck.json'));
  const outsideFile = writeDeck(join(sandbox, 'outside-file'), deck);
  const insideDir = join(checkout, 'private-link');
  mkdirSync(insideDir);
  symlinkSync(join(outsideFile, 'deck.json'), join(insideDir, 'deck.json'));

  assertFailsClosed(['--mode', 'private', '--deck', join(sandbox, 'absent')], /private deck not found/);
  assertFailsClosed(['--mode', 'private', '--deck', inside], /must live outside this checkout/);
  assertFailsClosed(['--mode', 'private', '--deck', join(sandbox, 'dir-link')], /must live outside this checkout/);
  assertFailsClosed(['--mode', 'private', '--deck', fileLink], /must live outside this checkout/);
  assertFailsClosed(['--mode', 'private', '--deck', insideDir], /must live outside this checkout/);
  assertFailsClosed(['--mode', 'private', '--deck', join(checkout, 'src', 'content', 'fixtures')], /must live outside this checkout/);
});

test('private mode fails closed on unreviewed, unsourced or unreadable decks without echoing their content', () => {
  const unreviewed = writeDeck(join(sandbox, 'unreviewed'), sampleDeck());
  const run = assertFailsClosed(['--mode', 'private', '--deck', unreviewed], /invalid deck \(24 problems\)/);
  assert.match(run.stderr, /card networking-open-1\.review: must be approved for a private release/);
  assert.match(run.stderr, /card networking-open-1\.provenance\.sources: needs a question-pattern source/);

  const broken = writeDeck(join(sandbox, 'broken'), '{"cards": SECRET}');
  const failed = assertFailsClosed(['--mode', 'private', '--deck', broken], /deck is not readable JSON/);
  assert.ok(!failed.stderr.includes('SECRET'));
});

test('a symlinked .generated directory is refused before anything is deleted or written', () => {
  const generated = join(checkout, '.generated');
  const fixturesDir = join(checkout, 'src', 'content', 'fixtures');
  rmSync(generated, { recursive: true, force: true });
  symlinkSync(fixturesDir, generated);
  try {
    const run = prepare('--mode', 'fixtures');
    assert.equal(run.status, 1);
    assert.match(run.stderr, /\.generated must be a directory, not a symlink/);
    assert.deepEqual(JSON.parse(readFileSync(fixtureFile, 'utf8')), sampleDeck());
  } finally {
    rmSync(generated, { force: true });
  }
});

test('--previous rejects a kept id whose correct choice changed', async () => {
  const next = await approve(sampleDeck());
  next.revision = 2;
  const card = next.cards.find((c) => c.type === 'multiple-choice');
  card.choices.find((choice) => choice.id === card.answer).reason = { en: 'Why not.', 'pt-BR': 'Por que não.' };
  card.answer = card.choices.find((choice) => choice.id !== card.answer).id;
  card.review.contentHash = await cardContentHash(card);
  const previous = writePrevious('previous', await approve(sampleDeck()));
  const dir = writeDeck(join(sandbox, 'next'), next);
  assertFailsClosed(['--mode', 'private', '--deck', dir, '--previous', previous], new RegExp(`card ${card.id}: .* needs a new card id`));
});

test('--previous compares a schema-1 baseline safely and refuses one it cannot read', async () => {
  const next = await approve(sampleDeck());
  next.revision = 2;
  const dir = writeDeck(join(sandbox, 'next-v2'), next);
  const v1 = asSchemaOne(sampleDeck());

  const run = prepare('--mode', 'private', '--deck', dir, '--previous', writePrevious('v1', v1));
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(readFileSync(output, 'utf8')).revision, 2);

  assertFailsClosed(['--mode', 'private', '--deck', dir, '--previous', writePrevious('v1-r2', { ...v1, revision: 2 })], /deck\.revision: must increase when content changes/);
  const renamed = asSchemaOne(sampleDeck());
  renamed.cards[0].id = 'networking-open-9';
  assertFailsClosed(['--mode', 'private', '--deck', dir, '--previous', writePrevious('v1-renamed', renamed)], /card networking-open-9: a removed card must be listed in archived/);
  assertFailsClosed(['--mode', 'private', '--deck', dir, '--previous', writePrevious('v3', { ...v1, schemaVersion: 3 })], /previous deck\.schemaVersion: only schema 1 or 2 can be compared; a reviewed migration is required first/);
  assertFailsClosed(['--mode', 'private', '--deck', dir, '--previous', writePrevious('v1-broken', { ...v1, cards: 'SECRET' })], /previous deck\.cards: must be an array/);
  const unreadable = assertFailsClosed(['--mode', 'private', '--deck', dir, '--previous', writePrevious('garbage', '{SECRET')], /previous deck is not readable JSON/);
  assert.ok(!unreadable.stderr.includes('SECRET'));
  assertFailsClosed(['--mode', 'private', '--deck', dir, '--previous', join(sandbox, 'absent.json')], /previous deck is not readable JSON/);
});
