# Publishing dsh-skill-center

This document describes the expected GitHub release flow and the upstream listing
request for `awesome-dsh-plugin`. The plugin itself is a plain
ESM package with no build step and no runtime dependencies.

## 1. Create the GitHub repository

Use the plugin directory as the repository root. Do not commit local caches or test
fixtures.

```bash
cd dsh-skill-center
git init
git add .
git commit -m "feat: initial dsh-skill-center plugin"
git branch -M main
git remote add origin https://github.com/subeichen1/dsh-skill-center.git
git push -u origin main
```

Recommended repository settings:

- Description: `Per-project and per-user switches for non-bundled DSH skills, with token estimates and SKILL.md editing.`
- Topics: `dsh`, `deepseek-harness`, `dsh-plugin`, `skills`, `cordis`
- Visibility: public
- License: MIT (already included in [`LICENSE`](../LICENSE))

## 2. Tag a release

```bash
git tag v0.1.1
git push origin v0.1.1
```

Create a GitHub Release from the tag. A minimal release note:

```markdown
## v0.1.1

- Per-project / per-user switches for non-bundled DSH skills
- Read-time defaults: project skills on, user skills off
- Three-state overrides: inherit / on / off
- Token estimate for the resident skill catalog
- Hot invalidation on the next agent pre-step
- Settings and sidebar UI with workspace, source and status filters
- SKILL.md edit, duplicate-as-template and delete actions
- Automatic bilingual descriptions for newly added skills
- Agent-scope self-check and /name fallback notice
```

## 3. Install check

Verify the public install command from a clean profile:

```bash
dsh plugin --profile web add github:subeichen1/dsh-skill-center
```

Then open **Settings → Skill Center** and check:

- the section appears without a browser error;
- the token summary renders;
- a user-level skill can be switched on/off and the notice says “next turn”;
- the plugin manager shows the plugin as active.

If the client section is missing, hard-refresh the Web GUI once (F5). This is a
client cache behaviour, not a plugin install failure.

## 4. Submit to awesome-dsh-plugin

1. Fork the `awesome-dsh-plugin` repository.
2. Add one entry in the appropriate plugin table/list. Use this template:

```markdown
- [dsh-skill-center](https://github.com/subeichen1/dsh-skill-center) — Per-project and per-user on/off switches for non-bundled DSH skills, with resident-token estimates, hot invalidation, and in-place SKILL.md editing.
```

3. Keep the surrounding table/list formatting and alphabetical order if the list
   requires it.
4. Run the repository's own checks (usually `npm test`, `markdownlint`, or a link
   checker — follow its `CONTRIBUTING.md`).
5. Open a pull request titled:

```text
Add dsh-skill-center
```

PR description template:

```markdown
### What

Adds `dsh-skill-center`, a DSH Web plugin for managing non-bundled skills.

### Why it is useful

- Makes user-level skills explicitly opt-in without writing defaults to disk.
- Removes disabled skills from the model catalog, the `skill` tool, and `/name` injection.
- Shows the resident catalog token cost and supports project/user scope filters.
- Includes SKILL.md editing, duplication and deletion.

### Validation

- `node --test` → 50 tests pass
- Tested against DSH 0.2.2-rc.1 with the Settings → Skill Center section
- No runtime dependencies, no build step
```

## 5. Before opening the PR

- [ ] `node --test` passes.
- [ ] `node --check index.js` and `node --check client.js` pass.
- [ ] `README.md` and `README.en.md` both describe the current UI.
- [ ] `package.json` `dsh.engines.dsh` is `>=0.2.0-rc.1`.
- [ ] `cordis.patch.yml` inserts exactly one `skill-center` entry.
- [ ] No `.dsh/`, `.dsh-pilot/`, `node_modules/`, screenshots or local state files are
      committed.
- [ ] The repository has a screenshot or short GIF in the README (optional but strongly
      recommended for plugin listings).

## 6. Updating a published release

1. Bump `version` in `package.json`.
2. Add a new section to the release notes.
3. Run the test suite.
4. Tag and push the new version:

```bash
git tag v0.1.1
git push origin v0.1.1
```

If the listing entry needs a description change, update the existing
`awesome-dsh-plugin` entry rather than opening a duplicate entry.
