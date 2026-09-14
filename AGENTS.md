# Project work rules

## Platform and build baseline

- This is a browser game: React/Vinext/Vite and a Rust `bevy_ecs` simulation
  compiled to WASM, hosted as a Cloudflare Worker via Sites. Do not infer mobile,
  desktop or console packaging from the word “game”. Read the manifests first.
- Preserve game behavior, original assets, pinned dependencies, hosting bindings,
  committed `public/wasm`, credentials and local user/database state.

## Mandatory build cleanup

- Use `npm run build`, `npm run engine:build`, `npm run build:release` and
  `npm start`. They use `scripts/build_lifecycle.py`; CI must use the same entry
  points and run `npm run build:clean` with `if: always()`.
- New build/packaging tools must use this lifecycle: owned per-job directories,
  advisory locks and process-group checks, cleanup on success/failure/signals,
  next-run recovery, staged validation and recoverable/atomic publication.
  Never run a destructive build directly against the last working output.
- Never recursively delete arbitrary caller-supplied paths, unknown directories,
  another running job's files, Git data, shared dependency caches, source assets,
  secrets, saves, deployment/patch/rollback baselines or crash-analysis files.
  Ignore rules, suffixes and file age are not evidence that deletion is safe.
- Retain the last two generated development packages **per tool** and ten raw
  logs total, capped at 1 MiB each. Active readers may defer pruning. Releases,
  initial/unclassified outputs and symbols are excluded from count-based cleanup.
- Do not accumulate date/number-based archives or extracted working copies
  without a concrete reason. Debug exceptions must record purpose, exact path,
  owner and deletion date/event in `docs/build-cleanup.md` before being retained.
- Any deletion must have a regeneration/ownership reason. Report cleanup failures
  with the remaining path. Hash important preserved files before/after one-off
  cleanup. Test lifecycle changes with `npm run test:cleanup`; validate one web
  build with `npm test` without needlessly repeating large compilations.
- See `docs/build-cleanup.md` for commands, retention, recovery and exceptions.
