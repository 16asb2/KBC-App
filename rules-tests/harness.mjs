/**
 * One isolated Firestore test environment per test file.
 *
 * `node --test` runs test *files* in parallel, and `clearFirestore()` wipes
 * everything belonging to the project id it was configured with. Two files
 * sharing an id therefore delete each other's seeded documents from inside
 * their own `beforeEach`, and the failures that come out of that are the
 * confusing kind: a rule reports "Null value error" because a document the
 * test definitely wrote is not there any more, and it happens to whichever
 * file loses the race, differently on each run.
 *
 * The emulator namespaces data by project id, so giving each file its own is
 * real isolation rather than a scheduling trick. Deriving it from the file
 * name means a new test file gets that for free instead of having to know to
 * pick one — which is the failure this replaced.
 *
 * The id has no bearing on what the rules decide: `firestore.rules` keys the
 * super-admin off a token email, and `$(database)` is the database name, not
 * the project. Nothing in the rules reads a project id.
 */

import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'

const rulesPath = fileURLToPath(new URL('../firestore.rules', import.meta.url))

/**
 * @param {string} moduleUrl  Pass `import.meta.url` from the test file.
 */
export async function createTestEnv(moduleUrl) {
  const slug = basename(fileURLToPath(moduleUrl)).replace(/\.test\.mjs$/, '')
  return initializeTestEnvironment({
    // Must look like a project id: lowercase, digits and hyphens.
    projectId: `kbc-rules-${slug.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    firestore: {
      rules: readFileSync(rulesPath, 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  })
}
