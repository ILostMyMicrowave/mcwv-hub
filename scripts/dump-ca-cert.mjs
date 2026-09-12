// Regenerate lib/caCert.ts from lib/ca.crt after updating the CA bundle.
import { readFileSync, writeFileSync } from "node:fs";
const pem = readFileSync(new URL("../lib/ca.crt", import.meta.url), "utf8").trim();
const ts = `// Auto-generated from lib/ca.crt (see header comment in lib/caCert.ts).
export const DB_CA_PEM = ${JSON.stringify(pem)};
`;
writeFileSync(new URL("../lib/caCert.ts", import.meta.url), ts);
console.log("lib/caCert.ts regenerated");
