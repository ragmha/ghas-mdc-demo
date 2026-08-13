import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { run } from "./lib/exec.mjs";

const canaryPath = resolve(
  "demo-generated",
  "unregistered-demo-private-key.pem",
);
const acknowledgement = "--acknowledge-disposable-private-repo";
const supportedFlags = new Set(["--clean", "--help", acknowledgement]);

function usage() {
  console.log(`Usage:
  node scripts/generate-demo-secret.mjs ${acknowledgement}
  node scripts/generate-demo-secret.mjs --clean

This script only creates an unregistered private-key canary inside a disposable
PRIVATE GitHub repository. It never registers or uploads the key.`);
}

for (const argument of process.argv.slice(2)) {
  if (!supportedFlags.has(argument)) {
    console.error(`Unknown argument: ${argument}`);
    usage();
    process.exit(1);
  }
}

if (process.argv.includes("--help")) {
  usage();
  process.exit(0);
}

if (process.argv.includes("--clean")) {
  if (existsSync(canaryPath)) {
    rmSync(canaryPath);
    console.log(`Removed ${canaryPath}`);
  } else {
    console.log("No generated demo secret is present.");
  }
  process.exit(0);
}

if (!process.argv.includes(acknowledgement)) {
  console.error(
    `Refusing to generate a secret-shaped canary without ${acknowledgement}.`,
  );
  process.exit(1);
}

try {
  if (run("git", ["rev-parse", "--is-inside-work-tree"]) !== "true") {
    throw new Error("The current directory is not a Git worktree.");
  }

  const repository = JSON.parse(
    run("gh", ["repo", "view", "--json", "nameWithOwner,visibility"]),
  );

  if (repository.visibility !== "PRIVATE") {
    throw new Error(
      `Repository ${repository.nameWithOwner} is ${repository.visibility}. ` +
        "Create a disposable private copy before running this scenario.",
    );
  }

  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
    publicKeyEncoding: {
      type: "spki",
      format: "pem",
    },
  });

  mkdirSync(dirname(canaryPath), { recursive: true });
  writeFileSync(canaryPath, privateKey, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });

  console.log(`Generated an unregistered private-key canary at ${canaryPath}.`);
  console.log("The matching public key was discarded and never registered.");
  console.log("");
  console.log("To demonstrate push protection in this disposable private copy:");
  console.log(
    "  git add -f demo-generated/unregistered-demo-private-key.pem",
  );
  console.log('  git commit -m "demo: seed generic secret canary"');
  console.log("  git push");
  console.log("");
  console.log(
    "Do not bypass push protection unless you explicitly need a repository alert.",
  );
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
    console.error(
      `${canaryPath} already exists. Run this script with --clean first.`,
    );
    process.exit(1);
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
