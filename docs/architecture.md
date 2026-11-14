# Architecture

This repository is a **public, MIT-licensed reference/template** for demonstrating GitHub Advanced Security (GHAS) together with Microsoft Defender for Cloud (MDC).

It is **not** a production application and **not** a deployable product. See [safety-and-production-gaps.md](safety-and-production-gaps.md) before you use anything here.

## The application: Northstar Orders

**Northstar Orders** is a **fictional enterprise inner-source order portal** built for this demo. It is a small TypeScript/Express application (`northstar-orders`) that lists and searches customer orders held in an embedded SQLite store.

- **Fictional.** Northstar Orders is not a real product, and it does not represent, model, or stand in for any real company, customer, or organization. Any resemblance to an actual business is coincidental.
- **Synthetic data only.** Every order, customer name, region, and product in the dataset is generated. Records carry `dataClassification: "synthetic-demo"` and `synthetic: true` so this is visible on screen, not just asserted in a doc.
- **Inner-source framing.** It is presented as the kind of internal application a large organization builds and shares across teams — the realistic setting for a security handoff between a cloud security team, an AppSec team, and a product engineering team.
- **Deliberately vulnerable.** Its flaws are planted so security tooling produces findings on a stage. See [findings-catalog.md](findings-catalog.md).

### Runtime and surface

| Aspect | Value |
| --- | --- |
| Runtime | **Node.js 24 LTS** — `engines.node: "24.x"`, and `preflight.mjs` fails on any major other than 24 |
| SQLite driver | `better-sqlite3` — a **native** module, compiled during the image build (`g++`, `make`, `python3` in the build stage) |
| Dependency install | `npm ci` against a **registry-neutral** lockfile (`.npmrc` → `omit-lockfile-registry-resolved=true`), so it resolves against npmjs.org or an enterprise mirror |
| Framework | Express 5 |
| Container base | `node:24-bookworm-slim` (Debian Linux), running as non-root uid/gid `10001` |
| Listen | `0.0.0.0:3000` |
| Liveness | `GET /healthz` → `200` with `{ status: "ok", syntheticData: true, notice, uptimeSeconds, timestamp }` |
| Readiness | `GET /readyz` → `200`/`503` with `{ status, syntheticData, database: { mode, orderCount } }` |
| Data API | `GET /api/orders?search=&limit=` — the search parameter is the scenario 1 injection surface |

`/healthz` and `/readyz` are wired as real Kubernetes probes: `/readyz` backs both the **startup** probe (12 × 5s grace while the in-memory store seeds) and the **readiness** probe; `/healthz` backs the **liveness** probe. `/healthz` is also used by the container `HEALTHCHECK`, by the deploy workflow's post-rollout smoke test, and by `scripts/verify-demo.mjs`, which asserts both `status === "ok"` **and** `syntheticData === true` — so a passing health check also confirms you are looking at the synthetic demo dataset.

Use the name **Northstar Orders** when presenting. Do not substitute a real customer's name, and do not imply the scenario is drawn from a real engagement.

### Naming reference

The product name and the deployed resource names differ. Both are correct; know which is which before you present.

| Thing | Name |
| --- | --- |
| Application (spoken name) | **Northstar Orders** |
| npm package / repo `name` field | `northstar-orders` |
| Container image repository | `orders-portal` |
| Kubernetes namespace | `ghas-mdc-demo` |
| Kubernetes deployment / service / container | `orders-portal` |
| GitHub Actions environment | `demo` |

> On stage, say "Northstar Orders" for the application and read `orders-portal` when pointing at a Kubernetes object, an image tag, or a Defender recommendation. Explain the difference once, early, so nobody assumes they are two systems.

## Distribution model

```
Public template repo (this repo, MIT)
        │  presenter copies (fork / "Use this template" / mirror push)
        ▼
Organization-owned PUBLIC demo source (private is optional)
        │  internal Azure workload; authorized tenant integration
        ▼
Deleted after the demo (see cleanup.md)
```

Why use an authorized organization for the full integration:

| Reason | Detail |
| --- | --- |
| Licensing | GHAS paid features (code scanning on private repos, secret scanning alerts/push protection at org scale) are billed per active committer. Enablement is an **explicit operator action** — see [GitHub Advanced Security billing](https://docs.github.com/en/billing/concepts/product-billing/github-advanced-security). |
| Defender connector scope | The MDC GitHub connector is installed against an **organization**, not a personal fork. See [Connect your GitHub organizations](https://learn.microsoft.com/en-us/azure/defender-for-cloud/quickstart-onboard-github). |
| Public source | GitHub offers CodeQL, dependency review, Dependabot and attestations for public repos. Microsoft still documents GHAS/Defender entitlement and org-owner prerequisites for the full integration; public visibility is not an entitlement. |
| Safety | Scenario 3 generates a throwaway private key. It must never live in a public repo, even though it is unregistered and worthless. |
| Disposal | A disposable copy can be deleted wholesale, which is the only reliable cleanup for secret-scanning artifacts. |

## Live path

```
 GitHub (public source; optional private rehearsal)
   ├─ CodeQL (javascript-typescript, security-extended)  ──► code scanning alerts ──► Copilot Autofix
   ├─ Dependabot                      ──► dependency alerts (lodash 4.17.20)
   ├─ Secret scanning + push protection (generic patterns)
   └─ GitHub Actions — build-and-deploy.yml
          │ gated on repo var DEMO_CONFIGURED == 'true'
          │ environment: ${{ vars.DEMO_ENVIRONMENT || 'demo' }}
          │ Node.js 24 LTS → npm ci → lint + typecheck + test
          │ OIDC (federated credential, no long-lived secret)
          │ docker/metadata-action → OCI labels (source, revision, url)
          │ build + push  →  actions/attest-build-provenance (push-to-registry)
          ▼
       Azure Container Registry (ACR)
          repository: orders-portal, tag: <commit sha>, digest: sha256:…
          │ render deployment.yaml: __IMAGE__ → <login-server>/orders-portal@<digest>
          │ kubectl apply rendered Deployment + service.yaml, annotate, rollout status
          │ smoke test GET /healthz
          ▼
       Azure Kubernetes Service (AKS)
          namespace:  ghas-mdc-demo   (bootstrapped once by an operator, not by CI)
          deployment: orders-portal   (created by the workflow, pinned by digest)
          service:    orders-portal   (internal LoadBalancer; authenticated port-forward)
          │
          ▼
 Microsoft Defender for Cloud
   ├─ Defender CSPM (required)         ── attack paths, risk factors, Cloud Security Explorer
   ├─ Container vulnerability assessment (registry + runtime, MDVM)
   ├─ GitHub connector                 ── DevOps security, code-to-runtime mapping
   └─ Agentless code scanning (preview) ── repo-side scanners independent of CI
          │
          ▼  correlation back to GitHub
   Recommendation → Associated CVEs → Related GitHub Alerts → Remediation Insights
          → Generate GitHub issue → Copilot coding agent → PR
```

## Components

| Component | Role in the demo |
| --- | --- |
| **Northstar Orders** (`northstar-orders`) | The fictional inner-source order portal. TypeScript/Express, **synthetic** order data. Provides the CodeQL sink (`src/database.ts`) and carries the pinned vulnerable npm dependency into the image. |
| SQLite store | `better-sqlite3` over an **in-memory** database (`:memory:`) seeded with **synthetic** rows at startup. Effectively **query-only** in the request path — the API exposes no write endpoint, and the process is stateless. Backs scenario 1 so the SQL injection is demonstrable without a real data store. |
| GitHub Actions (`demo` environment) | `codeql.yml` (advanced setup, `javascript-typescript` + `security-extended`), `ci.yml`, `build-and-deploy.yml`. Builds, pushes to ACR, attests, renders `deployment.yaml`, applies it, and deploys **by digest**. OIDC federation — no stored registry password. |
| ACR | Image storage, repository `orders-portal`, tagged with the commit SHA. Scanned by Defender container VA before deployment. |
| AKS | Runtime for Northstar Orders. Namespace `ghas-mdc-demo` is bootstrapped by an operator; CI is namespace-scoped. Deployment/service `orders-portal` use an **internal** LoadBalancer. Presenter/CI access uses authenticated port-forward. |
| Defender for Cloud | Correlates code → build → registry → runtime, and pushes runtime context back to GitHub alerts. |
| `infra/main.bicep` | Subscription-scoped Bicep template: resource group, ACR, AKS, the federated deployment identity, and RBAC. Emits the values the scripts consume (`acrLoginServer`, `deploymentIdentityClientId`, `kubernetesNamespace`, …) plus a `manualFollowUpSteps` list naming the paid, interactive steps it deliberately leaves to an operator. |
| `scripts/*.mjs` | Operator tooling: `preflight.mjs`, `setup-demo.mjs`, `verify-demo.mjs`, `generate-demo-secret.mjs`, `cleanup-demo.mjs`. All are plain Node ESM, run with `node scripts/<name>.mjs` (or the `npm run demo:*` aliases), and require **Node.js 24 LTS**. State is written to `demo-generated/`. |
| `.github/github-app.yml` | Copilot coding agent configuration: repo guardrails, validate command, and `npm run test:security` for SQL remediation (not lodash verification). |
| `.github/CODEOWNERS`, `.github/dependabot.yml`, `.github/workflows/dependency-review.yml` | Replaceable review owner, security-update PRs without version-update PRs, and moderate-or-higher dependency review. Required checks/code-owner review are manual ruleset setup. |

## Code-to-runtime mapping methods

Defender for Cloud supports three documented mapping methods ([container image mapping](https://learn.microsoft.com/en-us/azure/defender-for-cloud/container-image-mapping)). This demo uses **all three**, so a failure in one does not lose the correlation:

1. **DevOps connector** — connecting the GitHub org triggers automated mapping tooling. No workflow changes required. *Primary.*
2. **Docker/OCI labels** — `build-and-deploy.yml` uses `docker/metadata-action` to stamp `org.opencontainers.image.source`, `.revision`, and `.url` into the image manifest. Does not require a connector.
3. **GitHub artifact attestations** — `actions/attest-build-provenance` with `push-to-registry: true`, producing cryptographically verifiable provenance linking image digest → repository → commit → build identity. See [Using artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

The same OCI annotations are also applied to the AKS deployment, so the runtime object carries repo and commit provenance too.

General prerequisites for **all** methods:

- Defender CSPM **or** Defender for Containers enabled (a limited subset of mapping ships with Defender for Containers alone).
- Image built through a CI/CD pipeline — **manually built and pushed images are not supported**.
- Image discoverable by Defender: in a supported registry, or running in a supported Kubernetes environment.

> Images built and deployed **before** the connector was created may have limited support. Build at least one image *after* connector creation.

## Runtime scope and supported surface

From [Vulnerability management for containers](https://learn.microsoft.com/en-us/azure/defender-for-cloud/agentless-vulnerability-assessment-azure):

- Registry scanning covers **OS packages (Linux and Windows)** and **language packages (Linux only)**. The Northstar Orders image is built `FROM node:24-bookworm-slim` — Debian Linux — which is what makes the npm CVE visible to registry VA.
- Runtime VA is **not supported** for containers on Windows nodes or nodes using AKS ephemeral OS disks. Autoscaled clusters may return partial results if nodes are down at scan time.
- Runtime VA scans the container **images** in use — it does not scan the container runtime layer.

Code-to-runtime recommendation surfacing is currently limited to **container and container image vulnerability assessment recommendations** ([code-to-runtime mapping](https://learn.microsoft.com/en-us/azure/defender-for-cloud/code-to-runtime-mapping)).
The container-CVE match is to Dependabot, not SQL-injection findings.
[Production context](https://docs.github.com/en/code-security/tutorials/secure-your-organization/prioritize-alerts-in-production-code)
can nevertheless enrich **both CodeQL and Dependabot** alerts.
[Defender DevOps security](https://learn.microsoft.com/en-us/azure/defender-for-cloud/defender-for-devops-introduction)
can also aggregate code, secret, and dependency findings. These are distinct
capabilities, not evidence that every finding is a runtime CVE.

## Asynchronous enrichment — documented propagation windows

Every correlation in this demo is asynchronous. Nothing is instant. Pre-stage; do not build live and expect results.

| Step | Documented window | Source |
| --- | --- | --- |
| DevOps resources (repos, builds) appear after connector creation | up to **8 hours** | [quickstart-onboard-github](https://learn.microsoft.com/en-us/azure/defender-for-cloud/quickstart-onboard-github) |
| Agentless code scanning: repository discovery | on connector creation, then every **8 hours** | [agentless-code-scanning](https://learn.microsoft.com/en-us/azure/defender-for-cloud/agentless-code-scanning) |
| Agentless code scanning: code retrieval from default branch | on setup, then **daily** | same |
| Agentless code scanning: scan duration | typically **15–60 minutes** | same |
| Container image mapping visible in Cloud Security Explorer | up to **4 hours** | [container-image-mapping](https://learn.microsoft.com/en-us/azure/defender-for-cloud/container-image-mapping) |
| Registry VA on a newly pushed image | typically **within a few hours**, then daily rescan | [agentless-vulnerability-assessment-azure](https://learn.microsoft.com/en-us/azure/defender-for-cloud/agentless-vulnerability-assessment-azure) |
| Running-container inventory (agentless discovery) | approx. every **24 hours** (near real time with the Defender sensor) | same |
| Criticality label applied to a detected container | up to **24 hours** | [deploy-sandbox](https://learn.microsoft.com/en-us/azure/defender-for-cloud/github-advanced-security-deploy-sandbox) |
| End-to-end code-to-runtime validation results | up to **24 hours** | [github-advanced-security-deploy](https://learn.microsoft.com/en-us/azure/defender-for-cloud/github-advanced-security-deploy) |
| Criticality classification propagating from Defender **to GitHub** | up to **12 hours** | same |
| Findings for a deleted ACR image cleared | usually **within 1 hour** | [agentless-vulnerability-assessment-azure](https://learn.microsoft.com/en-us/azure/defender-for-cloud/agentless-vulnerability-assessment-azure) |

Practical consequence: **the pipeline must have run, the image must have been pushed, and the workload must have been running for at least 24 hours before the demo.** Plan a T-48h pre-stage window. See [setup.md](setup.md).

## Scenario boundaries

| # | Scenario | Where it lives | Correlates to runtime? |
| --- | --- | --- | --- |
| 1 | CodeQL SQL injection in `searchOrders` (`src/database.ts`) over query-only synthetic SQLite, with Copilot Autofix where supported | GitHub code scanning; production context where available | **No container-CVE match.** Production context is supported for CodeQL too; do not conflate it with CVE matching. |
| 2 | `lodash@4.17.20` — a direct production dependency — seen by **both** Dependabot and Defender container VA | GitHub + ACR + AKS + MDC | **Yes.** This is the primary, natively supported correlation flow: Defender recommendation → Associated CVEs → Related GitHub Alerts → Remediation Insights → generated GitHub issue → Copilot coding agent PR. |
| 3 | Opt-in, newly generated, **unregistered** private key committed in the disposable copy | GitHub secret scanning / push protection; DevOps aggregation may also surface secrets | **No container-CVE match.** |

> **Scenario 3 is adjacent capability, not the same runtime-CVE match.**
> Defender DevOps aggregation is not proof of provider validity or runtime
> use. Rehearse the PKCS#8 key's actual detected type; use the custom-pattern
> canary if the generated key is not blocked.
>
> **Never use a real credential.** The key is generated fresh at demo time, is never registered with any provider, and is destroyed with the repo. See [safety-and-production-gaps.md](safety-and-production-gaps.md).

Scenario 2 is the flow to lead with. Scenarios 1 and 3 are supporting acts.

## Runtime risk factors

Runtime Risk Factors surfaced by Defender CSPM attack-path analysis and reflected on GHAS alerts ([GHAS integration overview](https://learn.microsoft.com/en-us/azure/defender-for-cloud/github-advanced-security-overview)):

- **Internet Exposure** — workload reachable from the public internet
- **Sensitive Data** — workload handles regulated or confidential data
- **Critical Resources** — workload classified as business-critical
- **Lateral Movement** — workload sits on a path an attacker could pivot through

This demo deliberately drives two of these:

- **Critical Resources** — via a resource criticality classification rule you create in setup (deterministic, operator-controlled).
- **Internet Exposure** — not seeded in the safe baseline. The Service is
  internal; do not make a vulnerable app public to obtain this signal.

**Sensitive Data** and **Lateral Movement** are environment-dependent. Do not promise them.

On the GitHub side these appear as alert filters such as `has:deployment` and `runtime-risk:internet-exposed` ([prioritizing alerts using production context](https://docs.github.com/en/code-security/tutorials/secure-your-organization/prioritize-alerts-in-production-code)).

## Identity and secrets model

- GitHub Actions authenticates to Azure with **OIDC workload identity federation** using `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. No client secret is stored.
- ACR push uses a short-lived token obtained via `az acr login --expose-token` (keyed on `ACR_NAME`) **after** the OIDC login, and masked in the log. The image reference is composed from `ACR_LOGIN_SERVER`. No admin username or password is stored anywhere.
- AKS is addressed by `AKS_NAME` inside `AZURE_RESOURCE_GROUP`, using `kubelogin` with the federated identity — not cluster admin credentials.
- Deployment is gated by two **repository** variables: `DEMO_ENVIRONMENT` (which environment to target) and `DEMO_CONFIGURED` (must equal `true` or the job is skipped). This means a fork of the public template cannot deploy anywhere by accident — the gate is closed until an operator opens it.
- The Microsoft sandbox walkthrough uses ACR admin username/password repository secrets; this demo intentionally does **not**, because a demo that teaches credential storage undercuts the secret-scanning message.
- Secret scenarios use only synthetic, unregistered material: the generated
  key in scenario 3 and optional custom-pattern/password canaries in private
  rehearsal branches. None authenticates to a service.

### Variable contract

| Scope | Name | Role |
| --- | --- | --- |
| Environment | `AZURE_CLIENT_ID` | OIDC federated identity |
| Environment | `AZURE_TENANT_ID` | Entra tenant |
| Environment | `AZURE_SUBSCRIPTION_ID` | Target subscription |
| Environment | `AZURE_RESOURCE_GROUP` | Resource group for ACR and AKS |
| Environment | `ACR_NAME` | Registry short name, for `az acr login` |
| Environment | `ACR_LOGIN_SERVER` | Registry host, for the image reference |
| Environment | `AKS_NAME` | Cluster name |
| Repository | `DEMO_ENVIRONMENT` | Environment the deploy job targets (defaults to `demo` when unset) |
| Repository | `DEMO_CONFIGURED` | Deployment gate — must be exactly `true` |

Exact values, defaults, and how they are set: see [setup.md](setup.md).

### Deployment and privilege model

The split between "what setup does" and "what CI does" is a least-privilege boundary, not an accident:

| Object | Applied by | Why |
| --- | --- | --- |
| `deploy/k8s/namespace.yaml` | An **operator with cluster-admin**, once (via `setup-demo.mjs`) | The cluster runs with Azure RBAC and local accounts disabled. The workflow identity holds **AKS RBAC Writer scoped to the namespace only**, which can read but not create namespaces. |
| `deploy/k8s/deployment.yaml` | The **workflow**, after rendering | Needs the image digest, which only exists after the build. |
| `deploy/k8s/service.yaml` | The **workflow** | Applied unmodified. |

The workflow **must not** apply `namespace.yaml`. If you would rather it owned the namespace, deploy the infrastructure with `grantWorkflowClusterAdmin=true` — at the cost of the least-privilege property.

### Image rendering

`deployment.yaml` ships with a single `__IMAGE__` placeholder on its `image:` line. The workflow replaces it with the immutable digest reference and validates the substitution twice:

1. The token must appear **exactly once** — not zero times, not twice.
2. No `__IMAGE__` may survive rendering (re-checked with `grep` after the substitution).

Either condition failing fails the job. The result is that a deploy cannot ship a manifest with an unresolved, duplicated, or mutable image reference — the running pod is always pinned to `sha256:…`, which is also the identity Defender correlates on.

### Pod security

The namespace enforces the **restricted** Pod Security Standard (`pod-security.kubernetes.io/enforce: restricted`, with `audit` and `warn` set to match). The pod spec is written to satisfy it: `runAsNonRoot`, `readOnlyRootFilesystem` (with a 64Mi in-memory `emptyDir` mounted at `/tmp`, which Node still needs), `allowPrivilegeEscalation: false`, all capabilities dropped, and a `RuntimeDefault` seccomp profile — plus CPU/memory requests and limits, and startup, readiness, and liveness probes.

This is deliberate: the demo's vulnerabilities are in **application code and dependencies**, not in the workload's runtime posture. A regression that adds a privileged container is rejected by the API server rather than discovered later.

Exact variable names, scopes, and workflow wiring: see [setup.md](setup.md).

## Operator tooling contracts

The scripts under `scripts/` are deliberately narrow. Knowing where each one stops is as important as knowing what it does.

| Script | Does | Explicitly does **not** do |
| --- | --- | --- |
| `preflight.mjs [--cloud]` | Verifies local tooling — Node.js **exactly major 24**, npm, Git, Azure CLI. `--cloud` adds cloud-context checks. | Change anything. |
| `setup-demo.mjs` | Provisions resource group, ACR, AKS, the federated deployment identity; creates the GitHub environment; sets the seven environment variables and the two repository gate variables; bootstraps the Kubernetes **namespace** (retrying while Azure RBAC propagates). | Apply `deployment.yaml` or `service.yaml` — the workflow owns those. Enable **any** paid GitHub security setting unless `--configure-github-security` is passed. Enable **any** Defender for Cloud plan. Create the Defender GitHub connector. Set `DEMO_CONFIGURED` when `--skip-kubernetes-bootstrap` is used. |
| `verify-demo.mjs` | Checks public/private source, variables, resources, internal Service, expected deployed/running image digest and forwarded synthetic health. | Verify Defender-side assessment closure; it reports that as pending. Security API availability is reported separately. |
| `generate-demo-secret.mjs` | Generates the scenario 3 RSA-2048 PKCS#8 key; discards the public key. `--clean` removes it. | Run against a public repo. Run without `--acknowledge-disposable-private-repo`. Commit or push anything. |
| `cleanup-demo.mjs --confirm <rg>` | Deletes the Azure resource group from `demo-generated/deployment-state.json`, plus the seven environment variables and the `DEMO_CONFIGURED` / `DEMO_ENVIRONMENT` repository variables. Idempotent. | Delete the GitHub repo, the Defender connector, the criticality rule, or disable Defender plans. Run without an exact resource-group match. |

Two guardrails are enforced in code, not just documented:

- **Private secret rehearsal required.** Only `generate-demo-secret.mjs`
  requires `PRIVATE`; setup accepts public/private source. Paid GitHub
  auto-configuration remains private-only and explicit.
- **Paid enablement is never implicit.** `setup-demo.mjs` touches GitHub security settings only behind `--configure-github-security`, and it never enables a Defender plan or creates a connector under any flag. Instead, the Bicep template emits a `manualFollowUpSteps` list that the script prints — naming Defender CSPM, agentless code scanning, agentless container coverage, the GitHub connector, and GHAS enablement as **REQUIRED** operator actions, and Defender for Containers as **OPTIONAL and not needed** for this demo path.

A third consistency check runs at setup time: the script reads the namespace out of `deploy/k8s/namespace.yaml` and **fails if it does not match** the Bicep `kubernetesNamespace` output — so the manifest and the infrastructure cannot silently disagree.

## Reference links

Microsoft Learn:
- [GHAS integration with Defender for Cloud — overview](https://learn.microsoft.com/en-us/azure/defender-for-cloud/github-advanced-security-overview)
- [Deploy GHAS integration with Defender for Cloud](https://learn.microsoft.com/en-us/azure/defender-for-cloud/github-advanced-security-deploy)
- [Deploy GHAS integration — sandbox project](https://learn.microsoft.com/en-us/azure/defender-for-cloud/github-advanced-security-deploy-sandbox)
- [Connect your GitHub organizations](https://learn.microsoft.com/en-us/azure/defender-for-cloud/quickstart-onboard-github)
- [Configure agentless code scanning (preview)](https://learn.microsoft.com/en-us/azure/defender-for-cloud/agentless-code-scanning)
- [Map container images from code to runtime](https://learn.microsoft.com/en-us/azure/defender-for-cloud/container-image-mapping)
- [Use code-to-runtime visibility for security recommendations](https://learn.microsoft.com/en-us/azure/defender-for-cloud/code-to-runtime-mapping)
- [Vulnerability management for containers](https://learn.microsoft.com/en-us/azure/defender-for-cloud/agentless-vulnerability-assessment-azure)
- [Critical assets protection](https://learn.microsoft.com/en-us/azure/defender-for-cloud/critical-assets-protection)
- [Defender CSPM](https://learn.microsoft.com/en-us/azure/defender-for-cloud/concept-cloud-security-posture-management)
- [Cloud Security Explorer](https://learn.microsoft.com/en-us/azure/defender-for-cloud/how-to-manage-cloud-security-explorer)
- [DevOps support and prerequisites](https://learn.microsoft.com/en-us/azure/defender-for-cloud/devops-support)

GitHub Docs:
- [Code scanning with CodeQL](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-code-scanning)
- [GitHub security and quality AI features (Copilot Autofix application card)](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features)
- [About GitHub Copilot cloud (coding) agent](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent)
- [Secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)
- [Supported secret scanning patterns](https://docs.github.com/en/code-security/reference/secret-security/supported-secret-scanning-patterns)
- [Push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection)
- [Artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)
- [Linked artifacts](https://docs.github.com/en/code-security/concepts/supply-chain-security/linked-artifacts)
- [Prioritizing alerts using production context](https://docs.github.com/en/code-security/tutorials/secure-your-organization/prioritize-alerts-in-production-code)
- [Organization security configurations](https://docs.github.com/en/code-security/concepts/security-at-scale/organization-security)
