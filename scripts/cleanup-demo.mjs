import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { run } from "./lib/exec.mjs";

const statePath = resolve("demo-generated", "deployment-state.json");
const parametersPath = resolve("demo-generated", "deployment-parameters.json");
const kubeconfigPath = resolve("demo-generated", "kubeconfig");
const applicationUrlPath = resolve("demo-generated", "application-url.txt");
const demoSecretPath = resolve(
  "demo-generated",
  "unregistered-demo-private-key.pem",
);
const localKubelogin =
  process.platform === "win32"
    ? resolve("demo-generated", "bin", "kubelogin.exe")
    : resolve("demo-generated", "bin", "kubelogin");
const localKubectl =
  process.platform === "win32"
    ? resolve("demo-generated", "bin", "kubectl.exe")
    : resolve("demo-generated", "bin", "kubectl");

function usage() {
  console.log(`Usage:
  node scripts/cleanup-demo.mjs --confirm <resource-group-name>

This script deletes only the demo resource group, demo GitHub variables, and
local demo-generated state. It never changes Defender plans or the GitHub
connector.`);
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      usage();
      process.exit(0);
    }
    if (argument !== "--confirm" || index + 1 >= argv.length) {
      throw new Error(`Invalid argument: ${argument}`);
    }
    if (values.has(argument)) {
      throw new Error(`Duplicate argument: ${argument}`);
    }
    values.set(argument, argv[index + 1]);
    index += 1;
  }
  return values;
}

function looksLikeMissingResource(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /not found|could not be found|404|was not found/iu.test(message);
}

function removeIfPresent(path) {
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}

function removeEmptyDirectoryIfPresent(path) {
  if (existsSync(path) && readdirSync(path).length === 0) {
    rmSync(path, { force: true });
  }
}

try {
  const values = parseArguments(process.argv.slice(2));
  if (!existsSync(statePath)) {
    throw new Error("Missing demo-generated/deployment-state.json.");
  }

  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const confirmation = values.get("--confirm");
  if (confirmation !== state.resourceGroupName) {
    throw new Error(
      `Refusing cleanup. Pass --confirm ${state.resourceGroupName} exactly.`,
    );
  }

  const repository = `${state.githubOrganization}/${state.githubRepository}`;
  let remoteFailures = 0;

  try {
    run("az", [
      "account",
      "set",
      "--subscription",
      state.subscriptionId,
      "--only-show-errors",
    ]);
    const resourceGroupExists = run("az", [
      "group",
      "exists",
      "--name",
      state.resourceGroupName,
      "--output",
      "tsv",
      "--only-show-errors",
    ]);
    if (resourceGroupExists === "true") {
      console.log(`Deleting Azure resource group ${state.resourceGroupName}...`);
      try {
        run("az", [
          "group",
          "delete",
          "--name",
          state.resourceGroupName,
          "--yes",
          "--only-show-errors",
        ]);
      } catch (error) {
        remoteFailures += 1;
        console.warn(
          `Could not delete Azure resource group ${state.resourceGroupName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } else {
      console.log(`Azure resource group ${state.resourceGroupName} is already absent.`);
    }
  } catch (error) {
    remoteFailures += 1;
    console.warn(
      `Could not inspect or delete Azure resource group ${state.resourceGroupName}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const variableNames = [
    "AZURE_CLIENT_ID",
    "AZURE_TENANT_ID",
    "AZURE_SUBSCRIPTION_ID",
    "AZURE_RESOURCE_GROUP",
    "ACR_NAME",
    "ACR_LOGIN_SERVER",
    "AKS_NAME",
  ];
  for (const name of variableNames) {
    try {
      run("gh", [
        "variable",
        "delete",
        name,
        "--env",
        state.githubEnvironment,
        "--repo",
        repository,
      ]);
    } catch (error) {
      if (looksLikeMissingResource(error)) {
        console.log(`GitHub environment variable ${name} is already absent.`);
        continue;
      }
      remoteFailures += 1;
      console.warn(
        `Could not remove GitHub environment variable ${name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  for (const name of ["DEMO_CONFIGURED", "DEMO_ENVIRONMENT"]) {
    try {
      run("gh", ["variable", "delete", name, "--repo", repository]);
    } catch (error) {
      if (looksLikeMissingResource(error)) {
        console.log(`Repository variable ${name} is already absent.`);
        continue;
      }
      remoteFailures += 1;
      console.warn(
        `Could not remove repository variable ${name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  for (const path of [kubeconfigPath, applicationUrlPath, demoSecretPath, localKubelogin, localKubectl]) {
    removeIfPresent(path);
  }
  removeEmptyDirectoryIfPresent(dirname(localKubelogin));

  if (remoteFailures === 0) {
    for (const path of [statePath, parametersPath]) {
      removeIfPresent(path);
    }
    removeEmptyDirectoryIfPresent(resolve("demo-generated"));
  } else {
    console.warn(
      "Remote cleanup was incomplete, so deployment-state.json was kept for a retry.",
    );
  }

  if (remoteFailures === 0) {
    console.log("Azure demo resources and GitHub deployment variables cleaned up.");
    console.log(
      `Delete the disposable GitHub repository ${repository} through its settings.`,
    );
    console.log(
      "Paid Defender plans and the organization connector were not changed.",
    );
    process.exit(0);
  }

  console.error(
    "Cleanup is incomplete. Resolve the warnings above, then rerun this command " +
      "with the same confirmation.",
  );
  process.exit(1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exit(1);
}
