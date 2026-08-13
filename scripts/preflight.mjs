import { run } from "./lib/exec.mjs";

function usage() {
  console.log(`Usage:
  node scripts/preflight.mjs [--cloud]

Options:
  --cloud   Also validate Azure CLI and GitHub CLI authentication.
  --help    Show this message.`);
}

const argv = process.argv.slice(2);
if (argv.includes("--help")) {
  usage();
  process.exit(0);
}

const supportedFlags = new Set(["--cloud"]);
for (const argument of argv) {
  if (!supportedFlags.has(argument)) {
    console.error(`Unknown argument: ${argument}`);
    usage();
    process.exit(1);
  }
}

const cloudChecks = argv.includes("--cloud");

function check(label, callback) {
  try {
    const detail = callback();
    console.log(`PASS  ${label}${detail ? `: ${detail}` : ""}`);
    return true;
  } catch (error) {
    const detail =
      error instanceof Error && error.message ? error.message.split("\n")[0] : "";
    console.error(`FAIL  ${label}${detail ? `: ${detail}` : ""}`);
    return false;
  }
}

const checks = [
  check("Node.js 24 LTS", () => {
    const major = Number(process.versions.node.split(".")[0]);
    if (major !== 24) {
      throw new Error(`found ${process.version}`);
    }
    return process.version;
  }),
  check("npm", () => run("npm", ["--version"])),
  check("Git", () => run("git", ["--version"])),
  check("Azure CLI", () => {
    const version = JSON.parse(run("az", ["version", "--output", "json"]));
    return version["azure-cli"];
  }),
  check("GitHub CLI", () => run("gh", ["--version"]).split("\n")[0]),
  check("Docker CLI and daemon", () =>
    run("docker", ["info", "--format", "{{.ServerVersion}}"]),
  ),
  check("kubectl", () => {
    const version = JSON.parse(
      run("kubectl", ["version", "--client", "--output=json"]),
    );
    return version.clientVersion?.gitVersion ?? "installed";
  }),
];

if (cloudChecks) {
  checks.push(
    check("Azure CLI authentication", () => {
      const account = JSON.parse(
        run("az", ["account", "show", "--only-show-errors", "--output", "json"]),
      );
      return `${account.name} (${account.id})`;
    }),
    check("GitHub CLI authentication", () => {
      run("gh", ["auth", "status", "--hostname", "github.com"]);
      return "github.com";
    }),
  );
}

if (checks.some((passed) => !passed)) {
  process.exit(1);
}
