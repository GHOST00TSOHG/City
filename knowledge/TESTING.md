# TESTING (short)
Full detail: [BUILD-GUIDE.md §8](BUILD-GUIDE.md).
```bash
npm ci && npm run build && npm run test:smoke && gitleaks detect --redact
```
Playwright smoke (`tests/smoke.spec.ts`):
1. App loads, canvas visible.
2. Zero `console.error` / page errors.
3. Screenshots at each fixed camera spot in `tests/cameras.json` → `test-results/shots/`.
4. FPS check: sample 5 s, assert ≥ 50 on a laptop (CI headless: report only).
5. Each weather state renders without errors.
Attach the screenshots to the PR.
