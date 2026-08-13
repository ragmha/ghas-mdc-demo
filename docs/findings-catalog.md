# Findings catalog

Every finding this demo is designed to produce, where it appears, and what it does and does not prove.

The application is **Northstar Orders** — a fictional enterprise inner-source order portal running on **synthetic** data. It does not represent any real company, customer, or organization. See [architecture.md](architecture.md#the-application-northstar-orders).

All vulnerabilities are **deliberate**. All data is **synthetic**. See [safety-and-production-gaps.md](safety-and-production-gaps.md).

> **Naming:** the application is *Northstar Orders*; its container image, Kubernetes deployment, and service are all named `orders-portal`, in namespace `ghas-mdc-demo`. Same system, two names.

---

## Summary

| ID | Scenario | Detector | Surfaces in | Runtime correlation | Fix path |
| --- | --- | --- | --- | --- | --- |
| **F-1** | SQL injection in `searchOrders` (`src/database.ts`) | CodeQL (`javascript-typescript`, `security-extended`) | GitHub code scanning | **No** | Copilot Autofix where supported, else manual parameterisation |
| **F-2** | `lodash@4.17.20` — known CVEs in a direct npm production dependency | Dependabot **and** Defender container VA (MDVM) | GitHub Dependabot + Defender recommendations | **Yes — primary flow** | Defender-generated GitHub issue → Copilot coding agent PR |
| **F-3** | Unregistered RSA private key committed | GitHub secret scanning, generic patterns | GitHub secret scanning / push protection | **No** | Block at push, or bypass → alert → delete repo |
| **F-4** | Base image (`node:24-bookworm-slim`) OS / language CVEs | Defender container VA (MDVM) | Defender recommendations only | Partial | Base image update (usually out of scope for the demo) |
| **F-5** | Agentless code scanning findings | Trivy / ESLint / Checkov via the connector | Defender DevOps security recommendations | No | Informational |
| **F-6** | Internet-exposed workload with no auth/TLS/WAF | Defender CSPM attack-path analysis | Defender attack paths + `runtime-risk` on GHAS alerts | n/a — it *is* the risk factor | Intentional; see safety doc |

**F-2 is the demo.** Everything else is context.

---

## F-1 — SQL injection (CodeQL)

| Field | Value |
| --- | --- |
| Detector | CodeQL, `javascript-typescript`, `security-extended` suite (advanced setup, `.github/workflows/codeql.yml`) |
| Rule family | `js/sql-injection` (untrusted input reaching a query construction sink) |
| Severity | High (CodeQL default; confirm on the alert) |
| Location | `src/database.ts` → `searchOrders()` |
| Entry point | `GET /api/orders?search=&limit=` — `search` is the tainted source |
| Data store | `better-sqlite3` over an in-memory (`:memory:`) database seeded with synthetic rows; no write endpoint is exposed |
| Where | Repo → **Security and quality** → **Code scanning** |
| Trigger | `codeql.yml` on push and pull request to `main`, plus `workflow_dispatch` |
| Fix | Bind the search term as a parameter instead of interpolating it |

### The sink

`searchOrders()` builds its `WHERE` clause by interpolating the caller-supplied term directly into the SQL string:

```ts
const unsafeSql = `
  SELECT ${selectColumns}
  FROM orders
  WHERE customer_name LIKE '%${boundedSearch}%'
     OR product_name  LIKE '%${boundedSearch}%'
     ...
`;
const rows = db.prepare(unsafeSql).all();
```

Contrast with `listOrders()` immediately above it, which does the right thing — `.prepare(... LIMIT ?).all(safeLimit)`. Having the correct and incorrect patterns side by side in one file is useful on stage.

### What it demonstrates

CodeQL traces a data-flow path from a request parameter through to the interpolated query. The alert shows the full path, not just the sink line.

Where Copilot Autofix offers a suggestion, it generates a fix using the codebase and the CodeQL analysis. Autofix is available for **CodeQL** analysis and **does not require a Copilot subscription** ([application card](https://docs.github.com/en/code-security/responsible-use/security-and-quality-ai-features)).

### Caveats — state these

- **Autofix coverage is not universal.** Show what is actually offered on the alert; do not promise a suggestion will appear. Have the manual fix ready.
- Autofix output is an LLM-generated **suggestion**. It requires review, including verifying it preserves intended behaviour.
- **This finding does not correlate to runtime.** Code-to-runtime recommendations currently cover container and container-image vulnerability assessment recommendations only ([code-to-runtime mapping](https://learn.microsoft.com/en-us/azure/defender-for-cloud/code-to-runtime-mapping)). Presenting F-1 as part of the Defender correlation chain would be inaccurate.
- The SQLite store is **query-only and synthetic**, and the search term is length-bounded by `validateSearchTerm`, so the injection is demonstrable without exposing or mutating anything meaningful. It is not a safe pattern to reproduce.
- The `security-extended` suite produces more alerts than the default suite. Filter to the SQL injection alert on stage rather than scrolling the list.

### Verification

```
GitHub → repo → Security and quality → Code scanning
Filter: tool:CodeQL  severity:high
Expected: an open SQL-injection alert on src/database.ts with a rendered data-flow path
```

```powershell
gh api "repos/$ORG/$REPO/code-scanning/alerts?state=open" `
  --jq '.[] | {rule: .rule.id, sev: .rule.security_severity_level, path: .most_recent_instance.location.path}'
```

---

## F-2 — `lodash@4.17.20` (Dependabot + Defender container VA) — primary flow

| Field | Value |
| --- | --- |
| Package | **`lodash`**, pinned in `package.json` → `dependencies` |
| Version | **`4.17.20`** |
| Used at | `src/database.ts` — `import truncate from "lodash/truncate"` |
| Dependency kind | **Direct**, **production** |
| Ecosystem | npm |
| Base image | `node:24-bookworm-slim` (**Debian Linux** — required) |
| GitHub surface | **Security and quality** → **Dependabot** |
| Azure surface | Defender for Cloud → **Recommendations** → `Update ...` → **Associated CVEs** |
| Runtime | AKS namespace `ghas-mdc-demo`, deployment and service `orders-portal` |

> Northstar Orders has two other direct production dependencies — `express@5.1.0` and `better-sqlite3@13.0.3` — both current and **not** carrying advisories at the time of writing. `lodash` is the only intentionally vulnerable pin. If a new advisory lands on either of the others before your demo, say so rather than pretending the extra alert was planned.

### Advisories affecting 4.17.20

Headline pair, both first patched in **4.17.21**:

| CVE | GHSA | Severity | Vulnerable range | Issue |
| --- | --- | --- | --- | --- |
| **CVE-2021-23337** | GHSA-35jh-r3h4-6jhm | **High** | `< 4.17.21` | Command injection in `_.template` |
| **CVE-2020-28500** | GHSA-29mw-wpgm-hmr9 | Medium | `>= 4.0.0, < 4.17.21` | ReDoS in `_.trim` / `_.toNumber` |

Lead with **CVE-2021-23337** — High severity, and the one most likely to be recognised by both GHAS and MDVM.

> **Verify the advisory list at stage time.** lodash has later advisories that also match 4.17.20 with higher fixed versions — for example CVE-2025-13465 (→ 4.17.23) and CVE-2026-2950 / CVE-2026-4800 (→ 4.18.0). The alert list grows over time, so a simple bump to 4.17.21 may not clear every alert. **Read the CVE ID off the screen; never quote one from memory.**

```powershell
# Current advisories matching the pinned version
gh api "advisories?ecosystem=npm&affects=lodash@4.17.20" `
  --jq '.[] | {ghsa: .ghsa_id, cve: .cve_id, sev: .severity, summary: .summary}'
```

### Selection criteria — and how this pin satisfies them

| Criterion | Why it matters | Satisfied by |
| --- | --- | --- |
| **Direct** dependency | Dependabot attributes it cleanly; visible in `package.json`, not buried three levels down | listed in `dependencies` |
| **Production** dependency | `devDependencies` are not installed into the runtime image, so container VA would never see them | survives `npm prune --omit=dev` in the build stage |
| Published in the **GitHub Advisory Database** | Required for the Dependabot alert | GHSA IDs above |
| Detectable by **MDVM** as a language package | Required for the Defender side | npm on Linux |
| **Linux** container image | Registry VA supports OS packages on Linux and Windows, but **language packages on Linux only** ([vulnerability management for containers](https://learn.microsoft.com/en-us/azure/defender-for-cloud/agentless-vulnerability-assessment-azure)). A Windows base image silently removes this finding from Defender. | `node:24-bookworm-slim` |
| A **fixed version exists** | So Dependabot and Copilot can produce a genuine upgrade PR | 4.17.21+ |
| Image built by the **CI/CD pipeline** | Manually built and pushed images are not supported for code-to-runtime mapping ([container image mapping](https://learn.microsoft.com/en-us/azure/defender-for-cloud/container-image-mapping)) | `build-and-deploy.yml` |

### The correlation chain

```
package.json → dependencies → lodash 4.17.20
   │
   ├─► Dependabot alert                            (GitHub)
   │
   └─► GitHub Actions build-and-deploy.yml (environment: demo)
         │  OCI labels: org.opencontainers.image.source / .revision / .url
         │  actions/attest-build-provenance (push-to-registry)
         ▼
       ACR: orders-portal:<commit-sha>
         │  registry VA (MDVM) — typically scanned within a few hours
         ▼
       AKS: deployment/orders-portal in ghas-mdc-demo, deployed by digest
         │  runtime inventory — approx. every 24h agentless, near real time with the Defender sensor
         ▼
 Defender recommendation "Update ..."
   ├─ Associated CVEs → same CVE ID
   ├─ Related GitHub Alerts → "View on GitHub" → the Dependabot alert
   ├─ Remediation Insights → Source → Pipeline → Registry → Runtime
   │                       → All impacted assets (blast radius)
   └─ Take action → Generate GitHub issue
         ▼
   GitHub issue (labels: Defender for Cloud, security), in the repo of origin
         ▼
   Copilot coding agent → branch → pull request (lodash bump + lockfile)
         ▼
   Issue status / assignment changes reflected back in Defender for Cloud
```

### Reading the Related GitHub Alerts column

| Observed | Interpretation |
| --- | --- |
| **View on GitHub** link, alert **Active** | Engineering knows; nobody has fixed it. Prioritise. |
| **View on GitHub** link, alert closed/dismissed | Known and handled — check whether the deployed image predates the fix. |
| **No** matched GitHub alert | Runtime risk unknown to engineering. Typically a base image, OS, or component CVE (e.g. NGINX) that is not a direct dependency. This is F-4. |

### Caveats — state these

- **Nothing here is instant.** Every hop has a published window; see the propagation table in [architecture.md](architecture.md).
- Opening the linked GHAS alert requires **access permissions to the GitHub repository**. Without them the link resolves but the content does not.
- **Generate GitHub issue** requires appropriate GitHub/repository permissions. If it is missing, that is the cause.
- Runtime VA does **not** support Windows nodes or nodes using AKS ephemeral OS disks. Autoscaled clusters may return partial results if nodes are down at scan time.
- Runtime VA scans the container **images** in use, not the container runtime layer.
- Defender for Cloud is transitioning from **grouped** to **individual** container vulnerability recommendations; during the transition both forms may appear side by side ([transition notes](https://learn.microsoft.com/en-us/azure/defender-for-cloud/transition-grouped-individual-recommendations)). Search by container name rather than by an exact recommendation title.

### Verification

**GitHub:**
```powershell
gh api "repos/$ORG/$REPO/dependabot/alerts?state=open" `
  --jq '.[] | {cve: .security_advisory.cve_id, pkg: .dependency.package.name, scope: .dependency.scope, sev: .security_advisory.severity}'
```
Expected: open alerts for `lodash`, `scope: runtime` (i.e. a production dependency), including CVE-2021-23337.

**Defender for Cloud:**
```
Recommendations → search "orders-portal" → open "Update ..." → Associated CVEs
Expected: the same CVE ID, with a "View on GitHub" link in Related GitHub Alerts
```

**Cloud Security Explorer:**
```
Container Images → + → Pushed by code repositories        (image ↔ repo mapping)
Container Images → + → Has vulnerabilities                (registry VA found CVEs)
… extended with the AKS cluster condition                 (runtime discovery)
```

**Attestation:**
```powershell
gh attestation verify oci://<ACR_NAME>.azurecr.io/orders-portal:<commit-sha> --repo "$ORG/$REPO"
```

---

## F-3 — Unregistered private key (secret scanning) — adjacent capability

| Field | Value |
| --- | --- |
| Secret type | `rsa_private_key` (generic pattern category) |
| Detector | GitHub secret scanning, built-in generic patterns; push protection |
| Generated by | `scripts/generate-demo-secret.mjs` — RSA-2048, PKCS#8 PEM |
| Path | `demo-generated/unregistered-demo-private-key.pem` |
| Where | Repo → **Security and quality** → **Secret scanning**, and/or a blocked push |
| Opt-in | **Yes — skip entirely if unsure** |
| Runtime correlation | **None** |

> ### This is adjacent GHAS capability, not the runtime-CVE correlation
>
> F-3 demonstrates GitHub's built-in generic secret detection and push protection. It is a **different detection engine** with a **different surface**. It does not involve Defender for Cloud, produces no runtime risk factor, and shares **no correlation path** with F-2. Do not present them as one story.

### Safety requirements — non-negotiable

**Never use a real credential. Not in a demo, not "just this once", not a rotated one.**

The generator enforces most of this for you. It refuses to run unless:

- you pass `--acknowledge-disposable-private-repo`,
- the current directory is a Git worktree, **and**
- `gh repo view` reports the repository visibility is **`PRIVATE`**.

It generates the key, writes it with mode `0600`, and **discards the matching public key** — so the private key is cryptographically unusable for authenticating to anything.

```powershell
node scripts/generate-demo-secret.mjs --acknowledge-disposable-private-repo

git add -f demo-generated/unregistered-demo-private-key.pem
git commit -m "demo: seed generic secret canary"
git push
```

Confirm before proceeding:

- [ ] **Newly generated** at demo time, on the presenter's machine.
- [ ] **Never registered** with GitHub, Azure, or any other provider or service.
- [ ] **Granting access to nothing** — the public key was discarded.
- [ ] Committed **only** in the disposable private repo.
- [ ] Deleted locally after the demo (`node scripts/generate-demo-secret.mjs --clean`), and destroyed with the repo.

### Pattern categories

From [Supported secret scanning patterns](https://docs.github.com/en/code-security/reference/secret-security/supported-secret-scanning-patterns):

| Category | Detection | Example | Push protection |
| --- | --- | --- | --- |
| **Generic** | Regex | `rsa_private_key`, `ec_private_key` | Yes |
| **AI-detected** | Model-based, for unstructured secrets | `password` | Configurable |
| **Provider** | Regex, provider-specific | `aws_access_key_id` | Default for most |

Alert types: **user alerts**, **push protection alerts** (raised when a contributor bypasses push protection), and **partner alerts** (sent directly to providers, not shown in the repo's Security tab).

Generic secret detection uses models to identify unstructured secrets and **does not require a Copilot subscription**. Validity checks and extended metadata are available to GitHub Team / Enterprise customers who enable them as part of **GitHub Secret Protection**.

### Two demonstrable outcomes — pick one in advance

1. **Blocked** — push protection rejects the push at the client, before the secret reaches the remote.
2. **Bypassed → alerted** — the contributor bypasses with a reason; a push protection alert is raised for the security team.

Do not attempt both live.

### Caveats

- Requires **GitHub Secret Protection** with generic patterns and push protection enabled — a paid, explicit operator action.
- Push protection blocks at the point of push; it is not retroactive for history already on the remote.
- Once a secret has been pushed, deleting the commit does not clear the alert. **Deleting the repository is the reliable cleanup** — see [cleanup.md](cleanup.md).

---

## F-4 — Base image OS and component CVEs (Defender only)

| Field | Value |
| --- | --- |
| Detector | Defender container VA (MDVM), registry and runtime |
| Source | The `node:24-bookworm-slim` base image — Debian OS packages and bundled Node/npm components, plus the compiled `better-sqlite3` native addon |
| Where | Defender for Cloud → **Recommendations** → **Associated CVEs** |
| GitHub alert | Usually **none** |

These are the rows in **Related GitHub Alerts** with **no** matching GHAS alert.

### Why they matter to the narrative

> "This is the category the dependency tooling structurally cannot see — it isn't a direct dependency of Northstar Orders, it's the base image, the OS packages, or something like NGINX in the layer beneath it."

When Defender generates a GitHub issue from the recommendation, it includes **all** CVE IDs in scope of that recommendation — including these — passing engineering findings GHAS did not pick up.

### Caveats

- **Do not pin or engineer these.** They arrive from whatever base image you use and will change as the image ages. Treat them as opportunistic colour, not a scripted beat.
- Their count and severity vary run to run. Never quote a number you have not just read off the screen.
- If your base image happens to be clean at demo time, drop this beat rather than inventing it.

---

## F-5 — Agentless code scanning findings (Defender DevOps security)

| Field | Value |
| --- | --- |
| Detector | Trivy, ESLint, Checkov, Template Analyzer, Syft — run by the connector, not by CI |
| Where | Defender for Cloud → **Recommendations** (DevOps security) |
| Requires | Agentless code scanning enabled on the GitHub connector |

Relevant recommendations:

- *Repositories should have code scanning findings resolved*
- *Repositories should have infrastructure as code scanning findings resolved*
- *Repositories should have dependency vulnerability scanning findings resolved*

Agentless code scanning also generates an **SBOM** on every scan, giving a queryable dependency inventory in Cloud Security Explorer.

### Caveats

- **Preview** feature. Region-limited: Australia East, Canada Central, Central US, East Asia, East US, North Europe, Sweden Central, UK South, West Europe.
- Runs on a schedule, **not** on pipeline events: repository discovery every **8 hours**, code retrieval **daily**, scan duration **15–60 minutes**.
- **Cannot break builds** — unlike in-pipeline scanning.
- Overlaps with GHAS findings. This repo runs both ESLint (`ci.yml`) and CodeQL in CI, and agentless scanning runs ESLint and Trivy independently — so expect duplicates. Explain the difference (connector-driven vs. CI-driven) rather than pretending it is one system.
- Scans the **default branch** only.
- API calls count toward GitHub rate limits.
- The `deploy/k8s` manifests and the `Dockerfile` will also be picked up by Checkov as IaC targets. Some of those findings are the deliberate ones from F-6.

---

## F-6 — Internet-exposed workload (Defender CSPM attack path)

| Field | Value |
| --- | --- |
| Source | `deploy/k8s/service.yaml` — `type: LoadBalancer`, public Azure Standard Load Balancer, no authentication, no TLS, no WAF |
| Detector | Defender CSPM attack-path analysis |
| Where | Defender for Cloud → **Attack paths** / **Recommendations**; on the GitHub side as the `runtime-risk:internet-exposed` alert filter and property |
| Deliberate? | **Yes.** Documented in the manifest's own header comment. |

### Why it exists

The demo needs a real **Internet Exposure** runtime risk factor. A workload behind an internal service produces no exposure signal, and the `runtime-risk` filters in GitHub would return nothing. Defender **should** raise findings against this Service — that is the demo, not a bug.

Reachable without authentication once the LoadBalancer IP is assigned:

| Endpoint | Response |
| --- | --- |
| `GET /healthz` | `200` — `{"status":"ok","syntheticData":true, ...}` |
| `GET /readyz` | `200`/`503` — `{"status":"ready","database":{"mode":"query_only", ...}}` |
| `GET /api/orders?search=&limit=` | Synthetic order records — and the F-1 injection surface |

### Caveats

- **Never copy this Service into a real environment.** The production equivalent is an internal Service behind an ingress controller with TLS, a WAF, and `service.beta.kubernetes.io/azure-load-balancer-internal: "true"`.
- Northstar Orders has no authentication, so anyone with the IP can reach it — including `/api/orders`, the injectable endpoint. It serves only synthetic data, but you should still limit reach: uncomment `loadBalancerSourceRanges` in `service.yaml` and set it to your demo room's egress range.
- Scoping `loadBalancerSourceRanges` will also break the deploy workflow's `/healthz` smoke test, because the GitHub Actions runner falls outside the allowed range. Decide which you want before the pipeline runs.
- The public IP is billable for as long as it exists. Tear it down promptly — see [cleanup.md](cleanup.md).
- Exposure findings depend on Defender CSPM attack-path analysis completing. Do not promise this beat unless you have seen it in preflight.

---

## Cross-checking the same CVE on both sides

The single most convincing moment in the demo is one identifier appearing in two tools. Verify this at **T-4h**:

| Check | Where | Expected |
| --- | --- | --- |
| CVE ID in GitHub | Dependabot alert detail | e.g. `CVE-2021-23337` on `lodash` |
| CVE ID in Azure | Recommendation → Associated CVEs | the same CVE ID |
| Link exists | Related GitHub Alerts column | **View on GitHub** present |
| Link resolves | Click it | Opens the Dependabot alert |
| Mapping exists | Cloud Security Explorer → **Pushed by code repositories** | Returns `orders-portal` |
| Risk factor set | Inventory → container name | Marked **critical** |
| Exposure set | Attack paths / alert `runtime-risk` property | Internet-exposed |

If the first five pass and the sixth does not, the demo still works — you lose the prioritisation beat but keep the correlation. If the **Related GitHub Alerts** link is absent, stop and consult [troubleshooting.md](troubleshooting.md); that link is the demo.
