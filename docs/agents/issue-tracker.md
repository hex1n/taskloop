# Issue tracker: Local Markdown

Issues and specs for this repository live as Markdown files under `.scratch/`. Do not publish them to GitHub Issues.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- The feature specification is `.scratch/<feature-slug>/spec.md`.
- Implementation issues are separate files under `.scratch/<feature-slug>/issues/`, numbered from `01`.
- Triage state is a `Status:` line near the top of each issue file.
- Comments and conversation history append under a `## Comments` heading.

## Publishing

When a skill says to publish to the issue tracker, create or update the appropriate Markdown file under `.scratch/`. No remote issue, PR, or label mutation is implied.

## Fetching

Read the referenced local file directly. Callers should normally provide its path or feature slug.

## Wayfinding

- Map: `.scratch/<effort>/map.md`.
- Child ticket: `.scratch/<effort>/issues/<NN>-<slug>.md`.
- Blocking: `Blocked by: NN, NN` near the top.
- Claim: set `Status: claimed` before work.
- Resolve: set `Status: resolved`, append an `## Answer`, and update the map's decisions.
