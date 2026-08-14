# Northstar Orders: GHAS showcase

Northstar Orders is a small, fictional TypeScript order portal built to show
how GitHub Advanced Security (GHAS) finds, prioritizes, and fixes issues. The
optional Azure path shows how Microsoft Defender for Cloud adds runtime context
to the same development workflow.

> [!CAUTION]
> This repository deliberately contains documented vulnerabilities and an
> outdated dependency. It is an educational demo, not a production template.
> Use a disposable private copy, synthetic data, and delete the environment
> after the demonstration.

## The business value

GHAS is not just another scanner. It creates a security control point where
developers already work, then Defender for Cloud adds the production context
that GitHub alone cannot see.

| Without the integration | With GHAS + Defender for Cloud |
| --- | --- |
| Developers receive a large list of technically valid alerts | Teams focus on the vulnerable code that is actually deployed |
| Cloud security finds a risky container and emails engineering | Defender links the image to its source repository and GitHub alert |
| Fixes are tracked in spreadsheets or disconnected tickets | A contextual GitHub issue routes remediation to the owning team |
| Security checks happen late in the release process | CodeQL, Dependabot, and secret protection catch issues before release |
| AI suggestions are difficult to trust in isolation | AI accelerates review while GHAS findings, tests, and human approval remain the control boundary |

**Demo takeaway:** GHAS reduces the time from *finding a vulnerability* to
*assigning the right fix*, while Defender helps prove which findings matter in
the environment that is actually running.

## The story in three acts

| Act | Tool | What to show |
| --- | --- | --- |
| 1. Find | GitHub CodeQL, Dependabot, secret scanning | Three realistic security findings in a small codebase |
| 2. Prioritize | Defender for Cloud (optional) | A deployed container CVE, runtime exposure, and code-to-cloud context |
| 3. Fix | Copilot Autofix, Copilot coding agent, or `/security-review` | An AI-assisted review, a focused fix, and a security regression test |

The main end-to-end scenario is `lodash@4.17.20`: Dependabot identifies the
direct dependency, Defender can correlate it to the running image, and a
GitHub issue can hand the fix to Copilot. The SQL injection and secret canary
are separate GHAS capabilities, not part of the Defender correlation.

The integration is deliberately bidirectional:

```text
GitHub: source + alerts + ownership
              ↓
Actions: build provenance + image digest
              ↓
Defender: deployed asset + exposure + criticality
              ↓
GitHub: contextual issue + Copilot-assisted remediation
```

## Start locally

```powershell
npm ci
npm run lint
npm run typecheck
npm run build
npm test
npm start
```

Open <http://localhost:3000>. The app serves only synthetic, in-memory order
data. The intentionally vulnerable search path is bounded and read-only.

To demonstrate the remediation gate:

```powershell
npm run test:security
```

That test is expected to fail until the SQL injection is fixed correctly. This
keeps the finding visible for GHAS while making the intended remediation
measurable.

## Showcase GHAS in GitHub

Use a disposable **private** copy in an organization licensed for GitHub Code
Security and Secret Protection.

1. Enable CodeQL advanced setup, Dependabot alerts, secret scanning, and push
   protection.
2. Let `.github/workflows/codeql.yml` and `.github/workflows/ci.yml` run.
3. Open **Security and quality** and show:
   - the CodeQL SQL injection alert in `src/database.ts`;
   - the Dependabot alert for `lodash@4.17.20`;
   - secret scanning as an opt-in scenario using
     `npm run demo:secret`.
4. Use Copilot Autofix where available, or assign the generated issue to the
   Copilot coding agent.

For a pre-PR terminal review, run the dedicated Copilot CLI command from the
repository:

```text
/security-review
```

It is an additional AI review, not a replacement for CodeQL, Dependabot, or
secret scanning. See [Agentic security](docs/agentic-security.md) for the
short demo script and source links.

## Optional Defender for Cloud path

The Azure path builds an attested image with GitHub Actions, pushes it to ACR,
and deploys it to AKS. Defender for Cloud can then connect:

```text
source -> Actions -> ACR -> AKS -> Defender recommendation -> GitHub issue -> PR
```

What the audience should see:

1. GitHub records the dependency alert and the repository that owns the code.
2. Actions publishes provenance so the image can be traced to a commit.
3. Defender identifies the image in ACR or AKS and adds CVE, exposure, and
   criticality context.
4. **Generate GitHub issue** sends that context back to the repository, where
   the developer can review a fix and run the security regression test.

Start with [docs/setup.md](docs/setup.md), then use
[docs/presenter-runbook.md](docs/presenter-runbook.md). Provisioning is
billable and asynchronous; prepare the environment at least 24 hours before a
live demo and clean it up immediately afterwards.

## What is intentionally seeded

| Finding | GHAS capability | Why it exists |
| --- | --- | --- |
| SQL injection over synthetic read-only SQLite | CodeQL + Autofix | Shows data-flow analysis and a regression test |
| `lodash@4.17.20` direct dependency | Dependabot + Defender VA | Shows code-to-runtime correlation |
| Generated, unregistered private key | Secret scanning + push protection | Shows prevention and triage |

Do not add real credentials, customer data, exploit code, or a vulnerability
whose blast radius extends beyond the disposable demo environment.

## Reference docs

- [Agentic security](docs/agentic-security.md) - `/security-review` and the
  multi-model security narrative
- [Presenter runbook](docs/presenter-runbook.md) - the live walkthrough
- [Setup](docs/setup.md) - private-copy, GitHub, Azure, and Defender setup
- [Findings catalog](docs/findings-catalog.md) - exact seeded findings
- [Architecture](docs/architecture.md) - detailed code-to-runtime design
- [Safety and production gaps](docs/safety-and-production-gaps.md) - boundaries
- [Cleanup](docs/cleanup.md) - teardown steps
- [Troubleshooting](docs/troubleshooting.md) - asynchronous Defender issues

## Official references

- [GHAS integration with Microsoft Defender for Cloud](https://learn.microsoft.com/azure/defender-for-cloud/github-advanced-security-overview)
- [Dedicated security review command in Copilot CLI](https://github.blog/changelog/2026-06-10-dedicated-security-review-command-now-available-in-copilot-cli/)
- [Microsoft: Defense at AI speed](https://www.microsoft.com/en-us/security/blog/2026/05/12/defense-at-ai-speed-microsofts-new-multi-model-agentic-security-system-tops-leading-industry-benchmark/)

## License

[MIT](LICENSE)
