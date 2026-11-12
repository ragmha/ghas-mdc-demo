import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { run } from "./lib/exec.mjs";

const stateDirectory = resolve("demo-generated");
const statePath = resolve(stateDirectory, "deployment-state.json");
const parametersPath = resolve(stateDirectory, "deployment-parameters.json");
const kubeconfigPath = resolve(stateDirectory, "kubeconfig");
const toolsDirectory = resolve(stateDirectory, "bin");
const namespaceManifestPath = resolve("deploy", "k8s", "namespace.yaml");

function localToolPath(name) {
  if (process.platform === "win32") {
    return resolve(toolsDirectory, `${name}.exe`);
  }
  return resolve(toolsDirectory, name);
}

function usage() {
  console.log(`Usage:
  node scripts/setup-demo.mjs --subscription <subscription-id> --location <azure-region> --prefix <lowercase-demo-prefix> --github-org <organization> --github-repo <repository> [options]

Options:
  --github-environment demo
  --node-vm-size Standard_B2as_v2
  --operator-principal-id <entra-object-id>
  --configure-github-security
  --skip-kubernetes-bootstrap
  --what-if

Public and private GitHub source repositories are supported. Secret seeding
remains private-only. Paid Defender plans and the
Defender GitHub connector are intentionally not enabled by this script.`);
}

function parseArguments(argv) {
  const values = new Map();
  const flags = new Set();
  const booleanFlags = new Set([
    "--configure-github-security",
    "--skip-kubernetes-bootstrap",
    "--what-if",
    "--help",
  ]);
  const valueFlags = new Set([
    "--subscription",
    "--location",
    "--prefix",
    "--github-org",
    "--github-repo",
    "--github-environment",
    "--node-vm-size",
    "--operator-principal-id",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (booleanFlags.has(argument)) {
      flags.add(argument);
      continue;
    }

    if (!valueFlags.has(argument) || index + 1 >= argv.length) {
      throw new Error(`Invalid argument: ${argument}`);
    }

    if (values.has(argument)) {
      throw new Error(`Duplicate argument: ${argument}`);
    }
    values.set(argument, argv[index + 1]);
    index += 1;
  }

  return { values, flags };
}

function requireValue(values, name) {
  const value = values.get(name);
  if (!value) {
    throw new Error(`Missing required argument: ${name}`);
  }
  return value;
}

function validate(value, pattern, label) {
  if (!pattern.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

function outputValue(outputs, names, fallback) {
  for (const name of names) {
    const value = outputs[name]?.value;
    if (value !== undefined && value !== null && value !== "") {
      return String(value);
    }
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Deployment did not return any of: ${names.join(", ")}`);
}

function setEnvironmentVariable(repository, environment, name, value) {
  run("gh", [
    "variable",
    "set",
    name,
    "--env",
    environment,
    "--repo",
    repository,
    "--body",
    value,
  ]);
}

function setRepositoryVariable(repository, name, value) {
  run("gh", ["variable", "set", name, "--repo", repository, "--body", value]);
}

function readBootstrapNamespace() {
  const manifest = readFileSync(namespaceManifestPath, "utf8");
  const match = manifest.match(/^\s*name:\s*([A-Za-z0-9.-]+)\s*$/mu);
  if (!match) {
    throw new Error(`Could not determine namespace from ${namespaceManifestPath}.`);
  }
  return match[1];
}

function resolveOperatorPrincipalId(values, account) {
  const explicitPrincipalId = values.get("--operator-principal-id");
  if (explicitPrincipalId) {
    return validate(
      explicitPrincipalId,
      /^[0-9a-f-]{36}$/i,
      "operator principal ID",
    );
  }

  const loginName = String(account.user?.name ?? "").trim();
  const candidates = [
    () =>
      run("az", [
        "ad",
        "signed-in-user",
        "show",
        "--query",
        "id",
        "--output",
        "tsv",
        "--only-show-errors",
      ]),
    () => {
      if (!loginName) {
        throw new Error("Azure CLI did not report the signed-in user name.");
      }
      return run("az", [
        "ad",
        "user",
        "show",
        "--id",
        loginName,
        "--query",
        "id",
        "--output",
        "tsv",
        "--only-show-errors",
      ]);
    },
    () => {
      if (!loginName) {
        throw new Error("Azure CLI did not report the signed-in principal name.");
      }
      return run("az", [
        "ad",
        "sp",
        "show",
        "--id",
        loginName,
        "--query",
        "id",
        "--output",
        "tsv",
        "--only-show-errors",
      ]);
    },
  ];

  for (const candidate of candidates) {
    try {
      return validate(candidate(), /^[0-9a-f-]{36}$/i, "operator principal ID");
    } catch {
      // Try the next lookup strategy.
    }
  }

  throw new Error(
    "Could not determine the operator principal ID automatically. Pass --operator-principal-id <entra-object-id>.",
  );
}

function sleep(milliseconds) {
  Atomics.wait(
    new Int32Array(new SharedArrayBuffer(4)),
    0,
    0,
    milliseconds,
  );
}

function configureGitHubSecurity(repository) {
  const sharedSettings = {
    dependabot_security_updates: { status: "enabled" },
    secret_scanning: { status: "enabled" },
    secret_scanning_push_protection: { status: "enabled" },
    secret_scanning_non_provider_patterns: { status: "enabled" },
  };

  let configured = false;
  const errors = [];
  for (const codeSecurityField of ["code_security", "advanced_security"]) {
    try {
      run(
        "gh",
        ["api", "--method", "PATCH", `repos/${repository}`, "--input", "-"],
        {
          input: JSON.stringify({
            security_and_analysis: {
              [codeSecurityField]: { status: "enabled" },
              ...sharedSettings,
            },
          }),
        },
      );
      configured = true;
      break;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!configured) {
    throw new Error(
      `GitHub rejected both Code Security API fields: ${errors.join(" | ")}`,
    );
  }

  run("gh", [
    "api",
    "--method",
    "PUT",
    `repos/${repository}/vulnerability-alerts`,
  ]);
}

try {
  const { values, flags } = parseArguments(process.argv.slice(2));
  if (flags.has("--help")) {
    usage();
    process.exit(0);
  }

  const subscriptionId = validate(
    requireValue(values, "--subscription"),
    /^[0-9a-f-]{36}$/i,
    "subscription ID",
  );
  const location = validate(
    requireValue(values, "--location"),
    /^[a-z0-9]+$/,
    "Azure region",
  );
  const prefix = validate(
    requireValue(values, "--prefix"),
    /^[a-z][a-z0-9]{2,10}$/,
    "prefix",
  );
  const githubOrganization = validate(
    requireValue(values, "--github-org"),
    /^[A-Za-z0-9_.-]+$/,
    "GitHub organization",
  );
  const githubRepository = validate(
    requireValue(values, "--github-repo"),
    /^[A-Za-z0-9_.-]+$/,
    "GitHub repository",
  );
  const githubEnvironment = validate(
    values.get("--github-environment") ?? "demo",
    /^[A-Za-z0-9_.-]+$/,
    "GitHub environment",
  );
  const nodeVmSize = validate(
    values.get("--node-vm-size") ?? "Standard_B2as_v2",
    /^[A-Za-z0-9_]+$/,
    "AKS node VM size",
  );
  const requestedRepository = `${githubOrganization}/${githubRepository}`;
  const repositoryDetails = JSON.parse(
    run("gh", [
      "repo",
      "view",
      requestedRepository,
      "--json",
      "nameWithOwner,visibility",
    ]),
  );

  if (!["PUBLIC", "PRIVATE"].includes(repositoryDetails.visibility)) {
    throw new Error(
      `Refusing to deploy from ${repositoryDetails.nameWithOwner}: ` +
        `unsupported visibility ${repositoryDetails.visibility}.`,
    );
  }
  const repository = String(repositoryDetails.nameWithOwner);
  if (flags.has("--configure-github-security") && repositoryDetails.visibility === "PUBLIC") {
    throw new Error(
      "Configure public-repository security manually; --configure-github-security is reserved for licensed private copies.",
    );
  }
  const [canonicalOrganization, canonicalRepository] = repository.split("/");

  run("az", ["account", "set", "--subscription", subscriptionId]);
  const account = JSON.parse(
    run("az", ["account", "show", "--only-show-errors", "--output", "json"]),
  );
  const operatorPrincipalId = resolveOperatorPrincipalId(values, account);

  mkdirSync(stateDirectory, { recursive: true });
  const deploymentParameters = {
    $schema:
      "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    contentVersion: "1.0.0.0",
    parameters: {
      prefix: { value: prefix },
      location: { value: location },
      githubOrganization: { value: canonicalOrganization },
      githubRepository: { value: canonicalRepository },
      githubEnvironment: { value: githubEnvironment },
      federateDefaultBranch: { value: false },
      kubernetesNodeSize: { value: nodeVmSize },
      clusterAdminPrincipalIds: { value: [operatorPrincipalId] },
    },
  };
  writeFileSync(
    parametersPath,
    `${JSON.stringify(deploymentParameters, null, 2)}\n`,
    "utf8",
  );

  run("az", ["bicep", "build", "--file", "infra/main.bicep"]);

  const deploymentName = `${prefix}-ghas-mdc`;
  const deploymentArguments = [
    "--name",
    deploymentName,
    "--location",
    location,
    "--template-file",
    "infra/main.bicep",
    "--parameters",
    `@${parametersPath}`,
    "--only-show-errors",
    "--output",
    "json",
  ];

  if (flags.has("--what-if")) {
    const result = run("az", [
      "deployment",
      "sub",
      "what-if",
      ...deploymentArguments,
    ]);
    console.log(result);
    process.exit(0);
  }

  const deployment = JSON.parse(
    run("az", ["deployment", "sub", "create", ...deploymentArguments]),
  );
  const outputs = deployment.properties?.outputs ?? {};
  const state = {
    subscriptionId,
    tenantId: outputValue(outputs, ["tenantId"]),
    deploymentName,
    location,
    githubOrganization: canonicalOrganization,
    githubRepository: canonicalRepository,
    githubEnvironment,
    resourceGroupName: outputValue(outputs, ["resourceGroupName"]),
    acrName: outputValue(outputs, ["acrName"]),
    acrLoginServer: outputValue(outputs, ["acrLoginServer"]),
    aksName: outputValue(outputs, ["aksClusterName"]),
    deploymentIdentityClientId: outputValue(outputs, ["deploymentIdentityClientId"]),
    manualFollowUpSteps: Array.isArray(outputs.manualFollowUpSteps?.value)
      ? outputs.manualFollowUpSteps.value
      : [],
    roleAssignmentSummary: Array.isArray(outputs.roleAssignmentSummary?.value)
      ? outputs.roleAssignmentSummary.value
      : [],
    namespace: outputValue(outputs, ["kubernetesNamespace"]),
  };
  const bootstrapNamespace = readBootstrapNamespace();
  if (bootstrapNamespace !== state.namespace) {
    throw new Error(
      `Bootstrap manifest namespace ${bootstrapNamespace} does not match Bicep output ${state.namespace}.`,
    );
  }

  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

  run("gh", [
    "api",
    "--method",
    "PUT",
    `repos/${repository}/environments/${githubEnvironment}`,
  ]);

  const variables = {
    AZURE_CLIENT_ID: state.deploymentIdentityClientId,
    AZURE_TENANT_ID: state.tenantId,
    AZURE_SUBSCRIPTION_ID: state.subscriptionId,
    AZURE_RESOURCE_GROUP: state.resourceGroupName,
    ACR_NAME: state.acrName,
    ACR_LOGIN_SERVER: state.acrLoginServer,
    AKS_NAME: state.aksName,
  };

  for (const [name, value] of Object.entries(variables)) {
    setEnvironmentVariable(repository, githubEnvironment, name, value);
  }
  setRepositoryVariable(repository, "DEMO_ENVIRONMENT", githubEnvironment);

  if (flags.has("--configure-github-security")) {
    configureGitHubSecurity(repository);
  }

  if (!flags.has("--skip-kubernetes-bootstrap")) {
    mkdirSync(toolsDirectory, { recursive: true });
    const localKubectl = localToolPath("kubectl");
    const localKubelogin = localToolPath("kubelogin");

    run("az", [
      "aks",
      "install-cli",
      "--install-location",
      localKubectl,
      "--kubelogin-install-location",
      localKubelogin,
      "--kubelogin-version",
      "v0.2.9",
    ]);
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
    let namespaceCreated = false;
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      try {
        run(localKubectl, [
          "--kubeconfig",
          kubeconfigPath,
          "apply",
          "-f",
          namespaceManifestPath,
        ]);
        run(localKubectl, [
          "--kubeconfig",
          kubeconfigPath,
          "get",
          "namespace",
          state.namespace,
          "--output=name",
        ]);
        namespaceCreated = true;
        break;
      } catch {
        console.log(
          `Waiting for AKS Azure RBAC propagation (${attempt}/30)...`,
        );
        sleep(10_000);
      }
    }
    if (!namespaceCreated) {
      throw new Error(
        "Could not bootstrap the Kubernetes namespace after Azure RBAC propagation.",
      );
    }
  }

  if (!flags.has("--skip-kubernetes-bootstrap")) {
    setRepositoryVariable(repository, "DEMO_CONFIGURED", "true");
  }

  console.log(`Azure demo foundation deployed to ${state.resourceGroupName}.`);
  console.log(
    `GitHub environment ${githubEnvironment} configured in ${repository}.`,
  );
  if (!flags.has("--configure-github-security")) {
    console.log(
      "GitHub paid security settings were not changed. Follow docs/setup.md or " +
        "rerun with --configure-github-security after confirming licensing.",
    );
  }
  for (const step of state.manualFollowUpSteps) {
    console.log(`- ${step}`);
  }
  if (flags.has("--skip-kubernetes-bootstrap")) {
    console.log(
      `After bootstrapping namespace ${state.namespace}, enable deployment with:`,
    );
    console.log(
      `gh variable set DEMO_CONFIGURED --repo ${repository} --body true`,
    );
  } else {
    console.log(
      `Next: gh workflow run build-and-deploy.yml --repo ${repository}`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (existsSync(statePath)) {
    console.error(
      `Any partial deployment state was preserved at ${statePath} for cleanup or retry.`,
    );
  }
  usage();
  process.exit(1);
}
