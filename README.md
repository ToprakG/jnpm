# JNPM

JNPM is a dependency manager that uses Jev to make the small judgment calls humans normally make when maintaining dependency graphs.

JNPM handles the facts. Jev handles the judgment. JNPM executes the result.

Package installs, updates, and scripts go to the `npm` binary on your machine. `jnpm optimize` is the command that asks Jev which graph simplifications are safe, then applies only the ones that also pass deterministic checks. Jev never invents a version and never edits the filesystem.

## Install

Node.js 20 or newer.

```bash
npm install
npm link
```

`npm install` builds `dist/` through the `prepare` script. From a checkout you can also run `node dist/cli.js` or `npm run jnpm -- optimize`.

## Commands

```bash
jnpm install
jnpm add <package>
jnpm remove <package>
jnpm update
jnpm upgrade <package>
jnpm dedupe
jnpm optimize
jnpm doctor
jnpm audit
jnpm why <package>
jnpm explain <package>
jnpm tree
jnpm conflicts
jnpm outdated
jnpm clean
jnpm prune
jnpm lock
jnpm ci
jnpm run <script>
```

`install`, `add`, `remove`, `update`, `upgrade`, `dedupe`, `audit`, `outdated`, `clean`, `prune`, `lock`, `ci`, and `run` delegate to npm.

`tree`, `why`, `conflicts`, and `doctor` read `package-lock.json` (npm lockfile v2 or v3). They do not call Jev. pnpm and yarn lockfiles are not supported.

## optimize

```bash
jnpm optimize --show-plan
```

```text
Found 6 optimization opportunities.

✓ dedupe 1 package
    debug → 4.3.4
✓ remove 1 redundant dependency
    unused-lib
✓ consolidate 1 version range
    ms → 2.1.3
✓ replace 1 unnecessary transitive version
    once → 1.4.0
⚠ 1 upgrade requires review
    react 19.0.0, 18.3.1
✗ 1 change rejected as unsafe
    host 1.2.0, 1.1.0

Potential:
  18 packages → 14 packages
```

JNPM only proposes a version that is already installed. Jev is asked one yes/no probability (`compatible`) and one choice (`apply`, `review`, or `reject`) when every parent range and peer dependency already accepts that version. Broken peers are rejected without a model call. A different major is capped at review even if Jev says apply. A change is applied only when the yes probability is at least 0.85 and Jev chooses `apply`.

Create a `.env` in the project you are optimizing (see `.env.example`):

```bash
OPENROUTER_API_KEY=sk-or-...
```

That calls `typesafe/jev-1.13` through the [OpenRouter Decisions API](https://openrouter.ai/docs/guides/community/jev). Without a key, grey-area candidates are marked review and the plan still prints. An existing environment variable wins over `.env`.

```bash
jnpm optimize --apply
jnpm optimize --apply --install
jnpm explain <package>
```

`--apply` writes npm `overrides` for accepted versions and removes unused direct dependencies from `package.json`. It does not edit `node_modules`. `--install` runs `npm install` after that. `explain` prints the decision log from `.jnpm/decisions.json`.

## Development

```bash
npm test
```

Tests use Node's built-in test runner. They do not call the network or the npm registry. The fixture projects live in `test/fixtures/`.

MIT
