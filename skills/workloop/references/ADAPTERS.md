# Criterion adapters

A provider Contract criterion is a read-only program run by `certify`.

- Exit `4` reports satisfied.
- Exit `3` reports unsatisfied.
- Exit `2` reports explicitly indeterminate.
- Exit `0` is silent and therefore indeterminate.
- Any other exit is invalid and therefore indeterminate.

The adapter must not edit repository files, invoke a producer, or read an
actor-writable verdict as the business truth. Its output may include one stable
`WORKLOOP_CRITERION: <reason>` line for a human-readable receipt.

Use a bounded required set for collections and bind snapshots to a fresh source
fingerprint. Missing, malformed, stale, or unavailable evidence is
indeterminate, not satisfied.
