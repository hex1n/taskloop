# 02 — Provider-Neutral Authority Transaction Seam

**What to build:** A behavior-preserving prefactor that gives the application one provider-neutral authority transaction boundary, explicit lock classes, and deterministic fault-injection seams, making the new authority implementation possible without scattering storage and lock decisions through orchestration.

**Blocked by:** 01 — Cross-Platform Authority Mechanism Spike.

**Status:** ready-for-agent

- [ ] Existing CLI and Hook behavior remains byte-compatible and the existing test suite stays green.
- [ ] Authority, Git-operation, criterion-lease, outcome, and maintenance locks enforce the approved non-reentrant ordering and reject forbidden nesting.
- [ ] Multi-authority work holds at most one authority lock at a time and never claims cross-authority atomicity.
- [ ] Fault injection can stop before/after append, locator publication, snapshot publication, and projection publication without provider-specific test APIs.
- [ ] The new seam remains inactive as task authority until the final hard cut; no shipped dual-read or dual-write truth is introduced.
