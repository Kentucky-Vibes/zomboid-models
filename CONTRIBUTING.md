# Contributing

Thanks for taking an interest. This page covers how the repository is set up, what a change needs before it can be merged, and the one rule that has no exceptions.

## No game assets in the repository

The repository holds code, documentation, and small synthetic fixtures only. Do not commit anything taken from Project Zomboid or from a mod: no models, textures, animations, scripts, or screenshots rendered from them. Tests that need real game files read them from a local install through the `PZ_DIR` environment variable and are skipped without it. Fixtures under `packages/pipeline/test/fixtures` and `visual/synthetic-game.ts` are written by hand for that reason.

## Setup

You need Node.js 22 or later and npm. Then:

```bash
npm install
npm run build
npm run check
```

`npm run check` runs the typecheck, the linter, the formatter in check mode, and the unit tests, which is what CI runs on every pull request. The screenshot tests need a Chromium once (`npx playwright install chromium`) and run with `npm run test:visual`; see the README for the real-asset variant.

The playground (`npm run dev -w playground`) is the quickest way to look at a change: point it at an asset folder built with the pipeline from your own install.

## Making a change

- Code, comments, commit messages, and documentation are in English.
- Follow the game. When the renderer or the pipeline has to decide how something looks or is chosen, the answer comes from the game's own code and data, and the comment or the docs say where it came from. A guess that looks fine is not a fix.
- Keep documents as snapshots of game state. Anything that happens over time (animation, the light bar, a door swinging) belongs to the viewer, not to the document formats.
- Add or update tests next to the code you touch. Pure functions get unit tests; the viewer's output is guarded by the screenshot tests under `visual/`.
- Run `npm run format` before committing; Prettier and ESLint settings are in the repository.

## Changesets

Every change that affects a published package gets a changeset: run `npm run changeset`, pick the packages, and describe the change for the changelog in a sentence or two written for a user of the package. The five packages are versioned together, so a bump in one bumps them all. Documentation-only and internal changes do not need one.

## Pull requests

Open the pull request against `main`. Describe what changed and why, and mention the game version you checked against when the change touches game data. CI has to pass; a reviewer from the Kentucky Vibes organisation merges.

## Reporting problems

Use the issue templates. For a rendering problem, the document (the JSON) and the game version matter more than a screenshot; for a pipeline problem, the warnings the build printed. Security issues go through the process in [SECURITY.md](SECURITY.md) instead of a public issue.
