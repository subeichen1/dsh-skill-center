# dsh-skill-center — switch DSH skills on and off

> Per-project and per-user switches for non-bundled DSH skills, with a resident-token estimate and in-place SKILL.md editing.

English | [中文](README.md)

---

## Why

DSH puts the name and description of every model-invocable skill into the `<available_skills>` catalog of **every request**. More skills means a larger catalog; user-level skills also tend to be “installed means always on”, even when you will never touch them in this conversation.

Skill Center turns non-bundled skills into explicit, read-time switches:

- **Project skills default on** from `<projectRoot>/.dsh/skills` and `<projectRoot>/.agents/skills`.
- **User skills default off** from `<DSH_HOME>/skills` and `<AGENTS_HOME>/skills`; turn one on when you need it.
- State files contain only rows you explicitly changed. A newly installed user skill does **not** mysteriously switch itself on.
- A switch takes effect on the **next conversation turn** — no DSH restart and no rewriting of already-sent history.

## Features

| Feature | What it does |
|---|---|
| Scope | Manages `project-dsh` / `project-agents` and `user-dsh` / `user-agents` separately |
| Switches | An off skill is blocked in the model catalog, the `skill` tool, and `/name` injection at once |
| Three states | `inherit` / `on` / `off`; `inherit` deletes the explicit row and restores read-time default |
| Token summary | Estimates resident catalog tokens/request from `name + description` |
| Workspaces | Switches workspace in Settings using host-side `workspaceRegistry.list()` |
| Filters | Search by name/description, filter by project/user source and enabled/disabled status |
| UI language | Switch between Chinese / English in the top-right corner; affects this plugin only and is remembered on this device |
| Automatic descriptions | When a new skill lacks a Chinese or English description, the first view translates it and caches the result under `<DSH_HOME>/skill-center/descriptions.json`; uses the Host translator first and falls back to the current default model |
| Self-check | Checks every live agent-scope snapshot; shows a red “N skill(s) cannot be blocked” banner if an off skill is still visible |
| Edit | Edits `description`, `whenToUse`, invocation flags and Markdown body while preserving unknown frontmatter |
| Duplicate | Copies the whole skill directory, including resources, under a validated new name; never overwrites |
| Delete | Deletes a managed skill directory after confirmation and clears cached state |
| Phantom rows | If a SKILL.md is deleted, the cached row remains visible and marked “No local file” |

Official bundled skills (`source === "bundled"`, including the office family and `dsh-skill-badge`) are **not touched at all**: no list row, no switch, no state entry, no shadow candidate.

## Install

### From GitHub

```bash
dsh plugin --profile web add github:<subeichen1>/dsh-skill-center
```

### Local development

From the plugin directory:

```bash
node --test
node --check index.js
node --check client.js
```

Install the local directory through the DSH plugin manager, then restart or reload the plugin. Open:

**Sidebar → Skill Center**, or **Settings → Skill Center**

> If the client section does not appear, press F5 in the Web GUI. DSH's `dsh-client-ui-skill` menu cache only invalidates on `agent-preset/selected`, `plugin-manager/changed`, and `connection/reset`; this plugin also adds a pre-step notice as a fallback.

## Usage

1. Open **Sidebar → Skill Center**, or **Settings → Skill Center**.
2. Use the **中文 / English** switch in the top-right corner; every label in this plugin then follows the selected language only.
3. Pick a workspace at the top; skills are grouped into project and user sections.
3. Click the switch on the right to enable or disable a skill. The success notice is “Updated — takes effect on the next turn”.
4. For rows with an explicit project/global state, click **Reset** to delete the explicit row and return to read-time default.
5. To change a skill's contents, click **Edit**; save and the next turn re-reads it.
6. **Duplicate** copies the entire skill directory (including `references/` and other resources) and rewrites only `name` / `description` in the new SKILL.md.
7. **Delete** removes the whole skill directory after a confirmation dialog; only paths inside managed skill roots can be deleted.

## State files

### Global

`<DSH_HOME>/skill-center/state.json`

```json
{
  "version": 1,
  "skills": {
    "my-skill": {
      "state": "off",
      "description": "cached description",
      "path": "C:\\Users\\me\\.dsh\\skills\\my-skill\\SKILL.md",
      "source": "user-dsh"
    }
  }
}
```

`DSH_HOME` is resolved through `resolveDshHome()` from `@deepseek-ai/dsh-home-paths` (honours `DSH_HOME`); it is never hard-coded from `os.homedir()`.

### Project

`<projectRoot>/.dsh/skill-center.json`

`projectRoot` uses the same semantics as `dsh-skill-filesystem`'s `findProjectRoot`: walk up from `cwd` looking for `.git`; if the filesystem root is reached without one, return the original `cwd`.

The format is the same as global state. When both exist:

```text
effective(name, source) =
  projectState[name]
  ?? globalState[name]
  ?? (source startsWith "project-" ? "on" : "off")
```

Only explicit rows are stored. `inherit` deletes the key rather than writing a default.

## How it works

### Shadow provider

The plugin calls `ctx.skills.registerProvider(create)` synchronously in `apply()` and registers a provider named `skill-center`. Its `list()` returns shadow candidates only for skills whose effective state is **off**:

```js
{
  name: <same name>,
  description: <same description>,
  invocation: { modelInvocable: false, userInvocable: false },
  source: <same source>,
  rank: 0,
  provider: 'skill-center',
  path: <same path or undefined>,
  whenToUse: <same whenToUse or undefined>,
  resourceBase: <same resourceBase or undefined>
}
```

`provider.get(candidate)` always returns `undefined`. Even if a future consumer checks invocation first and then requests the definition, the shadow cannot leak the body.

### Layer semantics

`SkillRegistry.collectFresh()` builds:

```text
layers = [global, ...chainLayers(scope)]
```

and calls `merged.set(name, entry)` for each layer. Rank only compares inside one layer; a later layer overrides an earlier layer wholesale. `dsh-skill-filesystem` is a global provider that uses `options.cwd` for projects, so project and user skills normally live in the `global` layer, where a `rank: 0` shadow beats `project-dsh(100)` and `user-dsh(400)`.

An agent preset's standing mount can register `dsh-skill-filesystem` into the **agent scope** layer, which would override the global shadow. Skill Center therefore:

- installs the same shadow provider into each agent's scoped context on `agent/created` (`{ global: true, prepend: true }`);
- after every `list()`, calls `ctx.skills.snapshot({ cwd, scope: agent })` for each live agent;
- counts any off skill with `provider !== "skill-center"` as `unprotected`, shows the red banner in Settings, and calls `ctx.logger.warn`.

### Hot invalidation

Write state → `control.invalidate()` → `SkillRegistry.revision++` and `collectCache.clear()` → the next `agent/pre-step` recomputes the skill catalog digest (`sha256 of [name, description]`) → `renderCatalogUpdate` replaces the existing `skill-catalog` message in place. No new message is appended and no already-sent history is rewritten.

### `/name` fallback

If the client `/` menu still shows a stale entry (`dsh-client-ui-skill` does not subscribe to `skills/change`), the plugin scans user-authored text in `agent/pre-step` for:

```text
/(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/
```

If the name is currently off, it appends:

> `/x is disabled in Skill Center. Open Settings → Skill Center to enable it and try again.`

The notice uses `source.kind = "skill-center"` and renders as a context row rather than a user bubble; it is not duplicated within the same turn.

### Token estimate

Per row:

```text
chars = name.length + 6 + min(description.length, 500)
```

CJK characters count as 1 token, everything else as 1/3.5 token; add 150 fixed framework tokens. The result is explicitly labelled an estimate, not a tokenizer count.

## Project layout

```text
dsh-skill-center/
  package.json          DSH bundle manifest, exports, client declaration
  cordis.patch.yml      bundle insert entry
  index.js              host half: API route, state writes, shadow registration, pre-step hook
  client.js             Sidebar panel + Settings UI (React, no build step)
  lib/
    scan.js             standalone SKILL.md frontmatter scan
    project-root.js     .git walk-up
    state.js            state read/write, three-state merge, atomic write
    live.js             four-root scan and effective-off set
    shadow.js           shadow candidate and provider factory
    inventory.js        snapshot + scan + state-cache merge
    tokens.js           token estimate
    mutation.js         project/global state file resolution and write
    editor.js           SKILL.md read, frontmatter patch, duplicate, delete
    descriptions.js     built-in bilingual display-description table
    translations.js     automatic description translation, hash cache, translator/LLM fallback
    notice.js           agent/pre-step /name notice
    scope-check.js      agent-scope self-check
  locale/
    zh.json             Chinese plugin display metadata
    en.json             English plugin display metadata
  test/                 Node built-in test runner coverage
  docs/PUBLISHING.md    GitHub release and awesome-dsh-plugin submission guide
```

## Development and tests

Requires Node.js >= 20.

```bash
node --test
```

Coverage includes frontmatter scanning, project-root discovery, three-state and atomic state writes, token estimates, snapshot/scan/cache merging, phantom rows, rank-0 shadow overriding, agent-scope self-check, pre-step notices, SKILL.md edit/duplicate/delete, and automatic description translation/cache. Current suite: 50 tests.

## Known limits

- **Client menu cache**: `dsh-client-ui-skill`'s `/` menu may briefly show stale entries; the plugin emits an explicit disabled notice, and F5 refreshes it.
- **Agent preset standing mounts**: if a preset mounts `skill-filesystem` directly into agent scope, the plugin installs a scoped shadow; if that cannot win, the red self-check banner reports the count instead of failing silently.
- **Only non-bundled, on-disk skills**: bundled, session-scoped and cross-project sharing are out of scope.
- **Frontmatter preservation**: unknown keys are kept, but complex YAML anchors/comments may be normalised when a file is written back.

## Publishing

See [docs/PUBLISHING.md](docs/PUBLISHING.md) for GitHub repository/release setup and the awesome-dsh-plugin pull request checklist.

## License

MIT. See [LICENSE](LICENSE).
