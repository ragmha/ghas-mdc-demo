# Safety and production gaps

> ## This is a demonstration artifact. It is not production software.
>
> This repository contains **deliberately vulnerable code**, **deliberately outdated dependencies**, and **intentionally weak configuration**. It exists to make security tooling produce findings on a stage.
>
> **Do not deploy it to a production subscription. Do not copy patterns from it into real systems. Do not connect it to real data, real credentials, or real networks.**

## The application is fictional

**Northstar Orders** is a **fictional enterprise inner-source order portal** invented for this demo.

- It is **not a real product** and **not a real customer system**.
- It does **not** represent, model, or stand in for any real company, customer, organization, or engagement. Any resemblance to an actual business is coincidental.
- Every order, customer name, region, and product in its dataset is **synthetic** — generated, never derived from a real dataset or a real person. Records are tagged `dataClassification: "synthetic-demo"`.

When presenting, use the name **Northstar Orders**. Do not rename it after a prospect or customer to "make it land" — doing so invents a security incident for a named organization, which is both misleading and a reputational risk.

---

## What is deliberately unsafe

| Area | What is wrong | Why it is here |
| --- | --- | --- |
| SQL query construction | `searchOrders()` in `src/database.ts` interpolates the search term into `LIKE '%...%'` clauses instead of binding it | To produce a CodeQL `js/sql-injection` alert with a visible data-flow path |
| npm dependency | `lodash` pinned to `4.17.20` as a direct **production** dependency | To produce a Dependabot alert **and** a Defender container VA finding on the same CVE ID (CVE-2021-23337 / CVE-2020-28500, fixed in 4.17.21) |
| Base image | `node:24-bookworm-slim`, not pinned to a patched digest | To produce OS/component CVEs that GHAS does not see (finding F-4) |
| Kubernetes Service | `deploy/k8s/service.yaml` is `type: LoadBalancer` — public IP, **no authentication, no TLS, no WAF** | To produce a genuine internet-exposure runtime risk factor for Defender attack-path analysis (finding F-6). Documented in the manifest's own header. |
| Secret handling (opt-in) | A private key is deliberately committed | To trigger GitHub secret scanning generic patterns and push protection |

> **What is *not* deliberately weak:** the workload's runtime posture. The namespace enforces the **restricted** Pod Security Standard and the pod spec satisfies it. The planted weaknesses are in **application code and dependencies** — that is the story the demo tells. Do not weaken the pod spec to "add more findings".

Full detail per finding: [findings-catalog.md](findings-catalog.md).

---

## Limits on the controlled vulnerabilities

The vulnerabilities are real but **bounded**. Those bounds are design decisions, and they must be preserved by anyone modifying this repo.

### Data

- All order data is **synthetic**. It is generated, not derived from any real dataset, customer, or person. Records are explicitly tagged `dataClassification: "synthetic-demo"`.
- The SQLite store is an **in-memory** `better-sqlite3` database (`:memory:`) seeded at startup, with an `isQueryOnly()` assertion surfaced on `/readyz`. No write endpoint is exposed, and the process is stateless — the injection is demonstrable, and anything it touched would vanish on restart.
- The search term is length-bounded (`validateSearchTerm`, max 80 characters) and results are clamped, so the injection has a small, fixed surface.
- No PII, no payment data, no regulated data, no proprietary data. Nothing of value is exposed even if the injection is exploited.

### Blast radius

- Northstar Orders is designed to be deployed into a **disposable resource group** with a **disposable AKS cluster**.
- The AKS namespace `ghas-mdc-demo` isolates the workload and enforces the **restricted** Pod Security Standard.
- The container runs as a **non-root** user (uid/gid 10001) with a read-only root filesystem, no privilege escalation, all capabilities dropped, and a seccomp profile. These hardening measures are kept deliberately — the demo's weaknesses are in code and dependencies, not in the runtime posture.
- The CI identity holds **AKS RBAC Writer scoped to the demo namespace only** — it cannot create namespaces or touch anything else in the cluster.
- Northstar Orders holds no credentials to anything outside its own container.
- Exploiting the SQL injection yields synthetic rows. It does not yield cloud access.
- **However:** the Service is a public LoadBalancer with no authentication. Anyone with the IP can reach Northstar Orders and the injectable endpoint. Limit reach with `loadBalancerSourceRanges` in `deploy/k8s/service.yaml`, and tear it down immediately after the demo.

### Dependency vulnerability

- `lodash@4.17.20` is chosen for **detectability**, not exploitability — it must appear in the GitHub Advisory Database and be recognised by Microsoft Defender Vulnerability Management.
- The vulnerable functions are not reachable in the way the advisories describe: Northstar Orders only calls `lodash/truncate`, not `_.template`.
- It is not weaponised. There is no exploit code in this repository, and none should ever be added.

### Secret scenario

- The key is **generated fresh at demo time** by `scripts/generate-demo-secret.mjs` and is **never registered** with any provider.
- The matching **public key is discarded**, so the private key is cryptographically useless for authenticating to anything.
- The generator **refuses to run** unless you pass `--acknowledge-disposable-private-repo` and the repository visibility is `PRIVATE`.
- It exists only in a disposable private repo that is deleted afterwards.
- **Never use a real credential — not a live one, not an expired one, not a rotated one, not "just for the demo".** A rotated credential still tells the audience that committing credentials is an acceptable demo technique. It is not.

### Tooling guardrails that are enforced, not just documented

Three of the safety properties above are checked in code, so a distracted operator cannot skip them:

| Guardrail | Enforced by |
| --- | --- |
| Demo runs only against a **private** repository | `setup-demo.mjs` and `generate-demo-secret.mjs` both call `gh repo view --json visibility` and abort unless it is `PRIVATE` |
| The synthetic key requires conscious opt-in | `generate-demo-secret.mjs` aborts without `--acknowledge-disposable-private-repo` |
| Paid GitHub security settings are never enabled implicitly | `setup-demo.mjs` touches them only with `--configure-github-security`, and prints a reminder when you omit it |
| Defender plans and connectors are never enabled by automation | No script enables a Defender plan or creates a connector, under any flag |
| Cleanup cannot target the wrong environment | `cleanup-demo.mjs` requires `--confirm <resource-group>` to match `demo-generated/deployment-state.json` exactly |

Treat any change that weakens one of these as a defect, not a convenience.

### What must never be added

- ❌ Working exploit code or payloads
- ❌ Real or previously-real credentials of any kind
- ❌ Real customer, employee, or personal data
- ❌ Malware, reverse shells, or persistence mechanisms
- ❌ Anything that attacks a system you do not own
- ❌ Any vulnerability whose blast radius extends beyond the disposable resource group

---

## Public-repository constraints

This template is public and MIT-licensed. That imposes hard rules.

- The **public** repo must never contain a secret — synthetic or otherwise. Scenario 3 is executed **only** in the disposable private copy.
- No tenant IDs, subscription IDs, registry names, or cluster names from a real environment. Use placeholders.
- No internal URLs, internal hostnames, or customer names. The demo application must stay **Northstar Orders** — do not commit a renamed variant carrying a real company's name.
- No screenshots containing real environment identifiers.
- Anyone can fork this. Assume they will run it without reading the docs — so the defaults must be safe, and the warnings must be loud.

---

## Cost

Running this demo costs money. It is not free-tier.

| Item | Billing model | Notes |
| --- | --- | --- |
| **GHAS / GitHub Code Security** | Per active committer, monthly | Explicit paid enablement. Required for CodeQL on a private repo and for the Defender integration. |
| **GitHub Secret Protection** | Per active committer, monthly | Explicit paid enablement. Required for scenario 3. |
| **GitHub Copilot** (coding agent) | Per user | Required for the scenario 2 finale. Copilot **Autofix** does not require a Copilot subscription; the **coding agent** does. |
| **GitHub Actions** | Included minutes, then per-minute | Private repos consume billable minutes. `codeql.yml` runs on every push and PR, and the Copilot coding agent also runs on Actions. |
| **Defender CSPM** | Per billable resource, monthly | Required. Enabling it applies to the **whole subscription**, not just your demo resources. |
| **Defender for Containers** | Per vCore / per resource | **Not required for this demo path** — Defender CSPM alone covers it. Adds runtime threat detection and extra cost. |
| **AKS** | Per node-hour + managed disks | Runs continuously through the 48-hour staging window. |
| **ACR** | Per tier + storage | Standard tier is sufficient. |
| **Public IP + Standard Load Balancer** | Per hour + per GB egress | The `orders-portal` Service is `type: LoadBalancer`. This bills for the whole staging window, not just the demo hour. |

Cost control:

- **Use a dedicated subscription or resource group.** Defender plans apply at subscription scope — enabling CSPM on a shared subscription bills every resource in it, not just yours.
- Budget for the **full staging window**, not the demo hour. The propagation windows mean AKS runs for ~48 hours minimum.
- Use a **single small node**. The demo does not need scale.
- **Delete everything afterwards.** See [cleanup.md](cleanup.md).
- Estimate before you start: [Defender for Cloud pricing](https://azure.microsoft.com/en-us/pricing/details/defender-for-cloud/) and the Defender for Cloud [cost calculator](https://learn.microsoft.com/en-us/azure/defender-for-cloud/cost-calculator).

> Forgetting to disable Defender plans after a demo is the most common way this becomes expensive. Set a calendar reminder at the same time you enable them.

---

## Explicit operator actions

Nothing in this demo turns itself on. Each of the following is a deliberate, human, billable decision — and should be described as such when presenting.

| Action | Where | Why it is manual |
| --- | --- | --- |
| Enable GHAS / Code Security | GitHub org security configuration, or `setup-demo.mjs --configure-github-security` | Paid, per-committer. The setup script leaves these untouched unless you pass the flag. |
| Enable Secret Protection, generic patterns, push protection | Same as above | Paid, per-committer |
| Enable the Copilot coding agent | GitHub org policy | Paid, per-user |
| Enable Defender CSPM | Azure → Environment settings | Paid, subscription-scoped. **Never** done by the setup script. |
| Enable Defender for Containers | Azure → Environment settings | Paid, and **not needed for this demo path**. **Never** done by the setup script. |
| **Authorize** the GitHub connector | Azure portal, interactive | Grants Azure access to GitHub repositories |
| **Install** the Defender for Cloud GitHub App | GitHub, interactive | Org-level app installation |
| Enable agentless code scanning | Connector settings | Preview feature, region-limited |
| Create the resource criticality rule | Microsoft Defender portal | Business classification decision |
| Generate the synthetic key | `scripts/generate-demo-secret.mjs --acknowledge-disposable-private-repo` | Opt-in by flag; refuses on a public repo |
| Delete everything afterwards | `scripts/cleanup-demo.mjs --confirm <rg>` plus manual steps | Nothing self-destructs; the script requires an exact confirmation string |

If a demo script or automation ever appears to do these silently, that is a bug. Report it.

---

## Production hardening gaps

Everything below is **missing on purpose**. This list doubles as the "what would you actually do" answer when an audience member asks.

### Application

| Gap | Production requirement |
| --- | --- |
| `searchOrders()` builds SQL by string interpolation | Bind parameters, as `listOrders()` already does |
| No authentication or authorization | Real identity (Entra ID / OIDC), RBAC, least privilege per endpoint |
| Publicly exposed with no TLS or WAF | Internal Service behind an ingress controller with TLS, a WAF, and `service.beta.kubernetes.io/azure-load-balancer-internal: "true"` |
| No rate limiting or throttling | Rate limits, quotas, and abuse detection |
| No output encoding review | Contextual output encoding to prevent XSS |
| Verbose errors | Generic errors to clients; detail only to structured logs |
| No security headers | CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` |
| Query-only synthetic SQLite in-container | A real, backed-up, access-controlled datastore with encryption at rest |
| No secrets management | Azure Key Vault, or workload identity with no stored secrets at all |

### Dependencies and supply chain

| Gap | Production requirement |
| --- | --- |
| `lodash` deliberately pinned to a vulnerable version | Automated Dependabot security updates, merged promptly |
| Base image `node:24-bookworm-slim` referenced by tag | Pin by digest; rebuild on base image updates |
| No SBOM published with releases | Generate and attest an SBOM per build (the workflow already attests provenance — add `sbom-path`) |
| Attestation generated but not enforced | Verify attestations at admission — reject unsigned or unattested images |
| No dependency review gate on PRs | Require dependency review; block PRs introducing known-vulnerable packages |

### Container and Kubernetes

| Gap | Production requirement |
| --- | --- |
| Single replica, single node, no HA | Multi-node, multi-zone, autoscaling |
| No network policy | Default-deny NetworkPolicy, explicit egress allow-list |
| Default service account | Dedicated service account with minimal RBAC; disable token automounting where unused |
| No admission control beyond Pod Security Standards | Azure Policy for AKS / Gatekeeper enforcing image provenance as well as pod security |
| Public API server | Private cluster or authorised IP ranges |
| Public LoadBalancer Service | Internal Service behind ingress with TLS and a WAF |
| Attestation generated but not verified at admission | Notation / Cosign or Ratify with enforced verification. The pipeline already deploys **by immutable digest**, which is the prerequisite. |

> Already done, and worth keeping if you adapt this: the **restricted** Pod Security Standard is enforced at the namespace; the pod runs non-root with a read-only root filesystem (writable `/tmp` supplied as a 64Mi in-memory `emptyDir`), no privilege escalation, all capabilities dropped and a `RuntimeDefault` seccomp profile; CPU/memory requests and limits are set; startup, readiness, and liveness probes are wired to `/readyz` and `/healthz`; and deployment is pinned by immutable digest.

### CI/CD

| Gap | Production requirement |
| --- | --- |
| No branch protection or required reviews | Protected default branch, required reviews, required status checks, linear history |
| No CODEOWNERS enforcement | CODEOWNERS with required review from owning teams |
| Third-party actions pinned by tag, not SHA | Pin third-party actions by full commit SHA |
| No environment approval gates | Required reviewers on the `demo`/production environments |
| Workflow-level `attestations: write` and `id-token: write` | Scope permissions to the job that needs them; default read-only at repo level |
| No deployment strategy | Staged rollout, canary, automatic rollback (the pipeline does wait on `rollout status`) |
| No artifact retention or provenance policy | Defined retention, immutable tags, enforced provenance verification |

### Azure and identity

| Gap | Production requirement |
| --- | --- |
| Broad role assignments | Least-privilege custom roles, scoped to the resource, time-bound via PIM |
| No Private Link | Private endpoints for ACR and other data-plane services |
| No diagnostic settings | Export logs and metrics to Log Analytics; retain per policy |
| No alerting or on-call routing | Defender alerts routed to SIEM/SOAR with defined runbooks |
| No Azure Policy governance | Policy assignments for required tags, allowed regions, and security baselines |
| ACR admin user potentially enabled | Disable the admin account; use identity-based access only |
| No backup or DR | Backup strategy, tested restore, documented RPO/RTO |

### Security operations

| Gap | Production requirement |
| --- | --- |
| No triage SLA | Defined severity-based remediation SLAs |
| No exception process | Documented, time-bound, reviewed exemptions |
| Ad-hoc criticality rule | Governed asset classification tied to a real business criticality model |
| No metrics | Mean time to remediate, alert ageing, coverage — tracked over time |
| No incident response plan | IR plan covering detection, containment, eradication, recovery, and lessons learned |
| No threat model | Documented threat model reviewed on architectural change |

---

## Product-claim discipline

When presenting, restrict yourself to what the vendor documentation states and what is visibly on screen.

**Do not claim:**

- That Northstar Orders is a real product, a real customer system, or drawn from a real engagement. It is fictional, on synthetic data, and represents no actual organization.
- Real-time or instant correlation. Published windows range from minutes to **24 hours**, plus **up to 12 hours** for criticality to reach GitHub.
- That Copilot "fixes" anything autonomously. The coding agent opens a **pull request** for human review; Autofix produces a **suggestion**.
- Universal Copilot Autofix coverage. It varies by alert; show what is offered.
- That the CodeQL finding correlates to runtime. Code-to-runtime recommendations currently cover **container and container image VA** only.
- That the secret finding participates in the Defender correlation. It does not.
- Any detection rate, false-positive rate, coverage percentage, or competitive comparison. None of these are published for this integration.
- Support in sovereign clouds. The integration is **commercial cloud only**.
- Support for Windows nodes or AKS ephemeral OS disks in runtime VA. It is explicitly unsupported.

**Do say:**

- "This is Northstar Orders — a fictional inner-source app on synthetic data."
- "This is asynchronous — here are the documented windows."
- "This is pre-staged; nobody demos this live."
- "This is a suggestion that a human reviews."
- "This scenario is adjacent capability, not the same correlation."
- "I don't want to guess — it's in the Learn docs, I'll send you the link."

---

## Before you present — safety checklist

- [ ] Demoing from a **disposable private** repo in a licensed org, not the public template.
- [ ] The application is referred to as **Northstar Orders** throughout — not renamed after a prospect, customer, or internal system.
- [ ] The Azure subscription is **disposable / non-production**, and holds no real data.
- [ ] No real credentials exist anywhere in the repo, workflows, or environment.
- [ ] The scenario 3 key, if used, was generated minutes ago by the script, and its public key was discarded.
- [ ] All order data is synthetic; the SQLite store is query-only.
- [ ] The public LoadBalancer IP is either scoped with `loadBalancerSourceRanges` or accepted as short-lived exposure of a synthetic app.
- [ ] Screenshots and fallback slides contain no real tenant, subscription, customer, or hostname values — **including the public IP**.
- [ ] Cost expectations are understood, and a cleanup reminder is set.
- [ ] The "this is not production" framing is in the opening minute — not the closing one.
- [ ] [cleanup.md](cleanup.md) is open and ready to run afterwards.
