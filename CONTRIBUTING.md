# Contributing

Contributions that make the demo safer, more reproducible, or easier to explain
are welcome.

## Before opening a pull request

1. Read [the safety boundaries](docs/safety-and-production-gaps.md).
2. Never add a real credential, customer record, or production endpoint.
3. Keep seeded findings deterministic and limited to synthetic data.
4. Run `npm run lint`, `npm run typecheck`, `npm run build`, and `npm test`.
5. Describe any change to expected GHAS or Defender findings.
6. Update the setup or presenter guidance when a portal or workflow step changes.

The intentionally failing `npm run test:security` command represents the seeded
SQL-injection regression. It should become green only in a remediation branch or
pull request.

