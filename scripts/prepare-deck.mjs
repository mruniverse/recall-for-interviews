// Validates a deck and writes the app bundle to .generated/deck.json (git-ignored).
//   node scripts/prepare-deck.mjs --mode fixtures
//   node scripts/prepare-deck.mjs --mode private --deck <directory outside this checkout> [--previous <deck.json>]
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

  const { values } = parseArgs({ options: { mode: { type: 'string' }, deck: { type: 'string' }, previous: { type: 'string' } } });
  const { mode, deck, previous } = values;
  if (mode !== 'fixtures' && mode !== 'private') throw new Error('--mode must be fixtures or private');
  if (mode === 'fixtures' && deck !== undefined) throw new Error('--deck is only accepted with --mode private');

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
