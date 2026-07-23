# Host bindings

Generate a host-owned recipe with one supported profile:

```sh
workloop hooks --profile codex --mode nudge
workloop hooks --profile claude --mode nudge
```

`observe` and `nudge` never decide tool execution. They record intent and
completion evidence when routing succeeds and otherwise release without
recording. Stop releases on Codex. `deny` is an explicit PreToolUse policy mode
and remains subordinate to the host's permission system.

Do not use `codex-safe` or any profile alias. If an older non-enforcing Hook
still invokes it, the runtime releases it with a diagnostic; correct the host
configuration manually before installing a new runtime.

The host owns its Hook files. Workloop never edits them. The installer performs
an activation preflight and refuses to replace a shim when a discovered Codex
Workloop handler is not exactly `--profile codex`.
