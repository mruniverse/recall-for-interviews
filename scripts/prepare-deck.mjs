// Validates a deck and writes the app bundle to .generated/deck.json (git-ignored).
//   node scripts/prepare-deck.mjs --mode fixtures [--previous <deck.json>]
//   node scripts/prepare-deck.mjs --mode private --deck <directory outside this checkout> --initial
//   node scripts/prepare-deck.mjs --mode private --deck <directory outside this checkout> --previous <deck.json>
// Private decks take exactly one lineage: the boolean flag --initial (first version, no previous), or
// --previous for every later one. --initial takes no value and is refused for fixtures.
// --previous is the shipped deck (schema 1 or 2); kept ids must keep their meaning against it.
// Any failure exits 1 and leaves no bundle behind, so a build cannot ship a stale deck.
import { lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkRevision, parseBaseline, toBundle, validateDeck } from '../src/content/deck.ts';

const checkout = realpathSync.native(fileURLToPath(new URL('..', import.meta.url)));
const fixtures = join(checkout, 'src', 'content', 'fixtures', 'deck.json');
const output = join(checkout, '.generated', 'deck.json');

function insideCheckout(path) {
  const rel = relative(checkout, path);
  return rel === '' || !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

// Parse errors can quote file content, so only the error code is reported.
function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${label} is not readable JSON (${error.code ?? error.name})`);
  }
}

// Exactly one lineage: --initial (presence means first version, no baseline) XOR --previous (later version).
// parseArgs is strict and --initial is boolean, so --initial=false, --initial true and --no-initial are rejected upstream.
function checkLineage(deck, previous, initial) {
  if (!deck) throw new Error('--mode private requires --deck <directory outside this checkout>');
  if (initial && previous !== undefined) throw new Error('--mode private takes exactly one of --initial and --previous, not both');
  if (!initial && previous === undefined) throw new Error('--mode private needs --initial for the first deck, or --previous <deck.json> for a later one');
}

function privateDeckFile(dir) {
  if (!dir) throw new Error('--mode private requires --deck <directory outside this checkout>');
  let resolved;
  try {
    resolved = [realpathSync.native(dir), realpathSync.native(join(dir, 'deck.json'))];
  } catch {
    throw new Error(`private deck not found: ${join(dir, 'deck.json')}`);
  }
  if (resolved.some(insideCheckout)) throw new Error('the private deck must live outside this checkout, symlinks included');
  return resolved[1];
}

async function main() {
  mkdirSync(dirname(output), { recursive: true });
  if (lstatSync(dirname(output)).isSymbolicLink()) throw new Error('.generated must be a directory, not a symlink');
  rmSync(output, { force: true });

  const { values } = parseArgs({ options: { mode: { type: 'string' }, deck: { type: 'string' }, previous: { type: 'string' }, initial: { type: 'boolean' } } });
  const { mode, deck, previous, initial } = values;
  if (mode !== 'fixtures' && mode !== 'private') throw new Error('--mode must be fixtures or private');
  if (mode === 'fixtures' && deck !== undefined) throw new Error('--deck is only accepted with --mode private');
  if (mode === 'fixtures' && initial) throw new Error('--initial is only accepted with --mode private');
  if (mode === 'private') checkLineage(deck, previous, initial);

  const validated = await validateDeck(readJson(mode === 'private' ? privateDeckFile(deck) : fixtures, 'deck'), { mode });
  if (previous !== undefined) checkRevision(await parseBaseline(readJson(previous, 'previous deck'), { mode }), validated);
  writeFileSync(output, `${JSON.stringify(toBundle(validated, mode), null, 2)}\n`, { flag: 'wx' });
  console.log(`prepare-deck: ${mode} deck ${validated.deckId} r${validated.revision}, ${validated.cards.length} cards -> .generated/deck.json`);
}

try {
  await main();
} catch (error) {
  console.error(`prepare-deck: ${error.message}`);
  for (const line of error.errors ?? []) console.error(`  - ${line}`);
  process.exitCode = 1;
}
