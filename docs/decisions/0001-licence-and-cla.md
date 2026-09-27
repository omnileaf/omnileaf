# 0001: Licence and contributor agreement

- Status: Accepted
- Date: 2026-09-27

## Context

Omnileaf is open source and is also funded by paid builds. Some app stores impose terms on distribution that are incompatible with the GPL. Only a copyright holder can publish GPL code under those terms, and only for code whose rights it holds.

## Decision

- **Licence:** Omnileaf's own code is licensed under the GPL, version 3 only (`GPL-3.0-only`).
- **Contributor agreement:** contributions are accepted under a Contributor License Agreement based on the Harmony individual agreement (HA-CLA-I 1.0), using its Option Five outbound licence. The project may license contributions under other terms as well, but always also under the project's licence. Contributors keep their copyright.
- **Signing:** the agreement is signed through cla-assistant.io on a contributor's first pull request.
- **Third-party code:** dependencies must be under permissive licences (such as MIT, Apache-2.0, BSD or ISC) or MPL-2.0. Third-party GPL, LGPL and AGPL code is not accepted, because the project couldn't license it under other terms.

## Consequences

- Forks must stay open source under the GPL, and the name and logo stay reserved (see [TRADEMARKS.md](../../TRADEMARKS.md)).
- Pull requests from outside contributors can't be merged until the agreement is in effect.
- The dependency licence policy is enforced in CI once the build tooling lands.
- RAR support can't use the UnRAR library, whose licence is incompatible with the GPL. A permissively licensed decoder is used instead.

## Alternatives considered

- **MIT or Apache-2.0:** simplest, but anyone could republish a rebranded paid copy.
- **MPL-2.0:** keeps changed files open, but doesn't prevent republished copies either.
- **GPL-3.0-or-later:** hands future licence versions to a third party. The agreement already covers relicensing.
- **Developer Certificate of Origin instead of a CLA:** it certifies origin but grants no rights beyond the GPL, so it can't support store builds.
