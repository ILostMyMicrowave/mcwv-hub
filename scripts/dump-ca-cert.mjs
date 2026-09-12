// Regenerate lib/caCert.ts from lib/ca.crt — or the reverse.
//
// The bundle in lib/ca.crt is the trust store for PostgreSQL TLS (lib/db.ts
// passes it as ssl.ca — Node's `ca` option REPLACES the default trust store,
// so the bundle must contain every anchor itself):
//
//   1. The public Mozilla root set (curl.se extraction), and
//   2. "Supabase Root 2021 CA" — Supabase's OWN private root, which anchors
//      the *.pooler.supabase.com chain the transaction pooler serves. It is
//      in no public bundle; without it every pooler connection fails with
//      SELF_SIGNED_CERT_IN_CHAIN (prod incident 2026-09-12).
//
// Usage:
//   node scripts/dump-ca-cert.mjs               # lib/ca.crt  -> lib/caCert.ts (default)
//   node scripts/dump-ca-cert.mjs --extract     # lib/caCert.ts -> lib/ca.crt  (fresh clone / lost .crt)
//   node scripts/dump-ca-cert.mjs --fetch [url] # refresh Mozilla set from curl.se,
//                                                # preserving custom additions (e.g. the
//                                                # Supabase root), then regenerate caCert.ts
//
// Both files are committed, so either direction always works. Nothing here is
// sensitive: all entries are public roots or a root Supabase itself serves in
// the pooler's own TLS chain.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const CRT_URL = new URL("../lib/ca.crt", import.meta.url);
const TS_URL = new URL("../lib/caCert.ts", import.meta.url);
const DEFAULT_FETCH_URL = "https://curl.se/ca/cacert.pem";

const HEADER = `// Auto-generated from lib/ca.crt by scripts/dump-ca-cert.mjs — do not edit by hand.
//
// The CA bundle the hub's PostgreSQL connections verify against. lib/db.ts
// passes it as ssl.ca; Node's \`ca\` option REPLACES the runtime's default
// trust store (not additive), so this bundle must contain every anchor we
// connect to:
//   1. The public Mozilla root set (curl.se extraction) — anchors any
//      publicly-signed DB endpoint.
//   2. "Supabase Root 2021 CA" — the PRIVATE root anchoring the
//      *.pooler.supabase.com chain the Supabase transaction pooler serves.
//      It is in no public bundle; without it the pooler chain cannot verify.
//
// Incident notes (2026-09-12, every DB call 500ed with
// SELF_SIGNED_CERT_IN_CHAIN) — two independent causes, both fixed:
//   - pg 8.22 + pg-connection-string 2.14: ANY sslmode/ssl* query param in
//     DATABASE_URL is parsed into a fresh ssl object that REPLACES the
//     explicit ssl:{ ca } option (Object.assign order in ConnectionParameters).
//     lib/db.ts now strips those params from the URL before creating the Pool.
//   - The pooler chain anchors at Supabase's private root, which the
//     Mozilla-only bundle could never verify — the root is appended in
//     lib/ca.crt (extracted from the live pooler TLS chain, SHA-256
//     80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA).
//
// Regenerate after editing lib/ca.crt:      node scripts/dump-ca-cert.mjs
// Recreate lib/ca.crt from this file:       node scripts/dump-ca-cert.mjs --extract
// Refresh the Mozilla set (keeps additions): node scripts/dump-ca-cert.mjs --fetch
`;

function readCrt() {
  if (!existsSync(CRT_URL)) {
    console.error(
      "lib/ca.crt not found. Either restore it from git, or recreate it from\n" +
        "the committed bundle with:  node scripts/dump-ca-cert.mjs --extract"
    );
    process.exit(1);
  }
  return readFileSync(CRT_URL, "utf8");
}

function readTsPem() {
  if (!existsSync(TS_URL)) {
    console.error("lib/caCert.ts not found — nothing to extract from.");
    process.exit(1);
  }
  const match = readFileSync(TS_URL, "utf8").match(
    /export const DB_CA_PEM = ("(?:[^"\\]|\\.)*");/
  );
  if (!match) {
    console.error("Could not find `export const DB_CA_PEM = \"...\"` in lib/caCert.ts.");
    process.exit(1);
  }
  return JSON.parse(match[1]);
}

// Extract normalized (whitespace-free) certificate bodies for set comparison.
function certBodies(bundle) {
  const blocks = bundle.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  return new Set(blocks.map((b) => b.replace(/\s+/g, "")));
}

function validate(bundle, label) {
  const begins = (bundle.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length;
  const ends = (bundle.match(/-----END CERTIFICATE-----/g) ?? []).length;
  if (begins === 0 || begins !== ends) {
    console.error(`${label}: malformed PEM (BEGIN: ${begins}, END: ${ends}) — refusing to write.`);
    process.exit(1);
  }
  if (begins < 20) {
    // A healthy Mozilla extraction has 100+ roots; anything tiny means the
    // file was truncated or replaced by accident.
    console.error(`${label}: only ${begins} certificates — expected 100+. Refusing to write.`);
    process.exit(1);
  }
  return begins;
}

function writeTs(pem, count) {
  writeFileSync(TS_URL, `${HEADER}export const DB_CA_PEM = ${JSON.stringify(pem.trimEnd())};\n`);
  console.log(`lib/caCert.ts regenerated (${count} certificates).`);
}

function writeCrt(pem, count) {
  writeFileSync(CRT_URL, `${pem.trimEnd()}\n`);
  console.log(`lib/ca.crt written (${count} certificates).`);
}

const mode = process.argv[2] ?? "";

if (mode === "--extract") {
  const pem = readTsPem();
  writeCrt(pem, validate(pem, "lib/caCert.ts"));
} else if (mode === "--fetch") {
  const url = process.argv[3] ?? DEFAULT_FETCH_URL;
  console.log(`Fetching Mozilla bundle from ${url} ...`);
  const fresh = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  });
  validate(fresh, "downloaded bundle");

  // Preserve custom additions (certs in our current bundle that the fresh
  // Mozilla set doesn't carry — e.g. the Supabase pooler root).
  const current = existsSync(CRT_URL) ? readCrt() : (() => {
    try {
      return readTsPem();
    } catch {
      return "";
    }
  })();
  const freshBodies = certBodies(fresh);
  const customBlocks =
    current.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
  const additions = customBlocks.filter((b) => !freshBodies.has(b.replace(/\s+/g, "")));
  const marker = current.includes("Supabase Root 2021 CA")
    ? current.slice(Math.max(0, current.indexOf("## Supabase Root 2021 CA") - 1))
        .split(/-----BEGIN CERTIFICATE-----/)[0]
        .trimEnd()
    : "";

  const merged =
    fresh.trimEnd() +
    (additions.length > 0 ? `\n\n${marker ? marker + "\n" : "## Custom additions preserved from the previous bundle:\n"}${additions.join("\n")}\n` : "\n");
  const count = validate(merged, "merged bundle");
  writeCrt(merged, count);
  writeTs(merged, count);
  if (additions.length > 0) {
    console.log(`Preserved ${additions.length} custom certificate(s) not present in the fresh Mozilla set.`);
  }
} else {
  if (mode && mode !== "--help" && mode !== "-h") {
    console.error(`Unknown option: ${mode}\n`);
  }
  if (mode === "--help" || mode === "-h") {
    console.log(
      "Usage:\n" +
        "  node scripts/dump-ca-cert.mjs               # lib/ca.crt -> lib/caCert.ts\n" +
        "  node scripts/dump-ca-cert.mjs --extract     # lib/caCert.ts -> lib/ca.crt\n" +
        "  node scripts/dump-ca-cert.mjs --fetch [url] # refresh Mozilla set, keep additions"
    );
    process.exit(0);
  }
  const pem = readCrt();
  writeTs(pem, validate(pem, "lib/ca.crt"));
}
