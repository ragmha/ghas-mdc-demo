# Setup

End-to-end setup for the public GHAS + Microsoft Defender for Cloud demo.

## Public source and feature availability

Public source is supported; the cloud workload remains **internal**.
No script creates a connector or enables Defender plans. Obtain explicit
owner approval before provisioning, changing paid settings, or seeding alerts.

| Target | Demonstrable capabilities and prerequisites |
| --- | --- |
| Personal public `ragmha/ghas-mdc-demo` | Local app, CI, CodeQL, dependency graph/review, Dependabot, public artifact attestations, and repository secret scanning/push protection where enabled. Security settings and restricted alerts require maintainer access. No organization overview/campaigns are implied. |
| Organization-owned public copy | Same public-source capabilities plus team ownership and org policies. Organization dashboards, campaigns, delegated bypass, custom/AI secret controls depend on their feature-specific plan, role, policy and rollout; verify in that org before presenting. |
| Full MDC integration | Commercial Azure subscription, Defender CSPM, authorized GitHub connector, GitHub organization owner and Azure roles, plus the GHAS entitlement documented by Microsoft. Public visibility alone does not establish integration eligibility. Confirm the selected org's entitlement with its admin. |
| Optional private copy | Useful for controlled secret-canary rehearsal; private CodeQL/secret capabilities need licensed products. Private build attestations require GitHub Enterprise Cloud. It is not required for the public-source app/dependency loop. |

Sources: [GitHub feature availability](https://docs.github.com/en/code-security/getting-started/github-security-features),
[security overview](https://docs.github.com/en/code-security/concepts/security-at-scale/security-overview),
[MDC prerequisites](https://learn.microsoft.com/en-us/azure/defender-for-cloud/github-advanced-security-overview).
Do not turn on paid products merely to follow this guide. If a capability is
unavailable, use the repository-level flow and identify the optional segment.

## Repeatable rehearsal and observable pass criteria

Use an authorized disposable **organization-owned public copy** for remote
rehearsal; the personal public authoring repo remains usable locally.
Capture evidence locally under ignored `demo-generated/`, never tenant data
or screenshots with identifiers in this public repository.

1. **Baseline:** record the source commit with `git rev-parse HEAD`; run
   `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`,
   and `node --test tests/runtime.test.mjs`. Expect these to pass.
   `npm run test:security` must fail while the documented SQL seed remains.
   Record a chosen open lodash advisory, its affected range and fixed version.
2. **Prevent:** rehearse §2d's never-merge dependency PR. Pass means the
   moderate-or-higher check fails and required rules block merging.
   Secret scenarios remain opt-in in a disposable private copy; no public
   token/key/password seeding is part of this rehearsal.
3. **Deploy baseline:** after explicit tenant approval, follow §3-§8.
   Pass means Actions builds and attests a source-labelled image, deploys
   `orders-portal@sha256:...`, and its authenticated port-forward smoke test
   confirms `syntheticData: true`. Service must remain internal.
4. **Prove identity:** retrieve the exact image reference from the Actions
   build/deployment, start an authenticated port-forward in a second terminal:

   ```powershell
   kubectl --kubeconfig demo-generated/kubeconfig -n ghas-mdc-demo port-forward service/orders-portal 3000:80 --address 127.0.0.1
   ```

   Then run:

   ```powershell
   node scripts/verify-demo.mjs --expected-image "<registry>/orders-portal@sha256:<64-hex-digest>" --health-url http://127.0.0.1:3000
   gh attestation verify "oci://<registry>/orders-portal@sha256:<64-hex-digest>" --repo "<org>/<repo>"
   ```

   Pass means the desired deployment, observed rollout generation, and all
   active ready pods match that digest, plus synthetic health and provenance.
   Missing/mismatched evidence fails; Defender remediation is printed
   **PENDING**, not inferred from these checks.
5. **Detect and hand off:** after propagation, show the selected CVE on
   that image/resource in Defender, its Related GitHub Alert and source/commit.
   Generate the issue, verify owner/context, and use reviewed source remediation.
   Missing correlation is **pending/unavailable**, not a passing rehearsal.
6. **Fix separately:** in a PR use `npm install --save-exact lodash@<verified-fixed-version>`
   and inspect both manifest and lockfile against the live advisory range.
   Run normal CI and review before merge. Do not repair SQL in this dependency
   PR. The SQL test still fails by design; a separate parameterized-query PR
   must pass it. Never bypass required reviews to stage a fix.
7. **Verify runtime closure:** deploy the reviewed commit, repeat step 4
   with the **new** digest, and wait for Defender's next assessment. In the
   portal, record resource, digest, assessment timestamp after deployment and
   the selected CVE's absence/resolution for that same image. Absence of a
   scan/resource is **unavailable**, not fixed. A stale assessment is
   **pending**; an old/wrong digest is **mismatch**. A closed issue or a green
   script alone does not establish runtime remediation.
8. **Repeat without reset:** keep baseline and remediation commit IDs and
   dated evidence. Use a fresh disposable copy/environment at the recorded
   baseline commit for the next run. Do not force-push, undo an approved fix,
   or automatically re-seed `main`. Delete billable resources after rehearsal.

The application is **Northstar Orders** — a fictional enterprise inner-source order portal running on **synthetic** data, deliberately vulnerable for demonstration purposes. It does not represent any real company or customer. See [architecture.md](architecture.md#the-application-northstar-orders).

**Read [architecture.md](architecture.md) first**, especially the propagation-window table. Correlation is asynchronous. Budget **T-48 hours** before the demo.

> The repository ships operator scripts under `scripts/`. Where a script exists, it is the fastest path and is shown first; the portal/CLI equivalent is given so you know what it does. Scripts write state to `demo-generated/`, which is not committed.

Repository scripts (plain Node ESM — all require **Node.js 24 LTS**):

| Script | Purpose | Guardrail |
| --- | --- | --- |
| `node scripts/preflight.mjs [--cloud]` | Verifies local tooling: Node.js 24 LTS, npm, Git, Azure CLI, GitHub CLI, Docker CLI+daemon, kubectl. `--cloud` also checks Azure/GitHub CLI auth. | Read-only |
| `node scripts/setup-demo.mjs …` | Provisions the Azure foundation, creates the GitHub environment, sets the seven environment variables and the two repository gate variables, bootstraps the Kubernetes **namespace** | **Aborts unless the target repo is `PRIVATE`.** Never enables Defender plans or connectors. Touches paid GitHub settings only with `--configure-github-security`. |
| `node scripts/verify-demo.mjs --expected-image … --health-url …` | Checks public/private source, variables, resources, internal Service, rollout and running digests, and forwarded synthetic health | Security API limitations are warnings; Defender assessment remains manual/pending |
| `node scripts/generate-demo-secret.mjs --acknowledge-disposable-private-repo` | Generates the scenario 3 unregistered key | **Aborts unless the repo is `PRIVATE`** and the acknowledgement flag is present |
| `node scripts/cleanup-demo.mjs --confirm <resource-group>` | Deletes the Azure resource group and the demo GitHub variables | Aborts unless the confirmation string exactly matches the state file |

> **The scripts stop at the paid boundary, by design.** `setup-demo.mjs` never enables a Defender for Cloud plan and never creates the Defender GitHub connector — under any flag. Those are §4–§6 below, and they stay manual because they are billable, consequential, and require interactive authorization.

---

## 0. Prerequisites

Confirm **all** of these before starting. Missing any one of them breaks the correlation flow, usually silently.

### GitHub

| Requirement | Notes |
| --- | --- |
| GitHub organization, and you are an **organization owner** | Required to install the Defender for Cloud GitHub App and to create security campaigns. |
| A public or private source repository | Public is the primary source path. Only the optional secret generator requires a disposable **private** repo. |
| **GHAS / GitHub Code Security** on the demo repository | Paid. Required for CodeQL on a private repo and for the Defender integration. **Explicit operator action** — not on by default. |
| **GitHub Secret Protection**, with **generic patterns** and **push protection** enabled | Paid. Required for scenario 3. **Explicit operator action.** |
| **Copilot coding agent** available to the org and the demo repo | Required for the scenario 2 finale. Requires a Copilot licence with the coding agent enabled by an org admin. |
| GitHub Actions enabled, with an environment named `demo` (or whatever you set `DEMO_ENVIRONMENT` to) | See §3. |

Supported GitHub plans for the Defender connector: GitHub Free, Pro, Team, and Enterprise Cloud (personal accounts and Enterprise Managed Users). GHAS features themselves require an appropriate paid plan.

### Azure

| Requirement | Notes |
| --- | --- |
| Azure subscription in **commercial cloud** | The GHAS integration is **not available** in Azure Government, Azure operated by 21Vianet, or other sovereign clouds. |
| **Defender CSPM (DCSPM)** enabled on the subscription | Required. **Explicit operator action** — it is a paid plan and is not on by default. |
| **Security Admin** on the subscription | Required to view findings and manage plans. |
| **Contributor** on the subscription | Required to create the GitHub connector. |
| **Account Administrator** access to the Azure portal | Per the connector quickstart. |
| Resource providers registered | `Microsoft.ContainerRegistry`, `Microsoft.ContainerService`, `Microsoft.Security`. |
| Region supported for agentless code scanning | Australia East, Canada Central, Central US, East Asia, East US, North Europe, Sweden Central, UK South, West Europe. |

> **Security Reader** on the resource group or connector scope is sufficient for read-only viewing of DevOps posture assessments, if you want to grant a colleague access without subscription-level privilege.

### Tooling

**Node.js 24 LTS is required — exactly major 24.** `package.json` declares `engines.node: "24.x"`, and `preflight.mjs` fails if `process.versions.node` is any other major. A newer Node (25+) will **not** pass, so use a version manager rather than your system default if necessary.

```powershell
node --version                      # must be v24.x
node scripts/preflight.mjs          # local tooling
node scripts/preflight.mjs --cloud  # also validates Azure CLI + GitHub CLI authentication
```

`preflight.mjs` checks: **Node.js 24 LTS**, npm, Git, Azure CLI, GitHub CLI, Docker CLI **and daemon**, and kubectl. With `--cloud` it additionally verifies you are authenticated to both Azure CLI and GitHub CLI. It rejects any flag other than `--cloud`.

Convenience npm aliases exist for the operator scripts; either form works:

| npm alias | Equivalent |
| --- | --- |
| `npm run preflight` | `node scripts/preflight.mjs` |
| `npm run demo:setup` | `node scripts/setup-demo.mjs` |
| `npm run demo:verify` | `node scripts/verify-demo.mjs` |
| `npm run demo:secret` | `node scripts/generate-demo-secret.mjs` |
| `npm run demo:cleanup` | `node scripts/cleanup-demo.mjs` |

> To pass flags through an alias, use `--`: `npm run demo:setup -- --what-if …`. This guide uses the explicit `node scripts/…` form throughout to avoid that pitfall.

### Registry portability

`.npmrc` sets `omit-lockfile-registry-resolved=true`, so `package-lock.json` carries **no hard-coded registry host**. The lockfile therefore installs cleanly from npmjs.org **or** from an enterprise registry mirror or proxy, which matters if you are demoing inside a customer network that does not allow direct npmjs.org access.

Practical consequences:

- Do not commit a lockfile regenerated with that setting disabled — it will pin `resolved` URLs to whichever registry you used and break other operators.
- If `npm ci` fails on registry resolution, check `.npmrc` survived, and that your `npm config get registry` points somewhere reachable.
- The Copilot coding agent's `lodash` upgrade PR will regenerate the lockfile. It runs with this `.npmrc` in place, so the result stays registry-neutral.

---

## 1. Create the authorized organization copy

The public template runs locally as-is. For the full tenant integration, use
an authorized organization-owned public copy; do not modify customer repos.

```powershell
$ORG  = "<your-licensed-org>"
$REPO = "ghas-mdc-demo-<yyyymmdd>"

gh repo fork ragmha/ghas-mdc-demo --org "$ORG" --fork-name "$REPO" --clone
cd $REPO
```

Alternatively use GitHub's fork flow into the authorized org. For optional
secret seeding use a separate private copy with its own approvals.

This revision is published on `ragmha-ghas-mdc-demo-gap-fill`. If it has
not yet been merged upstream, carry that reviewed branch into the org
copy's `main` through a normal reviewed PR **before** enabling deployment.
The deployment workflow deliberately refuses feature-branch dispatches.
Enable Actions explicitly in a fork and select it as the default `gh` repo
with `gh repo set-default "$ORG/$REPO"` so checks target the approved copy.

Confirm it, because the scripts will refuse otherwise:

```powershell
gh repo view "$ORG/$REPO" --json nameWithOwner,visibility
# expect the approved name and "visibility": "PUBLIC"
```

Record the value — you will need `$ORG/$REPO` throughout.

---

## 2. Enable GitHub security features (operator action)

Use the capability matrix above first. Public-source CodeQL, dependency
review and Dependabot do not require purchasing the private-repository
products. Organization configurations and private paid capabilities below
require an authorized operator and the applicable entitlement; nothing is
enabled by publishing this source.

### 2a. Apply a security configuration (recommended)

Org-level security configurations are the supported way to switch these on consistently. See [Organization security configurations](https://docs.github.com/en/code-security/concepts/security-at-scale/organization-security).

Portal steps:

1. GitHub → your **organization** → **Settings** → **Advanced Security** → **Configurations**.
2. Create a configuration (or use the GitHub-recommended one) with:
   - **Code scanning** — leave as **Not set** (the repo runs its own `codeql.yml`; see §2c)
   - **Copilot Autofix** — **On**
   - **Dependency graph** and **Dependabot alerts** — **On**
   - **Dependabot security updates** — **On**
   - **Secret scanning** — **On**
   - **Secret scanning: generic / non-provider patterns** — **On**
   - **Secret scanning: push protection** — **On**
3. **Apply to** → select the disposable repo → **Apply**.
4. Confirm the repo now shows **Advanced Security: Enabled**.

Alternatively, `scripts/setup-demo.mjs --configure-github-security` applies the equivalent repository settings (`advanced_security`, `secret_scanning`, `secret_scanning_push_protection`, `secret_scanning_non_provider_patterns`). It is **opt-in by flag** precisely because it incurs charges — the script deliberately leaves these untouched unless you ask.

### 2b. Verify at the repository level

Repo → **Settings** → **Advanced Security**. Every item above should read **Enabled**.

### 2c. Confirm CodeQL is analysing the right language

Northstar Orders is TypeScript. This repository uses **advanced setup** — `.github/workflows/codeql.yml`, with `languages: javascript-typescript` and the `security-extended` query suite ([CodeQL code scanning](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-code-scanning)).

> **Do not enable CodeQL *default* setup.** Default setup supersedes the workflow and would drop the `security-extended` queries. If your org security configuration turns on default setup automatically, set code scanning to **Not set** in the configuration and let the committed workflow run.

Verify the analysis completed: **Actions** → *CodeQL* → latest run green, then **Security and quality** → **Code scanning** shows alerts.

```powershell
gh workflow run codeql.yml --repo "$ORG/$REPO"
```

> Copilot Autofix generates fix suggestions for **CodeQL** alerts on pull requests and the default branch. It does **not** require a Copilot subscription. Coverage is not uniform across every alert type — treat autofix as "where supported", and have the fallback in [presenter-runbook.md](presenter-runbook.md) ready.

### 2d. Ownership and dependency prevention

1. The public authoring template ships `@ragmha`, its personal-repository
   owner, in `.github/CODEOWNERS`. In the licensed org copy, replace it with a
   real visible team with **explicit write access** to the disposable repo.
   Check GitHub's CODEOWNERS error display. CODEOWNERS requests PR reviews,
   not generic issue assignment;
   Microsoft's [integration overview](https://learn.microsoft.com/en-us/azure/defender-for-cloud/github-advanced-security-overview)
   describes MDC-generated issue routing to code owners, so rehearse it and
   verify the actual issue assignee. Require **code-owner review** separately
   in the branch ruleset. Have a second, authorized code-owner reviewer ready:
   a PR author cannot approve their own PR.
2. Confirm **Dependency graph**, **Dependabot alerts**, and **Dependabot
   security updates** are enabled. `.github/dependabot.yml` sets
   `open-pull-requests-limit: 0` to disable **version-update** PRs, not
   security-update PRs. There is deliberately **no lodash ignore rule**:
   it would suppress the security fix we want to show. Dependabot only opens
   PRs; leave them unmerged until the live fix. Disable any org bot/rule that
   automatically merges dependency updates in this disposable repo.
3. Run a rehearsal PR so the **Review dependency changes** and
   **Analyze JavaScript/TypeScript** checks exist. Repo **Settings → Rules →
   Rulesets**: create/adjust an active branch ruleset targeting `main`, require
   PRs, code-owner review, and those status checks, and avoid using a bypass
   actor for the demo. Retain the existing CI check as required too.
   A failed action alone does **not** prevent merging.
4. Pre-stage a **never-merge** PR adding a new direct vulnerable dependency,
   not the already-present lodash pin. On a throwaway branch in the authorized
   copy, run:

   ```powershell
   git switch -c demo/dependency-review
   npm install --package-lock-only --ignore-scripts --save-exact minimist@1.2.5
   git add package.json package-lock.json
   git commit -m "demo: introduce vulnerable dependency on PR only"
   ```

   Push that branch to the disposable copy and open a PR targeting `main`.
   Expect dependency review to fail for
   [CVE-2021-44906 / GHSA-xvch-5gv4-984h](https://github.com/advisories/GHSA-xvch-5gv4-984h)
   (critical prototype pollution; fixed in 1.2.6). The workflow rejects
   **moderate and higher** vulnerabilities, in both production and development
   dependencies. Check the live advisory and failed log before presenting.
   Close the PR without merging; never deploy this branch.
5. From the existing F-1 CodeQL alert, stage an **Autofix-generated PR** where
   offered, leave it open, and wait for its CodeQL PR check. Show the suggested
   diff and resolved finding on that PR. An unrelated PR does not introduce
   the SQL injection afresh: an existing default-branch alert is not proof of
   a new PR alert. If Autofix is unavailable, show the existing alert and a
   manually staged parameterized-query PR, labelled as manual.

References: [dependency review configuration](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/customize-dependency-review-action),
[Dependabot security-update customization](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/manage-your-dependency-security/customizing-dependabot-security-prs),
[code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

### 2e. Secret prevention and triage (manual, private copy only)

These settings are **not** configured or checked by the operator scripts.
Org/enterprise policy may control them; rehearse with the actual accounts.

| Capability | Setup and safe evidence |
| --- | --- |
| Repo-level custom pattern | Repo **Settings → Advanced Security → Secret Protection → Custom patterns → New pattern**. Name it `Northstar demo canary`, set **Secret format** to `NST_DEMO_[A-Z0-9]{24}`, test with a matching synthetic string in the pattern editor, then **Save and dry run**. Inspect results, publish the pattern, and enable its **Push protection**. Keep the matching value out of `main`; attempt it only on a throwaway branch in the private copy and capture the rejection. Nothing authenticates with this invented format. |
| Delegated bypass | Configure at **organization** level for this demo: **Settings → Advanced Security → Configurations**, edit the custom configuration, enable push protection, set **Bypass privileges → Specific actors**, and select the designated reviewer actors. Apply only to the disposable repo. Use a contributor account **not** in that list to request bypass and a separate authorized reviewer to approve/deny it. Do not exempt the contributor. Current docs also support repository/enterprise configuration; org policy can override repo settings. |
| Copilot secret scanning / generic passwords | Repo **Settings → Advanced Security → Secret Protection → Scan for AI-detected secrets → Enable** (older UI: **Scan for generic passwords**). This is separate from regex-based non-provider patterns and needs no Copilot subscription. In a throwaway private branch, commit a clearly synthetic password assignment with realistic context, never a service credential. Wait for the **AI-detected/generic** alert list and capture the result. Detection is probabilistic; if no alert appears, show the setting and disclose that rather than promise detection or push blocking. |
| Secret validity checks | At the same repo settings page, enable **Validity checks** and save changes if prompted. Checks send **supported provider tokens to their provider**; get the owner's consent before enabling. Use the configuration and supported-pattern documentation as evidence, not a live credential. Our unregistered key, custom canary, and fake password cannot demonstrate an **active** provider token. |

For the custom pattern, enter the prefix `NST_DEMO_` followed immediately by
24 uppercase letters in the pattern editor or disposable rehearsal branch.
No full matching value is committed here, so the pattern does not flag its
own setup instructions. Prefer this
deterministic pattern for the delegated-bypass rehearsal; retain the existing
RSA scenario as the optional built-in-pattern demonstration.
If showing an approved bypass, push only the synthetic canary, inspect the
request/reviewer audit trail and resulting alert, then delete the disposable
repo after the session. For a denial, keep the rejected request as evidence.

Official instructions:
[custom patterns](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/customize-leak-detection/define-custom-patterns),
[delegated bypass](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/manage-bypass-requests/enable-delegated-bypass),
[AI-detected secrets](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/detect-secret-leaks/enabling-secret-scanning-for-ai-detected-secrets),
[validity checks](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/customize-leak-detection/enabling-validity-checks-for-your-repository).

### 2f. Prepare the leadership close

Org **Security and quality → Overview**: select the demo repo and date range,
and capture Detection, Remediation, and Prevention trends. **Risk** shows
the current alert backlog; **Coverage** shows feature adoption. A fresh repo
may have too little history to show a meaningful trend. Use dated rehearsal
captures; do not invent before/after numbers. Summary views omit generic
secret alerts, so show the dedicated alert list for the synthetic password.

With the organization owner's approval, org **Security and quality →
Assessments → Scan your organization** runs the secret risk assessment
(and may also start an initial code security risk assessment). This scans
the organization, not just this repo: use an authorized demo org and prepare
the report ahead of time. A secret risk assessment can only be generated
once every **90 days**; use an existing dated report if appropriate.
It is a baseline exposure assessment, not an instant post-fix score.

Prepare a dated, completed rehearsal of the F-2 fix: reviewed PR merged,
new attested image digest deployed, registry/runtime scans refreshed,
and the affected recommendation/resource no longer reporting the chosen CVE.
Keep the live seed unmerged; use a separate disposable rehearsal environment
or captures from a prior run. Separately capture issue assignment/status
sync in Defender. A closed issue is **not** proof the workload is fixed,
and the SQL regression test does **not** verify the lodash upgrade.

References: [security overview](https://docs.github.com/en/code-security/concepts/security-at-scale/security-overview),
[secret risk assessment](https://docs.github.com/en/code-security/how-tos/secure-at-scale/configure-organization-security/configure-specific-tools/assess-your-secret-risk).

---

## 3. Provision Azure and configure the `demo` environment

`scripts/setup-demo.mjs` does the whole foundation in one pass: resource group, ACR, AKS, the federated deployment identity, the GitHub environment, the seven environment variables, the two repository gate variables, and the **Kubernetes namespace bootstrap**.

```powershell
node scripts/setup-demo.mjs `
  --subscription <subscription-id> `
  --location westeurope `
  --prefix ghasmdcdemo `
  --github-org $ORG `
  --github-repo $REPO `
  --github-environment demo
```

Useful flags:

| Flag | Effect |
| --- | --- |
| `--what-if` | Dry run — review before committing |
| `--github-environment demo` | Name of the GitHub environment to create. Also written to the `DEMO_ENVIRONMENT` repository variable. Default `demo`. |
| `--node-vm-size Standard_B2as_v2` | AKS node size. **Default `Standard_B2as_v2`** — keep it small. |
| `--operator-principal-id <entra-object-id>` | Grants that principal **cluster-admin** on the AKS cluster (Bicep `clusterAdminPrincipalIds`), so a human can bootstrap the namespace and inspect the cluster |
| `--configure-github-security` | Also applies the paid GitHub security settings from §2a |
| `--skip-kubernetes-bootstrap` | Skip installing kubectl/kubelogin and applying `namespace.yaml`. **Leaves `DEMO_CONFIGURED` unset**, so the deploy workflow stays gated off until you bootstrap the namespace and set it yourself. |

Provisioning is defined in **`infra/main.bicep`** — a subscription-scoped deployment. The script runs `az bicep build` first, writes the parameter file to `demo-generated/deployment-parameters.json`, and deploys as `‹prefix›-ghas-mdc`. `--what-if` runs `az deployment sub what-if` and **exits without deploying**, so it is safe to run first.

Relevant Bicep defaults, if you deploy the template directly rather than through the script:

| Parameter | Default |
| --- | --- |
| `prefix` | `ghasmdc` |
| `resourceGroupName` | `rg-${prefix}` |
| `kubernetesNamespace` | `ghas-mdc-demo` |
| `kubernetesNodeSize` | `Standard_B2as_v2` |
| `kubernetesNodeCount` | `1` |
| `githubEnvironment` | `demo` |
| `federateDefaultBranch` | `false` — the script always passes `false`, so **only** the environment subject is federated |
| `grantWorkflowClusterAdmin` | `false` — the workflow cannot create the namespace |

### The namespace bootstrap contract

This is the one privilege boundary worth understanding, because it explains why setup and deploy are split.

- The AKS cluster runs with **Azure RBAC and local accounts disabled**.
- The GitHub Actions identity is granted **Azure Kubernetes Service RBAC Writer**, scoped to the `ghas-mdc-demo` namespace **only**. That role can *read* namespaces but **cannot create** them.
- Therefore `deploy/k8s/namespace.yaml` is applied **once, by an operator holding cluster-admin** — which is what `setup-demo.mjs` does for you. The workflow must never apply it.
- `setup-demo.mjs` retries the namespace apply up to 30 times (10s apart) while Azure RBAC role assignments propagate. Waiting is normal, not a fault.

The namespace also enforces the **restricted** Pod Security Standard (`pod-security.kubernetes.io/enforce: restricted`), so a regression that introduces a privileged container or host mount is rejected by the API server rather than discovered later.

> If you would rather let the workflow own the namespace, deploy the infrastructure with `grantWorkflowClusterAdmin=true` instead. That trades least-privilege for convenience — the default is the safer arrangement.

The script **intentionally does not** enable paid Defender plans or create the Defender GitHub connector — under any flag. Those remain explicit operator actions: §4 and §5.

Setup accepts public/private source; secret generation remains private-only.

The script **intentionally does not** enable paid Defender plans or create the Defender GitHub connector — under any flag. Those remain explicit operator actions: §4 and §5.

The optional paid GitHub configuration flag is reserved for private copies;
configure available public-source features manually.

State is written to `demo-generated/deployment-state.json`, plus a scoped `demo-generated/kubeconfig` and local `demo-generated/bin/` tooling. Cleanup reads that state file.

> Choose a `--location` from the **agentless code scanning** supported regions: Australia East, Canada Central, Central US, East Asia, East US, North Europe, Sweden Central, UK South, West Europe.

### What gets created

| Resource | Naming |
| --- | --- |
| Resource group | derived from `--prefix` |
| ACR | derived from `--prefix` (globally unique, lowercase alphanumeric) |
| AKS | derived from `--prefix`, **Linux** node pool, default VM size `Standard_B2as_v2` |
| Federated identity | subject `repo:<ORG>/<REPO>:environment:demo`, issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange` |
| Kubernetes objects | namespace `ghas-mdc-demo`, deployment `orders-portal`, service `orders-portal` (`type: LoadBalancer`) |

> The federated credential subject uses the environment name. If you pass `--github-environment` something other than `demo`, the subject becomes `repo:<ORG>/<REPO>:environment:<that-name>` and `DEMO_ENVIRONMENT` is set to match. Keep the two aligned.

> Node OS must be **Linux**. Runtime vulnerability assessment does not support Windows nodes or nodes using AKS ephemeral OS disks, and language-package (npm) scanning is Linux-only. Getting this wrong silently removes the lodash CVE from Defender results — which is the entire scenario 2.

### The `demo` environment variables

The workflow reads **seven environment variables** (`vars.*`, scoped to the GitHub environment) plus **two repository variables**. `setup-demo.mjs` sets all of them.

**Environment-scoped** (on the environment named by `DEMO_ENVIRONMENT`, default `demo`):

| Name | Example | Purpose |
| --- | --- | --- |
| `AZURE_CLIENT_ID` | `00000000-0000-0000-0000-000000000000` | Deployment identity used for OIDC federation |
| `AZURE_TENANT_ID` | `00000000-0000-0000-0000-000000000000` | Entra tenant |
| `AZURE_SUBSCRIPTION_ID` | `00000000-0000-0000-0000-000000000000` | Target subscription |
| `AZURE_RESOURCE_GROUP` | `rg-ghasmdcdemo` | Resource group holding ACR and AKS |
| `ACR_NAME` | `acrghasmdcdemo` | ACR name **without** `.azurecr.io` — used for `az acr login --expose-token` |
| `ACR_LOGIN_SERVER` | `acrghasmdcdemo.azurecr.io` | Fully-qualified registry host — used to compose the image name. **Required**; the workflow fails fast if it is empty. |
| `AKS_NAME` | `aks-ghasmdcdemo` | AKS cluster name |

> `ACR_NAME` and `ACR_LOGIN_SERVER` are both required and are **not** interchangeable. The workflow authenticates with the short name and builds the image reference from the login server, so it never needs an `az acr show` round-trip.

**Repository-scoped** (repo level, not environment level) — these gate the deployment:

| Name | Value | Purpose |
| --- | --- | --- |
| `DEMO_ENVIRONMENT` | `demo` | Names the environment the deploy job targets. The workflow resolves `${{ vars.DEMO_ENVIRONMENT \|\| 'demo' }}`, so `demo` is the effective default if unset. |
| `DEMO_CONFIGURED` | `true` | **Deployment gate.** The job is guarded by `if: ${{ vars.DEMO_CONFIGURED == 'true' }}`. Anything other than the exact string `true` means the job is skipped, not failed. |

`setup-demo.mjs` sets `DEMO_ENVIRONMENT` on every run, but sets `DEMO_CONFIGURED=true` **only when it bootstraps Kubernetes**. If you passed `--skip-kubernetes-bootstrap`, the gate stays closed until you bootstrap the namespace yourself and then run:

```powershell
# One-time, requires cluster-admin
az aks get-credentials -g <resource-group> -n <aks-name>
kubectl kubelogin convert-kubeconfig -l azurecli
kubectl apply -f deploy/k8s/namespace.yaml

gh variable set DEMO_CONFIGURED --repo "$ORG/$REPO" --body true
```

**Only the namespace is needed.** The workflow creates the Deployment and Service itself — you do **not** need to pre-apply `deployment.yaml` or `service.yaml`. The ordering exists solely because the workflow identity is namespace-scoped and cannot create the namespace.

To set or correct one by hand:

```powershell
# environment-scoped
gh variable set ACR_LOGIN_SERVER --env demo --body "acrghasmdcdemo.azurecr.io" --repo "$ORG/$REPO"
gh variable list --env demo --repo "$ORG/$REPO"

# repository-scoped
gh variable set DEMO_CONFIGURED --repo "$ORG/$REPO" --body true
gh variable list --repo "$ORG/$REPO"
```

> These are **variables, not secrets** — subscription and tenant GUIDs are identifiers, and authentication is by OIDC federation. If your org policy requires secrets instead, both the variables and the workflow references must change together.
>
> **Do not** add ACR admin username/password. The workflow obtains a short-lived, masked registry token via `az acr login --expose-token` after the OIDC login. Storing a registry password in a secret-scanning demo sends the wrong message.

### Verify the foundation

```powershell
node scripts/verify-demo.mjs --expected-image "<registry>/orders-portal@sha256:<64-hex-digest>" --health-url http://127.0.0.1:3000
```

It reads `demo-generated/deployment-state.json`. Supply `--expected-image`
from the build and `--health-url` from the authenticated tunnel as shown
in the rehearsal above. It checks, in order:

1. The repository has an approved public/private visibility.
2. The GitHub environment exists, all **seven** environment variables match the deployed values exactly, `DEMO_ENVIRONMENT` matches, and `DEMO_CONFIGURED` is `true`.
3. GitHub security: code security (`advanced_security` or `code_security`), `secret_scanning`, `secret_scanning_push_protection`, and `secret_scanning_non_provider_patterns` all enabled.
4. Azure resource group, ACR, and AKS cluster exist.
5. The container image is published.
6. The AKS workload is running, the Service is internal, and running digests match `--expected-image`.
7. `GET /healthz` returns `status: "ok"` **and** `syntheticData: true` — so a pass also confirms you are looking at the synthetic demo dataset.

Because it compares variables against the state file, it also catches the case where someone edited a variable by hand and drifted it away from the deployed infrastructure.

---

## 4. Enable Defender for Cloud plans (operator action)

Portal → **Microsoft Defender for Cloud** → **Environment settings** → select the subscription.

1. **Defender CSPM** → **On**. This is required for code-to-runtime mapping, attack paths, risk factors, and Cloud Security Explorer. See [Enable Defender CSPM](https://learn.microsoft.com/en-us/azure/defender-for-cloud/tutorial-enable-cspm-plan).
2. Under Defender CSPM → **Settings**, ensure the container-related extensions are on:
   - **Agentless discovery for Kubernetes**
   - **Agentless container vulnerability assessment**
   - **Agentless scanning for machines** (needed for registry-agnostic runtime scanning)
3. **Defender for Containers** — **not required for this demo path.** Defender CSPM alone satisfies the container mapping and vulnerability assessment this demo relies on, and the Bicep deployment says so explicitly in its follow-up output. Defender for Containers adds runtime threat detection and extra cost. Enable it **only** if you also want the runtime-detection story — or if you specifically want the Defender sensor's near-real-time workload inventory instead of the ~24-hour agentless cycle, which can shorten a tight staging window.

These are **billable plans**. Enabling them is an explicit operator decision, not a default. `setup-demo.mjs` never enables them under any flag. See [cleanup.md](cleanup.md) for turning them off.

> `setup-demo.mjs` prints this list for you at the end of a successful run, generated from the Bicep `manualFollowUpSteps` output — it names the exact subscription and repository. Work through what it prints; the steps below explain each one.

---

## 5. Create the GitHub connector in Defender for Cloud (operator action)

This step requires an interactive **Authorize** and an App **Install**. It cannot be fully automated.

1. Sign in to the [Azure portal](https://portal.azure.com/).
2. **Microsoft Defender for Cloud** → **Environment settings** → **Add environment** → **GitHub**.
3. Enter a **name** (max 20 characters), then select subscription, resource group, and region.
4. **Next: Configure access**.
5. Select **Authorize** — **explicit operator authorization**. Sign in with an account that has access to the target repositories.
   > Do not pause here. If you wait too long between Authorize and Install, the session times out and errors.
6. Select **Install**, then choose the organization(s) to install the Defender for Cloud GitHub App into. Granting access to **all repositories** is recommended for complete coverage.
7. Choose discovery behaviour: **all existing organizations** or **all existing and future organizations**.
8. **Next: Review and generate** → **Create**.

Constraints to know:

- Only **one instance** of a given GitHub organization can be onboarded per Azure tenant.
- DevOps resources can take **up to 8 hours** to appear in Inventory and DevOps security.

Reference: [Connect your GitHub organizations](https://learn.microsoft.com/en-us/azure/defender-for-cloud/quickstart-onboard-github).

---

## 6. Enable agentless code scanning (preview)

Portal → **Environment settings** → your **GitHub connector** → **Settings** / plan configuration → **Agentless code scanning** → **On**.

- Turn on the scanners you want. Defaults cover code, IaC, and dependency scanning.
- Set scope. **Exclusion mode** scans everything except what you list and enables autodiscovery of new repositories; **inclusion mode** scans only what you list and disables autodiscovery.
- For a demo, exclusion mode with no custom list is simplest.

Timing to expect: repository discovery on connector creation then every **8 hours**; code retrieval on setup then **daily**; each scan **15–60 minutes**.

Reference: [Configure agentless code scanning (preview)](https://learn.microsoft.com/en-us/azure/defender-for-cloud/agentless-code-scanning).

---

## 7. Build, push, and deploy

Run the pipeline. `build-and-deploy.yml` targets `environment: ${{ vars.DEMO_ENVIRONMENT || 'demo' }}`, so the OIDC subject matches automatically.

```powershell
gh workflow run build-and-deploy.yml --repo "$ORG/$REPO"
gh run watch --repo "$ORG/$REPO"
```

Or: repo → **Actions** → **Build and deploy** → **Run workflow**.

> **If the job is skipped rather than failing**, the gate is closed: `DEMO_CONFIGURED` is not exactly `true`. Check with `gh variable list --repo "$ORG/$REPO"` and set it once the namespace exists.

What it does:

1. Check out → set up **Node.js 24 LTS** → `npm ci` → validate (`npm run lint && npm run typecheck && npm test`).
2. OIDC login → compose the image name from `ACR_LOGIN_SERVER` → short-lived registry token via `ACR_NAME`.
3. Build with OCI labels (`org.opencontainers.image.source` / `.revision` / `.url`) and push, tagged with the commit SHA.
4. `actions/attest-build-provenance` with `push-to-registry: true`.
5. **Render** `deploy/k8s/deployment.yaml`, replacing its single `__IMAGE__` token with the immutable `‹login-server›/orders-portal@sha256:…` digest reference.
6. `kubectl apply` the rendered Deployment, then `service.yaml`.
7. Annotate the Deployment with source/revision/run-URL, then `rollout status --timeout=180s`.
8. Smoke-test synthetic `GET /healthz` through an authenticated localhost port-forward (12 × 10s retries).

Two things worth noting:

- **The workflow creates the Deployment; it does not patch an existing one.** There is no `kubectl set image` step and no requirement for a pre-existing Deployment — only the namespace must exist.
- **The rendering step is validated.** It fails if `deployment.yaml` does not contain **exactly one** `__IMAGE__` token, and again if any placeholder survives rendering. A deploy therefore cannot silently ship a manifest with an unresolved or duplicated image reference.

The validation step runs **before** anything is pushed, so a lint, type, or test failure stops the pipeline without publishing an image. A green run means the workload was built, deployed, and actually served traffic.

> Deployment is **by digest**, not by tag. The commit-SHA tag is for humans; the running pod is pinned to an immutable `sha256:` reference, which is also what Defender correlates against.

Then verify:

```powershell
node scripts/verify-demo.mjs

# or manually
az acr repository show-tags --name <ACR_NAME> --repository orders-portal --output table
kubectl get pods,svc -n ghas-mdc-demo

# In a second terminal keep the authenticated local tunnel open:
kubectl -n ghas-mdc-demo port-forward service/orders-portal 3000:80 --address 127.0.0.1
# In the original terminal:
curl "http://127.0.0.1:3000/healthz"
curl "http://127.0.0.1:3000/readyz"
```

Expected: pods `Running` in namespace `ghas-mdc-demo`, deployment and service
named `orders-portal`, an internal Service, and through the local tunnel:

- `GET /healthz` → `200` with `{"status":"ok","syntheticData":true, ...}`
- `GET /readyz` → `200` with `{"status":"ready", "database":{"mode":"query_only", ...}}`

If `/readyz` returns `503`, the store is empty or not query-only — the app is up but not serving the demo dataset.

**Capture the running pod/container name** — you need it for §8.

> **The image must be built by the pipeline.** Manually built and pushed images are not supported for code-to-runtime mapping. Do not `docker push` by hand as a shortcut.

### Confirm the attestation

Repo → **Actions** → the workflow run → **Attestations**, or:

```powershell
gh attestation verify oci://<ACR_NAME>.azurecr.io/orders-portal:<commit-sha> --repo "$ORG/$REPO"
```

Attestation-based mapping links the image digest to the exact repository, commit, and build identity. See [Using artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

> The Service is an **internal** LoadBalancer. Use authenticated port-forward,
> not public ingress. An internet-exposure risk factor is not expected for this
> baseline; use deployment and observed criticality context instead. Do not
> weaken access controls to manufacture an attack path.

---

## 8. Create the resource criticality rule (risk factor)

This produces the **Critical Resources** runtime risk factor deterministically, rather than hoping the environment supplies one.

1. Defender for Cloud → **Environment settings** → **Resource criticality**.
2. On the right pane, follow the link into the Microsoft Defender portal.
3. **Create a new classification**.
4. Give it a name and description, e.g. `ghas-mdc-demo-critical`.
5. In the query builder select **Cloud resource**, and set **Resource Name** equal to the container/pod name you deployed. **Next**.
6. On **Preview Assets**, the resource may appear with asset type **K8s-container** or **K8s-pod**. If it is not visible yet, continue anyway.
7. Choose a criticality level, review, and submit.

Timing:

- The label is applied **after** Defender detects the container — up to **24 hours**.
- Once classified, propagation of that context **to GitHub** takes up to **12 hours**.

That 36-hour worst case is why setup starts at T-48h. Reference: [Critical assets protection](https://learn.microsoft.com/en-us/azure/defender-for-cloud/critical-assets-protection).

---

## 9. Stage the three scenarios

### Scenario 1 — CodeQL SQL injection

- The sink is `searchOrders` in `src/database.ts`: the search term is interpolated into `LIKE '%...%'` clauses instead of being bound. It executes against an in-memory, synthetic `better-sqlite3` store, and the input is length-bounded (80 chars, NUL-stripped) — the injection is demonstrable, not weaponisable.
- The reachable entry point is `GET /api/orders?search=&limit=` — the `search` parameter is the tainted source CodeQL traces.
- Confirm the alert exists: repo → **Security and quality** → **Code scanning**. The `security-extended` suite is enabled, so expect related alerts too.
- Open the alert and check whether a **Copilot Autofix** suggestion is offered. If not, use the manual-fix fallback in the runbook — do not claim autofix coverage you have not seen.
- `npm run test:security` runs the security regression tests, which are useful for showing a fix is verified rather than merely applied.

### Scenario 2 — direct npm CVE (the main flow)

The pinned dependency is **`lodash@4.17.20`**, a direct **production** dependency (`package.json` → `dependencies`), imported in `src/database.ts` as `lodash/truncate`. It is installed into the runtime image, which is built `FROM node:24-bookworm-slim` — Debian Linux.

Headline advisories affecting 4.17.20, both fixed in **4.17.21**:

| CVE | GHSA | Severity | Issue |
| --- | --- | --- | --- |
| CVE-2021-23337 | GHSA-35jh-r3h4-6jhm | High | Command injection in `_.template` |
| CVE-2020-28500 | GHSA-29mw-wpgm-hmr9 | Medium | ReDoS in `_.trim` / `_.toNumber` |

Verify:

- Dependabot raised an alert: repo → **Security and quality** → **Dependabot**.
- Defender saw it in the image: **Defender for Cloud** → **Recommendations** → search for the container/image → open an **Update ...** recommendation → **Associated CVEs**.
- The same CVE ID appears on both sides. That identity is what makes the correlation demonstrable.

```powershell
gh api "repos/$ORG/$REPO/dependabot/alerts?state=open" `
  --jq '.[] | {cve: .security_advisory.cve_id, pkg: .dependency.package.name, scope: .dependency.scope, severity: .security_advisory.severity}'
```

> **Confirm the advisory set at stage time.** lodash has newer advisories with later fixed versions (for example CVE-2025-13465 → 4.17.23, and CVE-2026-2950 / CVE-2026-4800 → 4.18.0), so the alert list will grow over time. Read the CVE ID off the screen; never quote one from memory.

Why this pin satisfies the correlation requirements:

| Criterion | Satisfied by |
| --- | --- |
| Direct, not transitive | listed in `dependencies` |
| Production, not dev | survives `npm prune --omit=dev` in the build stage |
| In the GitHub Advisory Database | yes — GHSA IDs above |
| Detectable by MDVM as a language package | yes — npm on Linux |
| Linux image | `node:24-bookworm-slim` |
| A fixed version exists | 4.17.21+, so Dependabot/Copilot can produce a real upgrade PR |

### Scenario 3 — synthetic secret (opt-in, adjacent capability)

**Optional. Skip it entirely if you are unsure.** It is *not* part of the runtime correlation story.

Use the repository script. It refuses to run unless you pass the acknowledgement flag **and** the repository is `PRIVATE`.

```powershell
node scripts/generate-demo-secret.mjs --acknowledge-disposable-private-repo
```

It generates a **fresh RSA-2048 PKCS#8 PEM private key** at `demo-generated/unregistered-demo-private-key.pem`, **discards the matching public key**, and registers it with nothing.

To demonstrate:

```powershell
git add -f demo-generated/unregistered-demo-private-key.pem
git commit -m "demo: seed generic secret canary"
git push
```

Confirm before proceeding:

- [ ] The key was generated seconds ago on this machine.
- [ ] It has never been uploaded to GitHub, Azure, or any other service.
- [ ] It grants access to nothing — the public key was discarded.
- [ ] It exists only in the disposable private repo.
- [ ] The repo will be deleted after the demo.

Rehearse whether push protection blocks this PKCS#8 (`BEGIN PRIVATE KEY`)
canary and record the actual detected type; do not promise `rsa_private_key`.
If it is not blocked, use the custom-pattern canary from §2e instead.
Bypassing a block (with approval if delegated bypass applies) produces an
alert. Decide the outcome in advance; never bypass with a real credential.

Clean up locally with:

```powershell
node scripts/generate-demo-secret.mjs --clean
```

Built-in non-provider patterns are regex-based; AI-detected patterns cover
unstructured secrets. Generic/custom canaries have no provider validity
checks. See [Supported secret scanning patterns](https://docs.github.com/en/code-security/reference/secret-security/supported-secret-scanning-patterns)
and [Push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection).

---

## 10. Validate before you present

Run this at **T-4h**, not at T-0. Full checklist in [presenter-runbook.md](presenter-runbook.md).

### Cloud Security Explorer validation queries

Defender for Cloud → **Cloud Security Explorer**:

1. **Container Images** → **+** → **Pushed by code repositories** — proves image-to-repo mapping. Can take **up to 4 hours** to appear.
2. Add the filter **Has vulnerabilities** — proves registry VA found CVEs in your image.
3. Query for the running container on the AKS cluster — proves runtime discovery.
4. Search the container name on the **Inventory** page — it should be marked **critical**, proving the risk factor landed.

If a query returns nothing: artifacts may not be generated yet, scanning may not be configured, or permissions may be missing. See [troubleshooting.md](troubleshooting.md).

### GitHub-side validation

```powershell
node scripts/verify-demo.mjs
```

- Code scanning alert present (scenario 1).
- Dependabot alert present for `lodash`, with a CVE ID (scenario 2).
- Defender recommendation shows a **View on GitHub** link in the **Related GitHub Alerts** column for that CVE.
- Optional: an org-level campaign filtered on runtime risk returns your alert.

### Optional — create the campaign

Campaigns are **organization-level only**; they do not exist at repository level.

1. GitHub org → **Security** → **Campaigns** → **Create campaign** → **From code scanning filters**.
2. Apply **Runtime Risks** filters.
3. **Save** → **Publish as campaign**.

See [Creating and managing security campaigns](https://docs.github.com/en/code-security/how-tos/manage-security-alerts/remediate-alerts-at-scale/creating-managing-security-campaigns).

---

## Setup timeline summary

| When | Do |
| --- | --- |
| **T-48h** | §1–§7: create the copy, enable GHAS, provision Azure and the `demo` environment, enable Defender plans, create the connector, enable agentless scanning, run the pipeline, verify the workload is running. |
| **T-48h** | §8: create the resource criticality rule immediately after the workload is running. |
| **T-24h** | §9: verify scenarios 1 and 2; §2d-2f: rehearse failed PR check, secret controls, ownership and Prove evidence. |
| **T-4h** | §10: run all validation queries. Capture screenshots as fallback evidence. |
| **T-30m** | Scenario 3 key generation (if using it). Presenter preflight in the runbook. |
| **After** | [cleanup.md](cleanup.md) — delete everything. |
