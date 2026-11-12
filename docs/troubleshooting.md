# Troubleshooting

Symptom-first. Most problems in this demo are **timing**, not configuration — check the propagation table in [architecture.md](architecture.md) before changing anything.

> **Naming:** the application is **Northstar Orders** (`northstar-orders`); its container image, Kubernetes deployment, and service are all named `orders-portal`, in namespace `ghas-mdc-demo`. Commands below use the resource names.

**Rule for the presenter:** if something is broken at T-0, do not debug live. Switch to fallback evidence and continue. See [presenter-runbook.md](presenter-runbook.md#fallback-evidence).

---

## Triage: is it broken, or is it just early?

Work down this list before touching any setting.

| Question | If no |
| --- | --- |
| Was the GitHub connector created **more than 8 hours** ago? | Wait. DevOps resources take up to 8 hours to appear. |
| Was the image built by the **pipeline** (not `docker push`) **after** the connector was created? | Rebuild through the pipeline. Manual pushes are unsupported for mapping. |
| Was the image pushed **more than a few hours** ago? | Wait. Registry VA typically scans newly pushed images within a few hours. |
| Has the workload been running **more than 24 hours**? | Wait, or enable the Defender sensor for near-real-time inventory. |
| Was the criticality rule created **more than 24 hours** ago? | Wait. The label is applied after Defender detects the container. |
| For GitHub-side risk context: **more than 12 hours** since classification? | Wait. Criticality takes up to 12 hours to reach GitHub. |

If all answers are yes, continue below.

---

## Repository does not appear in Defender for Cloud

**Symptom:** Defender for Cloud → **DevOps security** → searching the repo name returns nothing.

| Cause | Check | Fix |
| --- | --- | --- |
| Too early | Connector created < 8 hours ago | Wait. |
| App not installed on the org | GitHub org → **Settings** → **GitHub Apps** | Install the Defender for Cloud GitHub App; grant access to **all repositories**. |
| Org not in connector scope | Azure → **Environment settings** → connector → organizations | Re-run authorization; select the org. |
| Org already onboarded elsewhere | — | Only **one instance** of a GitHub org can be onboarded per Azure tenant. Remove the other connector or use a different org. |
| Insufficient permissions | Your Azure role | **Contributor** to create the connector; **Security Admin** or **Security Reader** to view findings. |
| Sovereign cloud | Subscription cloud | The integration is **commercial cloud only**. Not available in Azure Government, 21Vianet, or other sovereign clouds. There is no workaround. |

Reference: [Connect your GitHub organizations](https://learn.microsoft.com/en-us/azure/defender-for-cloud/quickstart-onboard-github).

---

## "Advanced security status" is Off in DevOps security

**Symptom:** the repo appears, but shows **Advanced security status: Off**.

GHAS is not enabled on the repository. This is a **paid-plan operator action**, not a default.

1. GitHub org → **Settings** → **Advanced Security** → **Configurations**.
2. Apply a configuration with code scanning, Dependabot, and secret scanning enabled to the demo repo.
3. Verify: repo → **Settings** → **Advanced Security** → all items **Enabled**.

Confirm the connector's approved org/repository scope and entitlement.
Public source is supported; only optional secret seeding is private-only.

---

## Connector authorization fails or times out

**Symptom:** an error after selecting **Authorize**, or the App install page errors.

- The session times out if you wait too long between **Authorize** and **Install**. Restart the flow and complete both steps without pausing.
- Sign in with an account that is a **GitHub organization owner** and has access to the target repositories.
- Clear the browser session or use a private window if you are signed into multiple GitHub accounts.
- Confirm your Azure role includes **Contributor** on the subscription.

---

## No container image mapping in Cloud Security Explorer

**Symptom:** **Container Images → Pushed by code repositories** returns nothing.

| Cause | Fix |
| --- | --- |
| Too early | Mapping can take **up to 4 hours** to appear. |
| Image built manually | Rebuild through the CI/CD pipeline. Manually built and pushed images are **not supported**. |
| Image predates the connector | Images built and deployed **before** the connector was created may have limited support. Build a new image now. |
| Defender CSPM not enabled | Enable **Defender CSPM** (or Defender for Containers, which provides a limited subset). |
| Image not discoverable | It must be in a supported registry **or** running in a supported Kubernetes environment. Confirm it is in ACR. |
| Registry access disabled | Environment settings → Defender CSPM / Defender for Containers → enable **Registry access** and the agentless container extensions. |

Reinforcement options if mapping still does not land:

- **OCI/Docker labels** on the image — does not require a connector.
- **GitHub artifact attestations** from the Actions run. Verify with:
  ```powershell
  gh attestation verify oci://<ACR_NAME>.azurecr.io/orders-portal:<tag> --repo "<ORG>/<REPO>"
  ```

Reference: [Map container images from code to runtime](https://learn.microsoft.com/en-us/azure/defender-for-cloud/container-image-mapping).

---

## The lodash CVE appears in Dependabot but not in Defender

This is the most damaging failure — it removes the correlation. Work through in order.

| # | Check | Why |
| --- | --- | --- |
| 1 | Is the base image **Linux**? | Registry VA supports **language packages on Linux only**. This repo builds `FROM node:24-bookworm-slim` (Debian) — if someone changed it to a Windows base, npm findings vanish silently. |
| 2 | Is the package a **production** dependency? | `devDependencies` are not installed into the runtime image. `lodash` must stay in `dependencies`. |
| 3 | Is it actually in the image? | `docker run --rm <image> npm ls lodash` or inspect `node_modules`. The Dockerfile runs `npm prune --omit=dev` in the build stage — anything moved to `devDependencies` is dropped. |
| 4 | Did registry VA run? | Newly pushed images are typically scanned **within a few hours**. |
| 5 | Is the image within the rescan set? | Daily rescan covers images pushed or pulled in the last **30 days**, or currently running in a monitored cluster. If an older image is not appearing, **pull it from the registry** to reactivate scanning. |
| 6 | Is `Registry access` enabled? | Required for registry VA. |
| 7 | Is the CVE known to MDVM? | Defender uses Microsoft Defender Vulnerability Management. Not every GitHub Advisory entry has an MDVM equivalent. CVE-2021-23337 (High) is the most widely recognised of the lodash 4.17.20 set — check that one first. |

Reference: [Vulnerability management for containers](https://learn.microsoft.com/en-us/azure/defender-for-cloud/agentless-vulnerability-assessment-azure).

---

## The CVE appears in Defender but there is no "View on GitHub" link

**Symptom:** the CVE is in **Associated CVEs**, but **Related GitHub Alerts** is empty for that row.

| Cause | Fix |
| --- | --- |
| No corresponding GHAS alert exists | Expected for base image / OS / component CVEs — this is finding **F-4**, not a fault. Confirm you are looking at the pinned direct-dependency row. |
| Dependabot alert not raised | Enable **Dependency graph** and **Dependabot alerts** on the repo. |
| Repo not correlated | Fix the mapping first — see the section above. |
| Correlation not yet complete | End-to-end results can take **up to 24 hours**. |
| Repo access | The link may exist but you cannot open it — see next section. |

---

## "View on GitHub" link opens but shows nothing

You need **access permissions to the relevant GitHub repository** to view the GHAS alert content. If you do not have them, copy the link and ask a GitHub administrator. This is expected behaviour, not a bug.

---

## "Generate GitHub issue" is missing or greyed out

**Symptom:** **Take action** on the Runtime box does not offer **Generate GitHub issue**.

| Cause | Fix |
| --- | --- |
| Missing GitHub / repository permissions | Contact your GitHub or repository administrator to request access. This is the documented cause. |
| An issue already exists | A GitHub icon on the box means an issue was already generated. Hover to see its details — use that issue. |
| Recommendation not code-to-runtime enabled | Only **container and container image VA** recommendations support this. Confirm you opened an `Update ...` container recommendation. |
| Azure portal only | Issue creation from code-to-runtime is currently **Azure portal only**, not the Defender portal. Switch portals. |

Fallback for a live demo: use the pre-created issue from your reserve set.

---

## Container is not marked critical

**Symptom:** Inventory does not show the container as critical; the risk factor is missing.

| Cause | Fix |
| --- | --- |
| Too early | The label is applied **after** Defender detects the container — up to **24 hours**. |
| Container not yet detected | Confirm the pod is `Running`: `kubectl get pods -n ghas-mdc-demo`. |
| Rule name mismatch | The classification query matched **Resource Name** against the name you deployed. Pod names with generated suffixes will not match a rule written for the deployment name. Re-check the rule against the actual pod/container name. |
| Wrong asset type | Preview Assets should show **K8s-container** or **K8s-pod**. |
| Agentless discovery cycle | Running containers are inventoried approximately every **24 hours** with agentless discovery. Enable the **Defender sensor** for near-real-time inventory. |

Reference: [Critical assets protection](https://learn.microsoft.com/en-us/azure/defender-for-cloud/critical-assets-protection).

---

## Production-context filters return nothing in GitHub

**Symptom:** `has:deployment` or `runtime-risk:internet-exposed` returns no alerts.

| Cause | Fix |
| --- | --- |
| Criticality not yet propagated | Takes **up to 12 hours** for Defender to send classification data to GitHub. |
| No deployment records yet | Deployment metadata is populated automatically when MDC is connected — but only after mapping completes. |
| Wrong scope | `artifact-registry` and `artifact-registry-url` filters apply in **organization** views. |
| That risk factor is not present | Do not filter on `internet-exposed` if the workload has no public ingress. Filter on what you actually configured. |

Fallback: open the individual alert page. Runtime risks from deployment records are shown as **properties on the alert**, even when the list filter is unhelpful.

Reference: [Prioritizing alerts using production context](https://docs.github.com/en/code-security/tutorials/secure-your-organization/prioritize-alerts-in-production-code).

---

## No Copilot Autofix suggestion on the CodeQL alert

Autofix coverage is **not universal**. Check:

- Is code scanning using **CodeQL**? Autofix is available for CodeQL analysis. Third-party SARIF uploads are not covered.
- Is **Copilot Autofix** enabled in the org security configuration and on the repository?
- Is the alert on a **pull request** or the **default branch**? Those are the supported surfaces.
- Did `.github/workflows/codeql.yml` actually run? Check **Actions** → *CodeQL*. If default setup was enabled by an org configuration, it can supersede the committed workflow — set code scanning to **Not set** in the configuration and re-run.

If no suggestion appears, say so and demonstrate the manual parameterised-query fix instead. Do **not** claim coverage you cannot show. Autofix does not require a Copilot subscription, so a missing suggestion is not a licensing problem.

---

## Copilot coding agent is not assignable

| Cause | Fix |
| --- | --- |
| Not enabled for the org | An org administrator must enable the coding agent. |
| No Copilot licence | The agent requires an appropriate Copilot licence. |
| Repository not in scope | Confirm the disposable repo is included in the Copilot policy scope. |
| Actions disabled | The agent runs in an ephemeral environment **powered by GitHub Actions**. Actions must be enabled on the repo. |

Verify quickly: open any issue and check whether **Copilot** appears in the assignee picker.

**Never wait for an agent run live.** Runs take minutes and are non-deterministic. Use a pre-staged PR.

---

## A script refuses to run

The operator scripts fail closed on purpose. Each refusal has one cause.

| Message / behaviour | Script | Cause and fix |
| --- | --- | --- |
| `visibility is PUBLIC, not PRIVATE` | `generate-demo-secret.mjs` | Secret seeding is private-only. Use an approved disposable private copy; normal source/setup supports public repositories. |
| `Bootstrap manifest namespace X does not match Bicep output Y` | `setup-demo.mjs` | `deploy/k8s/namespace.yaml` and the Bicep `kubernetesNamespace` parameter disagree. Both must say `ghas-mdc-demo` unless you changed them together. |
| `Deployment did not return any of: …` | `setup-demo.mjs` | The Bicep deployment ran but an expected output was empty. Re-run; if it persists, inspect the deployment in the portal. |
| `Could not bootstrap the Kubernetes namespace after Azure RBAC propagation.` | `setup-demo.mjs` | 30 retries (10s apart) exhausted. Confirm your identity has cluster-admin — pass `--operator-principal-id` — then apply `deploy/k8s/namespace.yaml` by hand. |
| `Refusing to generate a secret-shaped canary without --acknowledge-disposable-private-repo` | `generate-demo-secret.mjs` | Pass the acknowledgement flag. It is deliberately awkward. |
| `The current directory is not a Git worktree` | `generate-demo-secret.mjs` | Run it from the repository root. |
| `<path> already exists. Run this script with --clean first.` | `generate-demo-secret.mjs` | A key is already present. `node scripts/generate-demo-secret.mjs --clean`, then regenerate. |
| `Refusing cleanup. Pass --confirm <rg> exactly.` | `cleanup-demo.mjs` | The confirmation string must exactly match `resourceGroupName` in `demo-generated/deployment-state.json`. |
| `Missing demo-generated/deployment-state.json` | `cleanup-demo.mjs`, `verify-demo.mjs` | State file deleted, or you are in the wrong directory. Run `setup-demo.mjs` first, or clean up manually — see [cleanup.md](cleanup.md) §5. |
| `Unknown argument: …` | `verify-demo.mjs`, `preflight.mjs` | `verify-demo.mjs` accepts no arguments; `preflight.mjs` accepts only `--cloud`. Both support `--help`. |
| `FAIL Node.js 24 LTS` | `preflight.mjs` | The check is `major !== 24` — **exactly** major 24, not "24 or newer". Node 25+ fails too. `package.json` declares `engines.node: "24.x"`. Use a version manager to select v24.x. |
| `FAIL Docker CLI and daemon` | `preflight.mjs` | Docker must be **running**, not merely installed. |
| `FAIL Azure CLI authentication` / `FAIL GitHub CLI authentication` | `preflight.mjs --cloud` | Run `az login` and `gh auth login`. |

> If a script did nothing at all, check you ran it as `node scripts/<name>.mjs` from the repository root. They are plain ESM modules, not npm scripts.

---

## Paid plans or the connector were not enabled

**Symptom:** you ran `setup-demo.mjs` and expected Defender or GHAS to be on.

This is intended behaviour, not a failure:

- `setup-demo.mjs` **never** enables a Defender for Cloud plan and **never** creates the Defender GitHub connector — under any flag. Do §4 and §5 of [setup.md](setup.md) manually.
- It touches paid **GitHub** security settings only when you pass `--configure-github-security`. Without that flag it prints a reminder and leaves them alone.

To apply the GitHub settings after the fact:

```powershell
node scripts/setup-demo.mjs --configure-github-security …   # same arguments as before
```

Or apply an org security configuration in the GitHub UI. Either way, confirm afterwards:

```powershell
gh api "repos/<ORG>/<REPO>" --jq '.security_and_analysis'
```

---

## The deploy smoke test fails

**Symptom:** *Smoke test through authenticated port-forward* fails, or forwarded `/healthz` does not respond.

The workflow opens an authenticated localhost tunnel and retries synthetic
health 12 times, 10 seconds apart. No public endpoint is required.

| Cause | Check | Fix |
| --- | --- | --- |
| Tunnel unavailable | Inspect the workflow's port-forward log and AKS authorization | Verify `pods/portforward` permission for the namespace-scoped deployment identity; do not expose the app publicly as a workaround. |
| Pod not ready | `kubectl -n ghas-mdc-demo get pods` | See *AKS deployment fails to pull the image* below. |
| Startup probe still failing | `kubectl -n ghas-mdc-demo describe pod <pod>` | `/readyz` backs the startup probe with a 12 × 5s budget (~60s) while the in-memory store seeds. Exceeding it restarts the container. |
| App up but `/readyz` returns `503` | `curl http://127.0.0.1:3000/readyz` through the tunnel | The store is empty or not query-only. Check `kubectl logs`. |
| Egress blocked | — | Corporate egress policy may block the runner. Verify manually with `curl` from a permitted network. |

Expected healthy responses:

```
GET /healthz  → 200  {"status":"ok","syntheticData":true,"notice":"...","uptimeSeconds":N,...}
GET /readyz   → 200  {"status":"ready","syntheticData":true,"database":{"mode":"query_only",...}}
```

`verify-demo.mjs` asserts `/healthz` returns `status === "ok"` **and** `syntheticData === true`. If it fails on the second condition, you are reaching *something* — but not Northstar Orders with its synthetic dataset. Check you are hitting the right IP.

---

## The deploy workflow is skipped and never runs

**Symptom:** *Build and deploy* shows as skipped, with no error. This is a gate, not a failure.

The job is guarded by `if: ${{ vars.DEMO_CONFIGURED == 'true' }}`.

```powershell
gh variable list --repo "<ORG>/<REPO>"
```

| Cause | Fix |
| --- | --- |
| `DEMO_CONFIGURED` not set | `setup-demo.mjs` sets it **only** when it bootstraps Kubernetes. If you ran `--skip-kubernetes-bootstrap`, apply `deploy/k8s/namespace.yaml` yourself (cluster-admin required), then set it. You do **not** need to pre-apply the Deployment or Service. |
| Set to something other than `true` | The comparison is against the exact string `true`. `True`, `TRUE`, `1`, or `yes` will not match. |
| Set at environment scope instead of repository scope | `DEMO_CONFIGURED` and `DEMO_ENVIRONMENT` are **repository** variables. A job-level `if:` is evaluated before the environment is resolved, so an environment-scoped value is not visible to the gate. Use `gh variable set` **without** `--env`. |

```powershell
gh variable set DEMO_CONFIGURED --repo "<ORG>/<REPO>" --body true
```

> Do not "fix" this by deleting the `if:` condition. The gate exists so a fork of the public template cannot deploy into someone's subscription by accident.

---

## The deploy workflow targets the wrong environment

**Symptom:** OIDC fails, or the job runs against an environment you did not expect.

The workflow resolves `environment: ${{ vars.DEMO_ENVIRONMENT || 'demo' }}`.

- If `DEMO_ENVIRONMENT` is unset, the job targets `demo`.
- If it is set, the job targets that name — and the **federated credential subject must match it**.

```powershell
gh variable get DEMO_ENVIRONMENT --repo "<ORG>/<REPO>"
```

If you changed the environment name after running `setup-demo.mjs`, either change it back or update the federated credential subject to `repo:<ORG>/<REPO>:environment:<new-name>`.

---

## The render-and-deploy step fails

**Symptom:** the workflow fails at *Render and deploy Kubernetes manifests*.

| Message | Cause | Fix |
| --- | --- | --- |
| `deploy/k8s/deployment.yaml must contain exactly one __IMAGE__ placeholder; found 0` | The token was replaced in-repo — often by someone hard-coding an image to "fix" a deploy | Restore the `image: __IMAGE__` line. The token must be committed, not resolved. |
| `...found 2` (or more) | The manifest was duplicated, or a second container was added | Only one `__IMAGE__` may exist. If you genuinely need a sidecar, the workflow's rendering step must be extended too. |
| `__IMAGE__ placeholder remains after rendering` | Rendering did not substitute | The workflow fails closed rather than applying a broken manifest. Check the `IMAGE` value in the step log. |
| `namespaces "ghas-mdc-demo" not found` | The namespace was never bootstrapped | The **workflow cannot create it** — its identity is namespace-scoped. Apply `deploy/k8s/namespace.yaml` as an operator with cluster-admin. See below. |
| `cannot create resource "namespaces"` | Something tried to apply `namespace.yaml` from CI | The workflow must apply only `deployment.yaml` (rendered) and `service.yaml`. |
| `deployments.apps is forbidden` | RBAC not propagated, or the wrong scope | The role assignment can take minutes to propagate. Re-run. If it persists, confirm **AKS RBAC Writer** is assigned on the namespace scope. |
| `error: timed out waiting for the condition` on `rollout status` | Pods not becoming ready within 180s | `kubectl -n ghas-mdc-demo describe pod <pod>` and check the readiness probe — see the health section below. |

### Bootstrapping the namespace by hand

Requires **cluster-admin**, once per cluster:

```powershell
az aks get-credentials -g <resource-group> -n <aks-name>
kubectl kubelogin convert-kubeconfig -l azurecli
kubectl apply -f deploy/k8s/namespace.yaml
kubectl get namespace ghas-mdc-demo
```

Then open the gate:

```powershell
gh variable set DEMO_CONFIGURED --repo "<ORG>/<REPO>" --body true
```

> You do **not** need to pre-apply `deployment.yaml` or `service.yaml`. The workflow creates both. Only the namespace requires elevated rights.
>
> `setup-demo.mjs` normally does this for you, retrying up to 30 times while Azure RBAC propagates. Repeated `Waiting for AKS Azure RBAC propagation (n/30)...` messages are expected, not a fault.

### Pod rejected by Pod Security admission

**Symptom:** `violates PodSecurity "restricted:latest"`.

The namespace enforces the **restricted** Pod Security Standard. The shipped pod spec satisfies it. If you see this, something in `deployment.yaml` was changed — a privileged container, a host mount, a dropped `runAsNonRoot`, a removed seccomp profile, or added capabilities.

Fix the manifest rather than relaxing the namespace label. The enforcement is a deliberate guardrail: the demo's weaknesses belong in application code and dependencies, not the runtime posture.

---

## GitHub Actions cannot authenticate to Azure

**Symptom:** `AADSTS700213`, `AADSTS70021`, or "no matching federated identity record found".

The federated credential subject must match the workflow context exactly:

```
repo:<ORG>/<REPO>:environment:<DEMO_ENVIRONMENT>      # default: demo
```

Checks:

- `build-and-deploy.yml` declares `environment: ${{ vars.DEMO_ENVIRONMENT || 'demo' }}`, so the subject uses the `environment:` form. If you copied the job without it, the subject becomes `repo:<ORG>/<REPO>:ref:refs/heads/main` and will not match.
- `DEMO_ENVIRONMENT` matches the environment the federated credential was created against.
- The workflow declares `permissions: id-token: write` (it does, at workflow level).
- Issuer is `https://token.actions.githubusercontent.com`.
- Audience is `api://AzureADTokenExchange`.
- `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` are set on the **environment**, not only at repository scope: `gh variable list --env demo --repo "<ORG>/<REPO>"`.
- After forking or renaming the repo, the subject changed — update the federated credential.

**If the job never starts at all:** it is gated on `DEMO_CONFIGURED`, not on the Azure variables — see the section above.

---

## Push to ACR fails

| Error | Cause | Fix |
| --- | --- | --- |
| `ACR_LOGIN_SERVER variable is required.` | The environment variable is empty or missing | The workflow fails fast rather than guessing. Set it: `gh variable set ACR_LOGIN_SERVER --env demo --body "<acr>.azurecr.io" --repo "<ORG>/<REPO>"` |
| `unauthorized: authentication required` | Identity lacks `AcrPush` | Assign `AcrPush` on the registry to the federated identity. |
| `denied: requested access to the resource is denied` | Wrong registry name | `ACR_NAME` is the short name **without** `.azurecr.io`; `ACR_LOGIN_SERVER` is the full host **with** it. Do not swap them. |
| `name unknown` | Repository path mismatch | Confirm the image name the workflow builds matches what you query. |

---

## AKS deployment fails to pull the image

```powershell
kubectl describe pod -n ghas-mdc-demo <pod>
```

- `ImagePullBackOff` / `ErrImagePull` → the cluster is not attached to the registry:
  ```powershell
  az aks update --resource-group <RG> --name <AKS_NAME> --attach-acr <ACR_NAME>
  ```
- Verify the tag exists:
  ```powershell
  az acr repository show-tags --name <ACR_NAME> --repository orders-portal --output table
  ```
- `CrashLoopBackOff` → check the app itself:
  ```powershell
  kubectl -n ghas-mdc-demo logs deploy/orders-portal --tail=100
  ```
  Northstar Orders uses **`better-sqlite3`**, a native module compiled during the image build (the build stage installs `g++`, `make`, and `python3`). A `Cannot find module` or `invalid ELF header` / `NODE_MODULE_VERSION` mismatch means the runtime Node major no longer matches the one the addon was built against — usually because the base image tag was changed away from `node:24-bookworm-slim`. Rebuild through the pipeline rather than patching the running pod.

---

## Agentless code scanning shows no findings

| Cause | Fix |
| --- | --- |
| Not enabled | Environment settings → GitHub connector → enable **Agentless code scanning**. |
| Unsupported region | Supported: Australia East, Canada Central, Central US, East Asia, East US, North Europe, Sweden Central, UK South, West Europe. |
| Too early | Discovery every **8 hours**; code retrieval **daily**; scans take **15–60 minutes**. |
| Repo out of scope | In **inclusion mode**, only listed repos are scanned and autodiscovery is disabled. Switch to exclusion mode or add the repo. |
| Wrong branch | Only the **default branch** is retrieved. |
| Scanner disabled | Check the per-scanner toggles in the connector settings. |

Reference: [Configure agentless code scanning (preview)](https://learn.microsoft.com/en-us/azure/defender-for-cloud/agentless-code-scanning).

---

## Push protection did not block the synthetic key

| Cause | Fix |
| --- | --- |
| Push protection not enabled | Enable it in the org security configuration, or run `node scripts/setup-demo.mjs --configure-github-security`. Confirm on the repo. |
| Generic / non-provider patterns not enabled | Enable them as part of **GitHub Secret Protection** (`secret_scanning_non_provider_patterns`). |
| Key was not generated | Run `node scripts/generate-demo-secret.mjs --acknowledge-disposable-private-repo`. It writes an RSA-2048 PKCS#8 PEM to `demo-generated/unregistered-demo-private-key.pem`. |
| Script refused to run | It requires the acknowledgement flag, a Git worktree, and a repository whose visibility is `PRIVATE`. Check `gh repo view --json visibility`. |
| File was ignored | `demo-generated/` is git-ignored by design. You must stage it with `git add -f`. |
| Already pushed | Push protection acts at push time. If the key is already on the remote, you will see an **alert** rather than a block. |
| Not a paid plan | Secret Protection is a paid, explicitly enabled feature. |

**Do not substitute a real credential to make this work.** If it will not fire, drop scenario 3 — it is optional and adjacent.

---

## Recommendation titles do not match the docs

Defender for Cloud is transitioning from **grouped** to **individual** container vulnerability recommendations. During the transition, both forms may appear side by side.

Search by **container name** rather than by an exact recommendation title, and look for names beginning with `Update`.

Reference: [Transitioning from grouped to individual recommendations](https://learn.microsoft.com/en-us/azure/defender-for-cloud/transition-grouped-individual-recommendations).

---

## Findings persist after cleanup

- ACR: when an image is deleted, findings are usually removed **within one hour**. In rare cases the deletion notification is delayed.
- GitHub secret scanning alerts are **not** cleared by deleting the commit. Delete the **repository**.
- Defender connector entries persist until the connector is deleted.

See [cleanup.md](cleanup.md).

---

## Collecting diagnostics

```powershell
# Scripted checks first — these cover most of the below
node scripts/preflight.mjs --cloud
node scripts/verify-demo.mjs

# Kubernetes
kubectl get pods,svc,deploy -n ghas-mdc-demo -o wide
kubectl describe pod -n ghas-mdc-demo <pod>
kubectl logs -n ghas-mdc-demo deploy/orders-portal --tail=100

# Application health
$ip = kubectl get svc orders-portal -n ghas-mdc-demo -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
curl "http://$ip/healthz"
curl "http://$ip/readyz"

# ACR
az acr repository list --name <ACR_NAME> --output table
az acr repository show-tags --name <ACR_NAME> --repository orders-portal --output table
az acr manifest list-metadata --registry <ACR_NAME> --name orders-portal --output table

# Azure identity and plans
az account show --output table
az security pricing list --query "value[].{name:name, tier:pricingTier}" --output table

# GitHub
gh repo view "<ORG>/<REPO>" --json nameWithOwner,visibility
gh api "repos/<ORG>/<REPO>" --jq '{private, visibility, security_and_analysis}'
gh api "repos/<ORG>/<REPO>/code-scanning/alerts?state=open" --jq 'length'
gh api "repos/<ORG>/<REPO>/dependabot/alerts?state=open" --jq '[.[] | {cve: .security_advisory.cve_id, pkg: .dependency.package.name, scope: .dependency.scope}]'
gh variable list --repo "<ORG>/<REPO>"              # DEMO_ENVIRONMENT, DEMO_CONFIGURED
gh variable list --env demo --repo "<ORG>/<REPO>"   # the seven Azure variables
gh run list --repo "<ORG>/<REPO>" --limit 5
```

Deployment state written by the setup script: `demo-generated/deployment-state.json`.

> `az security pricing list` reflects Defender plan tiers on the subscription. Confirm **CloudPosture** (Defender CSPM) is `Standard`.

---

## When to give up and reset

If the correlation still does not appear after **48 hours** with all prerequisites verified, rebuild rather than debug:

1. Delete the AKS workload and the ACR repository.
2. Delete and recreate the GitHub connector.
3. Re-run the pipeline to produce a fresh image **after** the new connector exists.
4. Recreate the criticality rule against the new container name.
5. Allow another 24 hours.

A rebuild is faster than chasing a partially propagated state — and it is exactly why the demo runs from a **disposable** copy.
