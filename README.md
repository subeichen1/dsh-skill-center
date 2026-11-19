# dsh-skill-center — DSH 技能中心

> 把 DSH 的 skill 做成可开关的：按项目级 / 用户级管理、看到常驻 token、就地编辑 SKILL.md。

[English](README.en.md) | 中文

---

## 它解决什么问题

DSH 会把当前可被模型调用的 skill 名称和描述放进每一轮请求的 `<available_skills>` 目录。skill 越多，目录越大；用户级 skill 默认又常常是“装了就在”，于是每轮都带上你这次根本不会用到的条目。

技能中心把非官方内置的 skill 变成**读时计算、显式覆盖**的开关：

- **项目级 skill 默认开**：`<projectRoot>/.dsh/skills` 和 `<projectRoot>/.agents/skills` 里的 skill 默认允许调用。
- **用户级 skill 默认关**：`~/.dsh/skills` 和 `~/.agents/skills` 里的 skill 默认不进入模型目录，需要时在设置里打开。
- 状态文件只保存你**真的点过**的条目，不会把默认值批量写盘；新装一个用户级 skill 不会“默认自己开起来”。
- 开关在**下一轮对话**生效：不需要重开 DSH，也不改动历史消息。

## 功能

| 能力 | 说明 |
|---|---|
| 作用域 | 项目级（`project-dsh` / `project-agents`）与用户级（`user-dsh` / `user-agents`）分开管理 |
| 开关 | 关闭后影子 provider 同时挡住目录、`skill` 工具与 `/name` 注入 |
| 三态 | `inherit` / `on` / `off`；`inherit` 等于删除显式条目，恢复读时默认 |
| Token 汇总 | 按 `name + description` 估算常驻目录的 token/请求 |
| 工作区 | 设置页内切换工作区，按 host 侧 `workspaceRegistry.list()` 返回的路径重新扫描 |
| 搜索与筛选 | 名称/描述搜索、项目/用户来源筛选、启用/禁用状态筛选 |
| 界面语言 | 右上角切换中文 / English，只影响技能中心本身，选择会保存在本机 |
| 自动描述翻译 | 新 skill 缺少中文或英文描述时，首次展示自动翻译并缓存到 `<DSH_HOME>/skill-center/descriptions.json`；优先使用 Host translator，失败时回退当前默认模型 |
| 自检 | 每个 live agent 的 agent-scope snapshot 都会检查 off skill 是否真的被拦截；异常在设置页顶部显示红色横幅 |
| 编辑 | 编辑 `description`、`whenToUse`、调用权限与 Markdown 正文，保留未知 frontmatter 字段 |
| 复制 | 复制整目录及资源文件为模板，校验新名称，不覆盖已有目录 |
| 删除 | 删除受管 skill 目录，带二次确认并清理状态缓存 |
| 幻影条目 | SKILL.md 被删除后仍能从状态缓存列出，并标记「无本地文件」 |

官方内置 skill（`source === "bundled"`，包括 office 系列与 `dsh-skill-badge`）**完全不处理**：不出现在列表、不生成开关、不写状态、不注册影子条目。

## 安装

### 从 GitHub

```bash
dsh plugin --profile web add github:<subeichen1>/dsh-skill-center
```

### 本地开发

在插件目录执行测试：

```bash
node --test
node --check index.js
node --check client.js
```

用 DSH 插件管理器把本地目录作为 bundle 安装，然后重启或重载插件。安装后打开：

**侧栏 → 技能中心**，或 **设置 → 技能中心**

> 如果客户端 section 没有出现，按 F5 刷新 Web GUI。DSH 的 `dsh-client-ui-skill` 菜单缓存只在 `agent-preset/selected`、`plugin-manager/changed`、`connection/reset` 失效，本插件额外提供 pre-step 提示兜底。

## 使用

1. 打开 **侧栏 → 技能中心**，或 **设置 → 技能中心**。
2. 右上角可切换 **中文 / English**；切换后本插件内所有文字只显示所选语言。
3. 顶部选择工作区；列表会按项目级 / 用户级分组。
3. 点击右侧开关启用或禁用一条 skill。成功提示为「已更新，下一轮对话生效」。
4. 对项目级或全局显式设置过的条目，可以点击「恢复默认」删除显式状态，回到读时默认。
5. 需要修改技能内容时，点击行内「编辑」；保存后下一轮对话重新读取。
6. 「复制为模板」会复制整个 skill 目录（含 `references/` 等资源），只改写新 `SKILL.md` 的 `name` / `description`。
7. 「删除」会删除整个 skill 目录；删除前有确认弹窗，且只会删除技能中心受管根目录内的路径。

## 状态文件

### 全局状态

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

`DSH_HOME` 通过 `@deepseek-ai/dsh-home-paths` 的 `resolveDshHome()` 解析，支持 `DSH_HOME` 环境变量，不硬编码 `os.homedir()`。

### 项目状态

`<projectRoot>/.dsh/skill-center.json`

`projectRoot` 与 `dsh-skill-filesystem` 的 `findProjectRoot` 语义一致：从 `cwd` 向上查找 `.git`，到达文件系统根仍没有 `.git` 时返回原始 `cwd`。

格式与全局状态相同。项目级与全局状态同时存在时按以下顺序合并：

```text
effective(name, source) =
  projectState[name]
  ?? globalState[name]
  ?? (source startsWith "project-" ? "on" : "off")
```

状态文件只保存显式设置；`inherit` 会删除对应 key，而不是写入默认值。

## 工作原理

### 影子 provider

插件在 `apply()` 中同步调用 `ctx.skills.registerProvider(create)`，注册 `provider.name = "skill-center"` 的 provider。`provider.list()` 只返回**当前 effective 为 off** 的技能影子候选：

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

`provider.get(candidate)` 始终返回 `undefined`。即使未来出现新的消费点先读定义再判断 invocation，`get()` 也不会泄漏正文。

### 层级语义

`SkillRegistry.collectFresh()` 按

```text
layers = [global, ...chainLayers(scope)]
```

逐层 `merged.set(name, entry)`：rank 只在同一层内比较，跨层是后层整体覆盖前层。`dsh-skill-filesystem` 是全局注册的 provider，用 `options.cwd` 区分项目，因此项目级与用户级 skill 通常同在 `global` 层，`rank: 0` 的影子在层内稳赢 `project-dsh(100)` 与 `user-dsh(400)`。

但 agent preset 的 standing mount 会把 `dsh-skill-filesystem` 注册到 **agent scope** 层；scope 层会整体覆盖 global 层。为此插件：

- 在 `agent/created`（`{ global: true, prepend: true }`）时把同一个影子 provider 安装进每个 agent 的 scoped context；
- 每次 `list()` 后用 `ctx.skills.snapshot({ cwd, scope: agent })` 做运行时自检；
- 若仍有 off skill 的 `provider !== "skill-center"`，计入 `unprotected`，设置页顶部显示红色「N 条 skill 无法被拦截」横幅，并写 `ctx.logger.warn`。

### 热生效

写状态 → `control.invalidate()` → `SkillRegistry.revision++` 且 `collectCache.clear()` → 下一轮 `agent/pre-step` 重新计算 skill catalog digest（`sha256 of [name, description]`）→ 原地替换 `skill-catalog` 消息。不会追加新消息，也不会回写当前轮已发送的历史。

### `/name` 兜底

如果客户端 `/` 菜单仍显示旧条目（`dsh-client-ui-skill` 不订阅 `skills/change`），插件在 `agent/pre-step` 中检测用户文本里的斜杠手势：

```text
/(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/
```

命中且该 skill 当前为 off 时，追加一条提示：

> `/x 已在技能中心关闭，请在 设置 → 技能中心 打开后再试。`

提示使用 `source.kind = "skill-center"`，在对话中渲染为上下文提示而不是用户气泡；同一轮不会重复注入。

### Token 估算

每行：

```text
chars = name.length + 6 + min(description.length, 500)
```

CJK 字符按 1 token，其余按 1/3.5 token；整个目录再加 150 token 固定框架开销。结果标注为「估算」，不是实际 tokenizer 计数。

## 工程结构

```text
dsh-skill-center/
  package.json          DSH bundle 清单、exports、client 注入声明
  cordis.patch.yml      bundle 插入条目
  index.js              host 半：API 路由、状态写入、shadow 注册、pre-step 钩子
  client.js             侧栏主面板 + 设置页 UI（React，无构建步骤）
  lib/
    scan.js             独立扫描 SKILL.md frontmatter
    project-root.js     从 cwd 向上查找 .git
    state.js            状态读写、三态合并、原子写
    live.js             四根扫描与 effective off 集合
    shadow.js           影子候选与 provider 工厂
    inventory.js        snapshot + scan + state cache 合并
    tokens.js           token 估算
    mutation.js         项目/全局状态文件定位与写入
    editor.js           SKILL.md 读取、frontmatter patch、复制、删除
    descriptions.js     内置双语显示描述表
    translations.js     自动描述翻译、哈希缓存、translator/LLM 回退
    notice.js           agent/pre-step 的 /name 提示
    scope-check.js      agent scope 自检
  locale/
    zh.json             中文插件显示文案
    en.json             英文插件显示文案
  test/                 Node 内置 test runner 覆盖
  docs/PUBLISHING.md    GitHub 发布与 awesome-dsh-plugin 提交说明
```

## 开发与测试

要求 Node.js >= 20。

```bash
node --test
```

测试覆盖：frontmatter 扫描、项目根查找、状态三态与原子写、token 估算、snapshot/scan/cache 合并、幻影条目、rank-0 影子覆盖、agent-scope 自检、pre-step 提示、SKILL.md 编辑/复制/删除、自动描述翻译与缓存。当前共 50 个测试。

## 已知限制

- **客户端菜单缓存**：`dsh-client-ui-skill` 的 `/` 菜单可能短暂显示旧条目；本插件会注入明确的关闭提示，刷新页面（F5）即可同步菜单。
- **agent preset standing mount**：如果某个预设把 `skill-filesystem` 直接挂到 agent scope，插件会通过 scoped shadow 修复；无法修复时红色自检横幅会明确显示数量，而不是静默失败。
- **只管理文件系统里真实存在的非 bundled skill**：bundled、会话级与跨项目共享不在范围内。
- **编辑会保留未知 frontmatter 字段**，但不会尝试重排整个 YAML；复杂锚点/注释可能在写回时被规范化。

## 发布与提交

GitHub 仓库创建、tag、release 以及 awesome-dsh-plugin PR 的详细步骤见 [docs/PUBLISHING.md](docs/PUBLISHING.md)。

## License

MIT。见 [LICENSE](LICENSE)。
