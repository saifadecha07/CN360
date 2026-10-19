#!/usr/bin/env node
/**
 * Secrets helper for the remote stream (docs/streaming/security.md).
 * Prints values to stdout only — nothing is written to disk or sent anywhere.
 *
 *   node tools/stream-admin.mjs keys                 RSA signing key + session secret (Vercel env)
 *   node tools/stream-admin.mjs viewer <user> [path…] hash a viewer password (prompted) → STREAM_VIEWERS entry
 *   node tools/stream-admin.mjs device <id> [path]    new random device key → Pi .env + STREAM_PUBLISHERS entry
 *   node tools/stream-admin.mjs turn-secret          shared secret for coturn + MediaMTX (VPS .env)
 */
import crypto from "node:crypto";
import readline from "node:readline";
import { hashPassword } from "../api/_lib/streamAuth.js";

const [cmd, ...args] = process.argv.slice(2);

function promptHidden(question) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // Non-interactive: read the first line of stdin (e.g. from a password manager pipe).
      const rl = readline.createInterface({ input: process.stdin });
      rl.once("line", (l) => { rl.close(); resolve(l); });
      return;
    }
    process.stdout.write(question);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = () => {};
    rl.question("", (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

switch (cmd) {
  case "keys": {
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    console.log("# Vercel → Project → Settings → Environment Variables (Production). Never commit these.");
    console.log(`STREAM_JWT_PRIVATE_KEY="${pem.trim().replace(/\n/g, "\\n")}"`);
    console.log(`STREAM_SESSION_SECRET=${crypto.randomBytes(32).toString("base64url")}`);
    console.log("\n# Public half of this key. For a rotation, add it to STREAM_JWT_EXTRA_PUBLIC_KEYS and restart");
    console.log("# MediaMTX BEFORE making it the signing key (docs/streaming/security.md → Rotating the signing key).");
    console.log(`# PUBLIC_KEY="${crypto.createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString().trim().replace(/\n/g, "\\n")}"`);
    break;
  }
  case "viewer": {
    const [user, ...paths] = args;
    if (!user) throw new Error("usage: viewer <user> [path…]");
    const pw = await promptHidden(`Password for ${user} (min 12 chars): `);
    console.log(JSON.stringify({ user, hash: hashPassword(pw), paths: paths.length ? paths : ["cam"] }));
    console.log("# Add this object to the STREAM_VIEWERS JSON array in Vercel, then redeploy.");
    break;
  }
  case "device": {
    const [id, path = "cam"] = args;
    if (!id) throw new Error("usage: device <id> [path]");
    const key = crypto.randomBytes(24).toString("base64url");
    console.log("# Raspberry Pi: /etc/veil-publisher/publisher.env (chmod 600)");
    console.log(`STREAM_USERNAME=${id}\nSTREAM_PASSWORD=${key}\nSTREAM_NAME=${path}`);
    console.log("\n# Vercel: add to the STREAM_PUBLISHERS JSON array, then redeploy");
    console.log(JSON.stringify({ id, hash: hashPassword(key), path }));
    break;
  }
  case "turn-secret":
    console.log(`TURN_SECRET=${crypto.randomBytes(32).toString("base64url")}`);
    break;
  default:
    console.error("usage: stream-admin.mjs keys | viewer <user> [path…] | device <id> [path] | turn-secret");
    process.exit(2);
}
