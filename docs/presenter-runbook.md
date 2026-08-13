# Presenter runbook

Persona-led walkthrough of the GHAS + Microsoft Defender for Cloud demo.

The application you are demonstrating is **Northstar Orders** — a fictional enterprise inner-source order portal running on **synthetic** data. Use that name throughout. Never substitute a real customer's name, and never imply the scenario came from a real engagement.

> **Naming, so you don't stumble on stage:** the application is *Northstar Orders*. Its container image, Kubernetes deployment, and service are all named `orders-portal`, in namespace `ghas-mdc-demo`. Say "Northstar Orders" for the application; read `orders-portal` when pointing at a Kubernetes object, an image, or a Defender recommendation. Explain that once, early.

**Total: ~35 minutes** (25 min core, 10 min buffer). Scenario 2 is the spine — if you are short on time, cut scenario 3 first, then scenario 1.

Prerequisite: [setup.md](setup.md) completed at **T-48h**. Nothing in this runbook creates data that appears fast enough to demo live.

---

## Personas

| Act | Persona | Tool | Question they are answering |
| --- | --- | --- | --- |
| 1 | **Security manager** | Microsoft Defender for Cloud | "Of everything running in my cloud, what actually matters, and who owns the fix?" |
| 2 | **AppSec engineer** | GitHub Security | "Which of my thousands of alerts are in code that is genuinely deployed and exposed?" |
| 3 | **Developer** | GitHub + Copilot | "Fine — fix it, and let me review the diff." |

The arc is one CVE travelling from a running container back to a line in `package.json` and then forward again as a pull request.

---

## Preflight — T-30 minutes

Do not skip. Every item has burned someone.

**Environment**

- [ ] `node scripts/verify-demo.mjs` passes.
- [ ] `GET /healthz` on the LoadBalancer IP returns `200` with `"syntheticData": true` — proving the app is serving the synthetic dataset, not just that pods are up.
- [ ] Service present: `kubectl get svc orders-portal -n ghas-mdc-demo`.
- [ ] ACR contains the pipeline-built image tag.
- [ ] The pipeline built the image **after** the Defender connector was created.
- [ ] `gh variable list --repo "$ORG/$REPO"` shows `DEMO_CONFIGURED=true` — otherwise a re-run mid-demo will silently skip.

**Defender for Cloud**

- [ ] Cloud Security Explorer: **Container Images → Pushed by code repositories** returns your image.
- [ ] Recommendations: an `Update ...` recommendation exists for your container.
- [ ] That recommendation's **Associated CVEs** tab lists the lodash CVE.
- [ ] At least one CVE row shows a **View on GitHub** link under **Related GitHub Alerts**.
- [ ] **Remediation Insights** renders the code-to-runtime diagram.
- [ ] Inventory: the container shows as **critical**.

**GitHub**

- [ ] Code scanning alert for the SQL injection exists.
- [ ] Dependabot alert for `lodash@4.17.20` exists and is **Open** (lead with CVE-2021-23337 — verify the exact ID on screen).
- [ ] Advanced Security shows **Enabled** on the repo.
- [ ] Copilot coding agent is assignable — confirm "Copilot" appears in the issue assignee picker.
- [ ] No GitHub issue has already been generated from the recommendation (otherwise the **Take action** button offers a different path).

**Presentation hygiene**

- [ ] Browser tabs pre-loaded and pre-authenticated: Defender Recommendations, Defender Cloud Security Explorer, GitHub Security tab, GitHub Dependabot alerts, GitHub Issues.
- [ ] Fallback screenshot deck open in a separate window (see [Fallback evidence](#fallback-evidence)).
- [ ] Zoom level raised; the Defender SDLC diagram is dense.
- [ ] Notifications silenced.

**If any Defender checkbox fails**, do not troubleshoot live. Switch to the fallback deck for that act and continue. See [troubleshooting.md](troubleshooting.md) afterwards.

---

## Act 0 — framing (2 min)

Say this explicitly, up front:

> "This is a public MIT reference template. I'm demoing from a **disposable private copy** in a licensed org, and I'll delete it when we're done. The application is **Northstar Orders** — a fictional inner-source order portal running on entirely synthetic data. It isn't anyone's real system. The vulnerabilities are deliberate. Everything you'll see is native product behaviour — no custom glue."

Then add the naming note, once, so nobody gets lost later:

> "One thing to keep straight: the application is Northstar Orders. Its container image, its Kubernetes deployment, and its service are all called `orders-portal`. Same system — that's just what it's named in Azure."

Then set the problem:

> "Two teams, two tools. Security sees a CVE in a running container and doesn't know who owns it. Engineering sees ten thousand dependency alerts and doesn't know which two are actually running in production. The integration closes that gap in both directions."

Name the three scenarios and their boundaries now, so you never have to backtrack:

1. **CodeQL SQL injection** — static analysis depth, plus AI-assisted fixing.
2. **`lodash@4.17.20`** — the runtime correlation flow. *This is the main event.*
3. **Secret detection** — adjacent GHAS capability. Different mechanism, not the same correlation.

---

## Act 1 — Security manager, in Defender for Cloud (8 min)

**Framing:** "I own cloud posture. I've just been handed a container VA finding."

### 1.1 Start at the recommendation

Defender for Cloud → **Recommendations** → search for `orders-portal` → open an **Update ...** recommendation.

> "This isn't a scanner report. It's a recommendation on a workload that is running right now in AKS — the Northstar Orders portal, deployed as `orders-portal`."

### 1.2 Associated CVEs — the correlation moment

Open the **Associated CVEs** tab.

Point at the **Related GitHub Alerts** column and read it out:

| What you see | What it means |
| --- | --- |
| A **View on GitHub** link | Engineering already knows. There is a GHAS alert for this CVE. |
| Link present, alert status **Active** | Known, but nobody has fixed it. Prioritise it. |
| **No** matched GitHub alert | A runtime risk engineering has no visibility of — often a base-image, OS, or NGINX-layer CVE that isn't a direct dependency. |

> "That last row is the one security teams usually can't produce: a CVE that is real, running, and invisible to the dependency tooling."

Click **View on GitHub** for the lodash CVE. It opens the GHAS alert — this is the code-to-runtime link, live.

> Requires access to the GitHub repository. Without it you get the link but not the content — copy it and hand it to a GitHub admin. Say this if an audience member asks.

### 1.3 Remediation Insights — the SDLC chain

Open the **Remediation Insights** tab.

Walk the diagram left to right: **Source → CI/CD pipeline → Registry → Runtime**.

> "Defender worked this out itself. I didn't tag anything. The connector, the OCI labels stamped at build time, and the artifact attestation from the Actions run each give it the image digest, the commit, and the build identity."

Then open **All impacted assets**:

> "This is blast radius. One source, many workloads. Fixing it at runtime means it comes back on the next deploy. Fixing it at source fixes all of them."

Mention you can filter that grid by Kubernetes namespace to route work to the owning team — `ghas-mdc-demo`, in this case.

### 1.4 Risk factors

Show the container marked **critical** in **Inventory**, or the risk factor on the recommendation.

> "This workload is classified business-critical by a rule I wrote in resource criticality — Northstar Orders is a revenue-path system in this story. That classification is what promotes this CVE above the other four hundred."

Other risk factors Defender CSPM derives from attack-path analysis: **Internet Exposure**, **Sensitive Data**, **Critical Resources**, **Lateral Movement**. Mention them; only claim the ones you can actually see on screen.

### 1.5 Hand off to engineering

**Remediation Insights** → the **Runtime** box → **Take action** → **Generate GitHub issue**.

> "I'm not emailing a spreadsheet. I'm creating an issue in the Northstar Orders repository — the repo this container was actually built from — pre-populated with every CVE in scope plus the runtime and SDLC context needed to fix and test it."

A popup confirms with a link to the issue. Open it. Point out the `Defender for Cloud` and `security` labels.

**Checkpoint:** if **Generate GitHub issue** is missing or greyed out, you are missing GitHub or repository permissions. Do not debug live — switch to your pre-created issue (see [Fallback evidence](#fallback-evidence)) and carry on.

---

## Act 2 — AppSec engineer, in GitHub (8 min)

**Framing:** "I'm on the other side of that handoff, drowning in alerts."

### 2.1 The volume problem

Repo → **Security and quality** → **Dependabot**.

> "Every one of these is technically true. Almost none of them are urgent. Which ones are running in production and reachable?"

### 2.2 Production context filters

Apply a production-context filter, for example:

```text
has:deployment AND runtime-risk:internet-exposed
```

> "That deployment metadata isn't something I maintained. It's populated automatically because Defender for Cloud is connected."

Also available: `artifact-registry` and `artifact-registry-url` from storage records, and the `runtime-risk` values shown as properties on individual alert pages. See [Prioritizing alerts using production context](https://docs.github.com/en/code-security/tutorials/secure-your-organization/prioritize-alerts-in-production-code).

**Checkpoint:** if the filter returns nothing, do not improvise. Criticality context takes **up to 12 hours** to propagate from Defender to GitHub. Show the runtime-risk properties on the individual alert page instead, or fall back to screenshots.

### 2.3 Open the alert

Open the Dependabot alert for `lodash@4.17.20`. Show the CVE ID, severity, the direct-dependency attribution, and any runtime-risk properties.

> "Same CVE ID the security manager was looking at in Defender. Not a mapping table I built — one identifier, two tools."

If more than one lodash advisory is listed, say so rather than glossing over it:

> "There's more than one advisory here, and they have different fixed versions. That's normal — and it's exactly why you want the upgrade decision made against live advisory data, not a number someone wrote down last quarter."

### 2.4 Campaigns (optional, 2 min)

If you created one at setup: org → **Security** → **Campaigns**.

> "Rather than triaging by hand each week, I publish a campaign filtered on runtime risk. It tracks progress and it's visible to both sides."

Campaigns are organization-level only — mention that, it is a common question.

### 2.5 Scenario 1 — CodeQL and Autofix

Switch to **Code scanning** and open the SQL injection alert.

> "Different class of problem. Not a dependency — our own code. CodeQL traced user input through to a query built by string interpolation in `src/database.ts`, over a query-only synthetic SQLite store."

Scroll up a few lines in the same file to `listOrders()`, which binds its parameter correctly:

> "The correct pattern is ten lines above the broken one. That's what real code looks like — this isn't a toy."

If a **Copilot Autofix** suggestion is present: open it, read the diff, and be honest about it.

> "This is a suggestion generated by an LLM using the codebase and the CodeQL analysis. It's a starting point, and it still needs review — including checking it preserves intended behaviour. It's available for CodeQL analysis and doesn't need a Copilot subscription."

**Checkpoint:** Autofix coverage varies by alert. If no suggestion is offered, say so plainly and describe the parameterised-query fix instead. Do not claim coverage you cannot show.

**Be explicit about the boundary:**

> "Note what I am *not* claiming. This CodeQL finding does not flow through the Defender correlation. Code-to-runtime recommendations currently cover container and container-image vulnerability assessment. This is static analysis depth, shown alongside — not part of the same chain."

---

## Act 3 — Developer, with Copilot (6 min)

**Framing:** "The issue just landed in my queue."

### 3.1 Read the issue

Open the generated issue. Point out that it arrived with runtime context attached — not just "upgrade this".

> "I didn't have to ask why this one. The issue tells me it's running, it's classified critical, and where in the SDLC it came from."

### 3.2 Assign the Copilot coding agent

Assign **Copilot** as the assignee.

> "Copilot cloud agent works in the background in its own ephemeral environment powered by GitHub Actions. It can explore the repo, make changes on a branch, run tests and linters, and open a pull request."

The repository ships `.github/github-app.yml`, which gives the agent standing instructions — worth mentioning if the audience is technical:

- Preserve the seeded findings **unless the assigned task is their remediation**.
- Never add real credentials or customer data.
- Keep the vulnerable SQL path limited to the synthetic data set.
- Run lint, typecheck, build, and tests before proposing changes.
- Treat **`npm run test:security`** as the remediation acceptance test.

> "We've told the agent the rules of this repo — including which test proves the fix. That's guardrails for AI-authored changes, not blind trust."

**Do not wait for it live.** Agent runs take minutes and are non-deterministic. Say so:

> "I'm not going to watch a progress bar. Here's one I ran earlier."

Switch to the pre-staged PR.

### 3.3 Review the PR

Show the diff: the `lodash` bump in `package.json` and the regenerated lockfile. Show the CI checks. Show that CodeQL and Dependabot re-ran.

> "This is still a pull request. It gets reviewed, it gets tested, it gets approved by a human. The agent removed the typing, not the judgement."

If the repo's security regression tests ran (`npm run test:security`), point at them:

> "And there's a test asserting the fix holds — so the next person can't quietly reintroduce it."

### 3.4 Close the loop

Back in Defender for Cloud → **Recommendations**.

> "Issue status and assignment changes in GitHub are reflected here. Security can see ownership and progress without asking. When the issue closes, Defender updates the status to Closed."

If your pre-staged PR is merged and the pipeline has re-run, you can note that the next image build removes the finding — but do **not** promise a live-updated recommendation. Registry rescan and runtime inventory are on their own cycles.

---

## Act 4 — Scenario 3, secret detection (4 min, optional)

**Only run this if you completed the opt-in setup and are comfortable.** Skip it under time pressure.

### 4.1 Frame the boundary first

> "Changing gears. This is **adjacent GHAS capability** — it is *not* the runtime-CVE correlation we just walked through. Different detection engine, no Defender involvement, no runtime risk factor. I'm showing it because secret exposure is the other half of what teams ask about, but I don't want you to conflate the two."

### 4.2 Safety statement

Say this out loud, every time:

> "This key was generated on this machine a few minutes ago by a script that refuses to run against a public repo. The matching public key was discarded, so it authenticates to nothing. It lives only in a disposable private repo that I'm deleting after this session. **Never do this with a real credential — not in a demo, not anywhere.**"

### 4.3 Show it

The key was generated in preflight with:

```powershell
node scripts/generate-demo-secret.mjs --acknowledge-disposable-private-repo
```

Either:

**(a) Push protection blocks the push** — commit the generated key and push. The push is rejected at the client with the detected secret type.

```powershell
git add -f demo-generated/unregistered-demo-private-key.pem
git commit -m "demo: seed generic secret canary"
git push
```

> "Blocked before it ever reaches the remote. This is GitHub Secret Protection's push protection using built-in generic patterns — `rsa_private_key` here."

Or:

**(b) Bypass, then alert** — bypass push protection with a reason, then show the alert under **Security and quality** → **Secret scanning**.

> "If I bypass, that's recorded, and it generates an alert for the security team. Detection and accountability, not just a wall."

Decide which one before you start; do not attempt both live.

Note the categories: **generic** patterns (regex, includes private keys), **AI-detected** patterns (unstructured secrets like passwords), and **provider** patterns (AWS, Azure, Stripe). Generic detection is model-assisted for the unstructured cases and does not require a Copilot subscription.

### 4.4 Delete the key immediately

Do this on camera. It reinforces the message.

```powershell
node scripts/generate-demo-secret.mjs --clean
```

The authoritative cleanup is deleting the repository. See [cleanup.md](cleanup.md).

---

## Close (2 min)

> "One CVE. Security found it running, saw engineering already had an alert for it, saw the blast radius, and routed it to the owning repo with context. AppSec filtered by what's actually deployed. A developer got a reviewable pull request. Nothing custom — that's product behaviour."

Then the honest caveats, because they build credibility:

- **Everything here is asynchronous.** Documented windows run to 8 hours for resource discovery, 4 hours for image mapping, and up to 24 hours for end-to-end validation, with a further 12 hours for criticality to reach GitHub. Pre-stage; nobody demos this live.
- **Scope is bounded.** Code-to-runtime recommendations currently cover container and container-image VA. Linux language packages only. Not supported on Windows nodes or AKS ephemeral-OS-disk nodes.
- **Paid plans and explicit authorization.** GHAS, Secret Protection, Copilot, and Defender CSPM are all billable, opt-in enablements, and the connector requires an interactive Authorize plus App Install.
- **Not production.** See [safety-and-production-gaps.md](safety-and-production-gaps.md).

---

## Fallback evidence

Capture all of these at **T-4h** while everything is verified green. Keep them in one deck, in demo order.

| # | Screenshot | Covers |
| --- | --- | --- |
| 1 | Defender recommendation, **Associated CVEs** tab, with a visible **View on GitHub** link | Act 1.2 |
| 2 | The GHAS alert reached via that link | Act 1.2 |
| 3 | **Remediation Insights** code-to-runtime diagram | Act 1.3 |
| 4 | **All impacted assets** grid | Act 1.3 |
| 5 | Inventory showing the container marked **critical** | Act 1.4 |
| 6 | **Take action → Generate GitHub issue** menu open | Act 1.5 |
| 7 | The generated GitHub issue, labels visible | Act 1.5 / 3.1 |
| 8 | Dependabot alert list with a production-context filter applied | Act 2.2 |
| 9 | Dependabot alert detail, CVE ID and runtime-risk properties | Act 2.3 |
| 10 | Campaign view, if used | Act 2.4 |
| 11 | CodeQL alert with the data-flow path | Act 2.5 |
| 12 | Copilot Autofix suggested diff (if it was offered) | Act 2.5 |
| 13 | Copilot coding agent PR with checks passing | Act 3.3 |
| 14 | Push protection block message | Act 4.3a |
| 15 | Secret scanning alert | Act 4.3b |
| 16 | Cloud Security Explorer validation query returning results | Preflight |

**Pre-create and keep in reserve:**

- A GitHub issue generated from the recommendation on a previous run — in case **Generate GitHub issue** fails or is greyed out.
- A merged or open Copilot coding agent PR — you will use this rather than waiting live.
- A short screen recording of the push-protection block, if scenario 3 matters to this audience.

**Rule:** if any single step fails on stage, you get **one** retry. After that, switch to the corresponding screenshot, narrate it as "here's what this looks like", and keep moving. Debugging live loses the room and never works.

---

## Things not to say

Avoid claims you cannot substantiate on screen:

- ❌ Presenting Northstar Orders as a real product, a real customer system, or a real engagement. It is **fictional**, the data is **synthetic**, and it represents no actual organization. **Never rename it after a prospect or customer** to "make it land" — that invents a security incident for a named company.
- ❌ "Real time" / "instantly" — it is asynchronous, with published multi-hour windows.
- ❌ "Copilot fixes it automatically" — it opens a **pull request** that a human reviews. Autofix produces a **suggestion**.
- ❌ "Autofix works on every alert" — coverage varies; show what is actually offered.
- ❌ "This correlates the SQL injection to runtime" — it does not. Container/image VA only.
- ❌ "The secret finding flows into Defender" — it does not.
- ❌ "Zero configuration" — connector authorization, App install, paid plan enablement, and criticality rules are all deliberate operator actions.
- ❌ Any performance, detection-rate, or comparative claim not printed in the product docs.

If asked something you do not know: "I don't want to guess — it's in the Learn docs, I'll send you the link." That answer costs nothing and protects everything else you said.
