import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { run } from "./lib/exec.mjs";

const statePath = resolve("demo-generated", "deployment-state.json");
const kubeconfigPath = resolve("demo-generated", "kubeconfig");
const localKubelogin =
  process.platform === "win32"
    ? resolve("demo-generated", "bin", "kubelogin.exe")
    : resolve("demo-generated", "bin", "kubelogin");
const localKubectl =
  process.platform === "win32"
    ? resolve("demo-generated", "bin", "kubectl.exe")
    : resolve("demo-generated", "bin", "kubectl");

let failures = 0;

function usage() {
  console.log(`Usage:
  node scripts/verify-demo.mjs

Checks the disposable private demo repository, GitHub security and variables,
Azure resources, the digest-pinned deployment, and the app /healthz endpoint.`);
}

function check(label, callback, { warning = false } = {}) {
  try {
    const detail = callback();
    console.log(`${warning ? "INFO" : "PASS"}  ${label}${detail ? `: ${detail}` : ""}`);
    return true;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message.split("\n")[0] : String(error);
    console.error(`${warning ? "WARN" : "FAIL"}  ${label}: ${detail}`);
    if (!warning) {
      failures += 1;
    }
    return false;
  }
}

if (process.argv.includes("--help")) {
  usage();
  process.exit(0);
}

if (process.argv.length > 2) {
  console.error(`Unknown argument: ${process.argv.slice(2).join(" ")}`);
  usage();
  process.exit(1);
}

if (!existsSync(statePath)) {
  console.error("Missing demo-generated/deployment-state.json. Run setup-demo.mjs first.");
  process.exit(1);
}

const state = JSON.parse(readFileSync(statePath, "utf8"));
const repository = `${state.githubOrganization}/${state.githubRepository}`;
let applicationEndpoint = "";

function loadVariables(argumentsList) {
  const entries = JSON.parse(run("gh", argumentsList));
  return new Map(entries.map((entry) => [entry.name, entry.value]));
}

check("Private GitHub demo repository", () => {
  const details = JSON.parse(
    run("gh", ["repo", "view", repository, "--json", "visibility"]),
  );
  if (details.visibility !== "PRIVATE") {
    throw new Error(`visibility is ${details.visibility}`);
  }
  return repository;
});

check("GitHub environment and deployment variables", () => {
  run("gh", ["api", `repos/${repository}/environments/${state.githubEnvironment}`]);
  const environmentVariables = loadVariables([
    "variable",
    "list",
    "--env",
    state.githubEnvironment,
    "--repo",
    repository,
    "--json",
    "name,value",
  ]);
  const expectedEnvironmentVariables = {
    AZURE_CLIENT_ID: state.deploymentIdentityClientId,
    AZURE_TENANT_ID: state.tenantId,
    AZURE_SUBSCRIPTION_ID: state.subscriptionId,
    AZURE_RESOURCE_GROUP: state.resourceGroupName,
    ACR_NAME: state.acrName,
    ACR_LOGIN_SERVER: state.acrLoginServer,
    AKS_NAME: state.aksName,
  };
  for (const [name, expectedValue] of Object.entries(expectedEnvironmentVariables)) {
    const actualValue = environmentVariables.get(name);
    if (actualValue !== expectedValue) {
      throw new Error(`${name} is ${actualValue ?? "missing"} (expected ${expectedValue})`);
    }
  }
  const repositoryVariables = loadVariables([
    "variable",
    "list",
    "--repo",
    repository,
    "--json",
    "name,value",
  ]);
  if (repositoryVariables.get("DEMO_ENVIRONMENT") !== state.githubEnvironment) {
    throw new Error(
      `DEMO_ENVIRONMENT is ${repositoryVariables.get("DEMO_ENVIRONMENT") ?? "missing"}`,
    );
  }
  if (repositoryVariables.get("DEMO_CONFIGURED") !== "true") {
    throw new Error(
      `DEMO_CONFIGURED is ${repositoryVariables.get("DEMO_CONFIGURED") ?? "missing"}`,
    );
  }
  return state.githubEnvironment;
});

check("GitHub security configuration", () => {
  const details = JSON.parse(run("gh", ["api", `repos/${repository}`]));
  const security = details.security_and_analysis ?? {};
  const required = [
    "secret_scanning",
    "secret_scanning_push_protection",
    "secret_scanning_non_provider_patterns",
  ];
  const disabled = required.filter(
    (name) => security[name]?.status !== "enabled",
  );
  const codeSecurityEnabled =
    security.advanced_security?.status === "enabled" ||
    security.code_security?.status === "enabled";
  if (!codeSecurityEnabled || disabled.length > 0) {
    throw new Error(
      `code security enabled=${codeSecurityEnabled}; disabled=${disabled.join(",")}`,
    );
  }
  return "code security, secret scanning, generic patterns, and push protection";
});

check("Azure resource group", () => {
  run("az", ["account", "set", "--subscription", state.subscriptionId]);
  const group = JSON.parse(
    run("az", [
      "group",
      "show",
      "--name",
      state.resourceGroupName,
      "--output",
      "json",
      "--only-show-errors",
    ]),
  );
  return group.name;
});

check("Azure Container Registry", () => {
  const registry = JSON.parse(
    run("az", [
      "acr",
      "show",
      "--resource-group",
      state.resourceGroupName,
      "--name",
      state.acrName,
      "--output",
      "json",
      "--only-show-errors",
    ]),
  );
  return registry.loginServer;
});

check("AKS cluster", () => {
  const cluster = JSON.parse(
    run("az", [
      "aks",
      "show",
      "--resource-group",
      state.resourceGroupName,
      "--name",
      state.aksName,
      "--output",
      "json",
      "--only-show-errors",
    ]),
  );
  if (cluster.powerState?.code !== "Running") {
    throw new Error(`power state is ${cluster.powerState?.code ?? "unknown"}`);
  }
  return cluster.name;
});

check("Container image published", () => {
  const tags = JSON.parse(
    run("az", [
      "acr",
      "repository",
      "show-tags",
      "--name",
      state.acrName,
      "--repository",
      "orders-portal",
      "--output",
      "json",
      "--only-show-errors",
    ]),
  );
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error("no orders-portal tags found");
  }
  return `${tags.length} tag(s)`;
});

check("AKS workload and public endpoint", () => {
  if (!existsSync(localKubelogin) || !existsSync(localKubectl)) {
    throw new Error("local kubectl/kubelogin tools are missing; rerun setup");
  }

  run("az", [
    "aks",
    "get-credentials",
    "--resource-group",
    state.resourceGroupName,
    "--name",
    state.aksName,
    "--file",
    kubeconfigPath,
    "--overwrite-existing",
    "--only-show-errors",
  ]);
  run(localKubelogin, [
    "convert-kubeconfig",
    "-l",
    "azurecli",
    "--kubeconfig",
    kubeconfigPath,
  ]);
  const deployment = JSON.parse(
    run(localKubectl, [
      "--kubeconfig",
      kubeconfigPath,
      "--namespace",
      state.namespace,
      "get",
      "deployment",
      "orders-portal",
      "--output=json",
    ]),
  );
  const image = deployment.spec?.template?.spec?.containers?.[0]?.image;
  if (!image?.startsWith(`${state.acrLoginServer}/orders-portal@sha256:`)) {
    throw new Error(`deployment is not using an image digest: ${image}`);
  }
  if ((deployment.status?.availableReplicas ?? 0) < 1) {
    throw new Error("deployment has no available replicas");
  }
  const service = JSON.parse(
    run(localKubectl, [
      "--kubeconfig",
      kubeconfigPath,
      "--namespace",
      state.namespace,
      "get",
      "service",
      "orders-portal",
      "--output=json",
    ]),
  );
  const ingress = service.status?.loadBalancer?.ingress?.[0];
  const endpoint = ingress?.ip ?? ingress?.hostname;
  if (!endpoint) {
    throw new Error("LoadBalancer endpoint is not assigned");
  }
  writeFileSync(
    resolve("demo-generated", "application-url.txt"),
    `http://${endpoint}\n`,
    "utf8",
  );
  applicationEndpoint = `http://${endpoint}`;
  return `${image} at http://${endpoint}`;
});

if (applicationEndpoint) {
  try {
    const response = await fetch(`${applicationEndpoint}/healthz`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const health = await response.json();
    if (health.status !== "ok" || health.syntheticData !== true) {
      throw new Error("health response did not confirm the synthetic demo");
    }
    console.log(`PASS  Application health: ${applicationEndpoint}/healthz`);
  } catch (error) {
    failures += 1;
    console.error(
      `FAIL  Application health: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

console.log("");
console.log(
  "Defender plans and the GitHub connector are intentionally outside this read-only verification.",
);

process.exit(failures === 0 ? 0 : 1);
