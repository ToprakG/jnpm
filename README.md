# JNPM

JNPM is a dependency manager. A dependency manager installs packages and updates packages. A dependency graph is the set of packages that a project needs. JNPM uses Jev for the small decisions that a person makes during work on a dependency graph.

Jev is a decision model. You send Jev the facts and a fixed set of options. Jev returns a probability for each option.

JNPM keeps the facts. Jev makes the decision. JNPM performs the action.

The install, update, and script commands call the npm program on your computer. The command `jnpm optimize` asks Jev which simpler graphs are safe. JNPM applies a change only when the fixed checks also pass. Jev does not create a version. Jev does not edit files.

## Install

You need Node.js 20 or a newer version.

1. Run `npm install`.
2. Run `npm link`.

The `prepare` script builds the `dist/` folder when you run `npm install`. You can also run `node dist/cli.js`. You can also run `npm run jnpm -- optimize`.

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

These commands call npm:

- `install`
- `add`
- `remove`
- `update`
- `upgrade`
- `dedupe`
- `audit`
- `outdated`
- `clean`
- `prune`
- `lock`
- `ci`
- `run`

These commands read `package-lock.json`:

- `tree`
- `why`
- `conflicts`
- `doctor`

JNPM reads npm lockfile version 2 and version 3. These four commands do not call Jev. JNPM does not read a pnpm lockfile. JNPM does not read a yarn lockfile.

## optimize

Run this command:

```bash
jnpm optimize --show-plan
```

The command prints a plan like this example:

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

JNPM proposes only a version that is already on the computer.

A parent range is the version range that one package requires. A peer dependency is a package that must already be present. JNPM asks Jev two questions when every parent range accepts the proposed version and every peer dependency accepts that version.

- `compatible` is the probability that the answer is yes.
- `action` is one of these choices: `apply`, `review`, or `reject`.

JNPM rejects a broken peer dependency. JNPM does not call Jev for that case.

A major number is the first part of a version. If the proposed version has a different major number, JNPM sets the result to `review`. JNPM does this even when Jev selects `apply`.

JNPM applies a change only when both of these conditions are true:

1. The yes probability is 0.85 or higher.
2. Jev selects `apply`.

Put a `.env` file in the project that you optimize. The file `.env.example` shows the shape.

```bash
OPENROUTER_API_KEY=sk-or-...
```

This key calls the model `typesafe/jev-1.13` through the [OpenRouter Decisions API](https://openrouter.ai/docs/guides/community/jev). If you do not set a key, JNPM marks each uncertain candidate as `review`. JNPM still prints the plan. If the same name is already in the environment, JNPM uses that value. JNPM ignores the value in `.env`.

You can also run these commands:

```bash
jnpm optimize --apply
jnpm optimize --apply --install
jnpm explain <package>
```

`--apply` writes an npm override for each accepted version. An override forces one version of a package. `--apply` removes each unused direct dependency from `package.json`. `--apply` does not edit the `node_modules` folder.

`--install` runs `npm install` after `--apply`.

`explain` prints the decision log in `.jnpm/decisions.json`.

## Development

Run this command:

```bash
npm test
```

The tests use the test runner in Node.js. The tests do not call the network. The tests do not call the npm registry. The example projects are in `test/fixtures/`.

The license is MIT.
