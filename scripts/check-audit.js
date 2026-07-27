#!/usr/bin/env node
/**
 * Runs `npm audit` and fails unless every high/critical finding traces back
 * only to advisories on the explicit ACCEPTED_ADVISORIES allowlist below.
 *
 * Plain `npm audit --audit-level=high` fails the build the moment any
 * high/critical advisory exists, with no way to acknowledge one that has no
 * available fix. That is too blunt here: react-router has exactly one open
 * high-severity advisory (GHSA-qwww-vcr4-c8h2, "RSC Mode CSRF Bypass") across
 * every version currently published, including the latest (7.18.1) — there
 * is no version to upgrade to. Downgrading below the vulnerable range
 * (verified 2026-07-27) reintroduces thirteen *other* high-severity
 * advisories that 7.18.1 already fixes, so it is strictly worse.
 *
 * This script keeps the gate strict for everything else: any advisory not
 * on the allowlist — a new one in react-router, or one in any other
 * package — still fails CI. Review the allowlist whenever it changes, and
 * remove an entry as soon as a fixed version is available to upgrade to.
 */
const { execFileSync } = require('child_process');

/** GHSA ID -> why it is accepted. Keep entries narrow and dated. */
const ACCEPTED_ADVISORIES = {
  'GHSA-qwww-vcr4-c8h2':
    'React Router: RSC Mode CSRF Bypass. This app is a client-only Vite SPA ' +
    'using solely the declarative <BrowserRouter>/<Routes>/<Route> API — no ' +
    'RSC, no data router, no loaders/actions/server functions — so the ' +
    'vulnerable code path is not reachable. No fixed release exists yet ' +
    '(latest 7.18.1 is still in the vulnerable 7.12.0-8.2.0 range); revisit ' +
    'once one ships.',
};

function runAudit() {
  try {
    return execFileSync('npm', ['audit', '--omit=dev', '--json'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    // npm audit exits non-zero whenever it finds anything; the JSON is on
    // stdout regardless, which is what we actually need.
    if (err.stdout) return err.stdout;
    throw err;
  }
}

/** Resolves a vulnerability's `via` entries to the set of underlying GHSA
 * IDs, following string references to other packages in the report
 * (npm audit's JSON links dependents to their dependency's finding by name
 * rather than repeating the advisory). */
function resolveAdvisoryIds(name, vulnerabilities, seen = new Set()) {
  if (seen.has(name)) return new Set(); // guards against reference cycles
  seen.add(name);
  const entry = vulnerabilities[name];
  if (!entry) return new Set();

  const ids = new Set();
  for (const via of entry.via ?? []) {
    if (typeof via === 'string') {
      for (const id of resolveAdvisoryIds(via, vulnerabilities, seen)) ids.add(id);
    } else if (via?.url) {
      const match = /\/advisories\/(GHSA-[a-z0-9-]+)/i.exec(via.url);
      ids.add(match ? match[1] : via.url);
    }
  }
  return ids;
}

function main() {
  const raw = runAudit();
  const report = JSON.parse(raw);
  const vulnerabilities = report.vulnerabilities ?? {};

  const unaccepted = [];
  const acceptedFound = new Set();

  for (const [name, entry] of Object.entries(vulnerabilities)) {
    if (entry.severity !== 'high' && entry.severity !== 'critical') continue;

    const advisoryIds = resolveAdvisoryIds(name, vulnerabilities);
    const unknownIds = [...advisoryIds].filter((id) => !ACCEPTED_ADVISORIES[id]);

    if (advisoryIds.size === 0 || unknownIds.length > 0) {
      unaccepted.push({ name, severity: entry.severity, advisoryIds: [...advisoryIds] });
    } else {
      for (const id of advisoryIds) acceptedFound.add(id);
    }
  }

  if (acceptedFound.size > 0) {
    console.log('Accepted advisories present (see scripts/check-audit.js for rationale):');
    for (const id of acceptedFound) {
      console.log(`  - ${id}: ${ACCEPTED_ADVISORIES[id]}`);
    }
  }

  if (unaccepted.length > 0) {
    console.error('\nUnaccepted high/critical severity findings:');
    for (const v of unaccepted) {
      console.error(`  - ${v.name} (${v.severity}): ${v.advisoryIds.join(', ') || 'unknown advisory'}`);
    }
    console.error(
      '\nEither this is a genuinely new issue (fix it or pin a patched version), ' +
        'or it should be added to ACCEPTED_ADVISORIES in scripts/check-audit.js with a reason.'
    );
    process.exit(1);
  }

  console.log('\nNo unaccepted high/critical severity findings.');
}

main();
