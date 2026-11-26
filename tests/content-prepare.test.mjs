import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardContentHash } from '../src/content/deck.ts';

const repo = fileURLToPath(new URL('..', import.meta.url));
const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'recall-deck-')));
test.after(() => rmSync(sandbox, { recursive: true, force: true }));

// The pipeline runs from a disposable copy so tests never touch the real .generated/.
const checkout = join(sandbox, 'checkout');
cpSync(join(repo, 'scripts', 'prepare-deck.mjs'), join(checkout, 'scripts', 'prepare-deck.mjs'));
cpSync(join(repo, 'src', 'content'), join(checkout, 'src', 'content'), { recursive: true });
const output = join(checkout, '.generated', 'deck.json');
const fixtures = () => JSON.parse(readFileSync(join(repo, 'src', 'content', 'fixtures', 'deck.json'), 'utf8'));

function prepare(...args) {
  return spawnSync(process.execPath, ['--no-warnings', join(checkout, 'scripts', 'prepare-deck.mjs'), ...args], { encoding: 'utf8' });
}

function writeDeck(dir, deck) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'deck.json'), typeof deck === 'string' ? deck : JSON.stringify(deck));
  return dir;
}

async function approvedDeck() {
  const deck = fixtures();
  for (const card of deck.cards) {
    card.provenance.author = 'Author A';
    card.review = {
      status: 'approved',
      reviewer: 'Reviewer B',
      reviewedAt: '2026-11-20',
      checks: ['accuracy', 'trade-offs', 'rubric'],
      evidence: 'review-log.md#2026-11-20',
      contentHash: await cardContentHash(card),
    };
  }
  return deck;
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

test('fixtures mode writes a bundle without provenance or review records', () => {
  const run = prepare('--mode', 'fixtures');
  assert.equal(run.status, 0, run.stderr);
  const bundle = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(bundle.mode, 'fixtures');
  assert.deepEqual(bundle.cards.map((card) => card.id), fixtures().cards.map((card) => card.id));
  assert.ok(bundle.cards.every((card) => !('provenance' in card) && !('review' in card)));
});

test('the mode is explicit and unknown or misplaced arguments are rejected', () => {
  assertFailsClosed([], /--mode must be fixtures or private/);
  assertFailsClosed(['--mode', 'release'], /--mode must be fixtures or private/);
  assertFailsClosed(['--mode', 'fixtures', '--deck', sandbox], /--deck is only accepted with --mode private/);
  assertFailsClosed(['--mode', 'fixtures', '--out', join(checkout, 'src')], /Unknown option '--out'/);
  assertFailsClosed(['--mode', 'private'], /requires --deck/);
  assertFailsClosed(['--mode', 'private', '--deck', ''], /requires --deck/);
});

test('private mode accepts an approved deck outside the checkout and bundles no reviewer data', async () => {
  const dir = writeDeck(join(sandbox, 'private-ok'), await approvedDeck());
  const run = prepare('--mode', 'private', '--deck', dir);
  assert.equal(run.status, 0, run.stderr);
  const text = readFileSync(output, 'utf8');
  assert.equal(JSON.parse(text).mode, 'private');
  assert.ok(!text.includes('Reviewer B') && !text.includes('Author A') && !text.includes('review-log'));
});

test('private mode requires a deck that exists outside the checkout after resolving symlinks', async () => {
  const deck = await approvedDeck();
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

test('private mode fails closed on unreviewed or unreadable decks without echoing their content', () => {
  const unreviewed = writeDeck(join(sandbox, 'unreviewed'), fixtures());
  const run = assertFailsClosed(['--mode', 'private', '--deck', unreviewed], /invalid deck \(24 problems\)/);
  assert.match(run.stderr, /card net-l4-l7\.review: must be approved for a private release/);

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
    assert.deepEqual(JSON.parse(readFileSync(join(fixturesDir, 'deck.json'), 'utf8')), fixtures());
  } finally {
    rmSync(generated, { force: true });
  }
});

test('--previous rejects a kept id whose correct choice changed', async () => {
  const previous = await approvedDeck();
  const next = await approvedDeck();
  next.revision = 2;
  const card = next.cards.find((c) => c.type === 'multiple-choice');
  const wrong = card.choices.find((choice) => choice.id !== card.answer);
  card.choices.find((choice) => choice.id === card.answer).reason = { 'pt-BR': 'Motivo' };
  card.answer = wrong.id;
  card.review.contentHash = await cardContentHash(card);
  writeFileSync(join(sandbox, 'previous.json'), JSON.stringify(previous));
  const dir = writeDeck(join(sandbox, 'next'), next);
  assertFailsClosed(['--mode', 'private', '--deck', dir, '--previous', join(sandbox, 'previous.json')], new RegExp(`card ${card.id}: .* needs a new card id`));
});
