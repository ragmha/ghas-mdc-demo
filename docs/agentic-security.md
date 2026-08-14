# Agentic security showcase

This repository is a compact stage for showing how AI-assisted security fits
alongside GHAS and Defender for Cloud. The tools have different jobs:

| Layer | Tool | Job |
| --- | --- | --- |
| Prevent and detect | CodeQL, Dependabot, secret scanning | Produce durable, repository-native findings |
| Review early | Copilot CLI `/security-review` | Review local changes before a commit or pull request |
| Investigate and fix | Copilot Autofix or coding agent | Suggest or implement a change for human review |
| Prioritize in context | Defender for Cloud | Connect a vulnerable image to deployment and runtime risk |

## Five-minute terminal demo

Run this from the repository after the seeded CodeQL issue has been shown:

```text
/security-review
```

Ask the reviewer to focus on the order-search path and compare its result with
the CodeQL alert in `src/database.ts`. The point is not that one AI review
replaces GHAS. The point is layered defense:

1. `/security-review` gives fast, local feedback on the current worktree.
2. CodeQL provides repeatable data-flow analysis in GitHub.
3. The security regression test proves the remediation.
4. Dependabot and Defender cover the dependency and deployed-image path.

Treat the command as preview functionality and review every suggestion. It is
independent of CodeQL, Dependabot, and secret scanning.

## Connecting to the multi-model story

Microsoft describes a multi-model, agentic security system that combines
specialized agents and models to discover and validate vulnerabilities at
scale. Use that as the forward-looking transition:

> "The local review is one focused security agent. The broader direction is
> coordinated agents that specialize, challenge one another, and feed
> validated findings into developer and defender workflows."

Keep the distinction clear: this repository demonstrates the workflow and
human review boundary; it does not claim to reproduce Microsoft's internal
system or benchmark.

## References

- [Dedicated security review command now available in Copilot CLI](https://github.blog/changelog/2026-06-10-dedicated-security-review-command-now-available-in-copilot-cli/)
- [Defense at AI speed: Microsoft's new multi-model agentic security system](https://www.microsoft.com/en-us/security/blog/2026/05/12/defense-at-ai-speed-microsofts-new-multi-model-agentic-security-system-tops-leading-industry-benchmark/)
