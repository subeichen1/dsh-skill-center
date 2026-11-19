window.__ModuleLoader__.load({
  id: 'dsh-skill-center',
  factory: (require) => {
    const ReactNS = require('react')
    const React = ReactNS.default?.createElement ? ReactNS.default : ReactNS
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useState } = React

    const API = '/skill-center/api'
    // The sidebar row id and the main-panel key are deliberately the same value:
    // sidebar.panellist dispatches exactly the id of the selected row to the keyed
    // `main` slot, so keeping one constant prevents the two from drifting apart.
    const PANEL_KEY = 'skill-center'
    const SIDEBAR_ORDER = 22

    // UI language is a plugin-local preference rather than a Harness-wide locale
    // change: the control must affect this plugin only. Persisting it keeps the
    // choice when the panel is closed or DSH is reloaded.
    const LANG_STORAGE_KEY = 'dsh-skill-center.lang'
    const LANG_SUBSCRIBERS = new Set()
    const SUPPORTED_LANGS = new Set(['zh', 'en'])

    const TEXT = {
      title: { zh: '技能中心', en: 'Skill Center' },
      subtitle: {
        zh: '查看、分组、启用或禁用、编辑、复制和删除非官方内置技能，按项目级与用户级分别管理，并估算技能目录常驻上下文 token。',
        en: 'View, group, enable or disable, edit, duplicate and delete non-bundled skills by project and user scope, with a context-token estimate for the resident catalog.',
      },
      language: { zh: '界面语言', en: 'Interface language' },
      langZh: { zh: '中文', en: 'Chinese' },
      langEn: { zh: '英文', en: 'English' },
      switchToZh: { zh: '切换到中文', en: 'Switch to Chinese' },
      switchToEn: { zh: '切换到英文', en: 'Switch to English' },
      separator: { zh: '：', en: ': ' },
      readonly: { zh: '已启用', en: 'Enabled' },
      tokenSummary: { zh: '条常驻 ≈', en: 'resident ≈' },
      tokensPerRequest: { zh: 'tokens/请求', en: 'tokens/request' },
      estimate: { zh: '估算', en: 'estimate' },
      tokenHint: {
        zh: '按每条 name + description（最多 500 字符）估算，含 150 固定框架开销。',
        en: 'Estimated from each name + description (max 500 chars), plus a fixed 150-token frame.',
      },
      searchLabel: { zh: '搜索', en: 'Search' },
      search: { zh: '搜索名称或描述…', en: 'Search name or description…' },
      workspace: { zh: '工作区', en: 'Workspace' },
      source: { zh: '来源', en: 'Source' },
      allSources: { zh: '全部', en: 'All' },
      projectSource: { zh: '项目技能', en: 'Project' },
      userSource: { zh: '用户技能', en: 'User' },
      status: { zh: '状态', en: 'Status' },
      allStatus: { zh: '全部', en: 'All' },
      enabledStatus: { zh: '已启用', en: 'Enabled' },
      disabledStatus: { zh: '已禁用', en: 'Disabled' },
      refresh: { zh: '刷新', en: 'Refresh' },
      refreshing: { zh: '刷新中…', en: 'Refreshing…' },
      loading: { zh: '正在扫描技能…', en: 'Scanning skills…' },
      errorTitle: { zh: '读取失败', en: 'Could not load' },
      retry: { zh: '重试', en: 'Retry' },
      empty: { zh: '没有匹配的技能', en: 'No matching skills' },
      emptyHint: {
        zh: '换一个关键词、来源或状态筛选试试。',
        en: 'Try a different keyword, source, or status filter.',
      },
      projectGroup: { zh: '项目级技能', en: 'Project skills' },
      userGroup: { zh: '用户级技能', en: 'User skills' },
      scopeProject: { zh: '项目级', en: 'Project' },
      scopeUser: { zh: '用户级', en: 'User' },
      filesystem: { zh: '文件系统', en: 'Filesystem' },
      invocationModel: { zh: '模型', en: 'Model' },
      invocationUser: { zh: '用户', en: 'User' },
      invocationNone: { zh: '不可调用', en: 'Not invocable' },
      callable: { zh: '可调用', en: 'Invocable' },
      missingFile: { zh: '无本地文件', en: 'No local file' },
      noPath: { zh: '（无 SKILL.md 路径）', en: '(no SKILL.md path)' },
      enableSkill: { zh: '启用', en: 'Enable' },
      disableSkill: { zh: '禁用', en: 'Disable' },
      updating: { zh: '更新中…', en: 'Updating…' },
      nextTurn: {
        zh: '已更新，下一轮对话生效',
        en: 'Updated — takes effect on the next turn',
      },
      switchFailed: { zh: '切换失败', en: 'Could not switch' },
      resetDefault: { zh: '恢复默认', en: 'Reset' },
      resetDone: { zh: '已恢复默认', en: 'Reset to default' },
      projectState: { zh: '项目状态', en: 'Project state' },
      globalState: { zh: '全局状态', en: 'Global state' },
      unprotectedBanner: { zh: '条 skill 无法被拦截', en: 'skill(s) cannot be blocked' },
      editSkill: { zh: '编辑', en: 'Edit' },
      copySkill: { zh: '复制为模板', en: 'Duplicate' },
      deleteSkill: { zh: '删除', en: 'Delete' },
      editTitle: { zh: '编辑技能', en: 'Edit skill' },
      copyTitle: { zh: '复制为模板', en: 'Duplicate as template' },
      deleteTitle: { zh: '删除技能', en: 'Delete skill' },
      newName: { zh: '新名称', en: 'New name' },
      nameLabel: { zh: '名称', en: 'Name' },
      descriptionLabel: { zh: '描述', en: 'Description' },
      whenToUseLabel: { zh: '何时使用', en: 'When to use' },
      invocationLabel: { zh: '可调用方式', en: 'Invocable by' },
      modelInvocableLabel: { zh: '模型可调用', en: 'Model invocable' },
      userInvocableLabel: { zh: '用户可调用', en: 'User invocable' },
      bodyLabel: { zh: '正文（Markdown）', en: 'Body (Markdown)' },
      save: { zh: '保存', en: 'Save' },
      cancel: { zh: '取消', en: 'Cancel' },
      saving: { zh: '保存中…', en: 'Saving…' },
      deleting: { zh: '删除中…', en: 'Deleting…' },
      deleteConfirm: { zh: '删除后无法恢复，确定删除该技能目录？', en: 'This deletes the skill directory permanently. Continue?' },
      saved: { zh: '已保存，下一轮对话生效', en: 'Saved — takes effect on the next turn' },
      copied: { zh: '已复制为模板', en: 'Duplicated as template' },
      deleted: { zh: '已删除技能', en: 'Skill deleted' },
      operationFailed: { zh: '操作失败', en: 'Operation failed' },
      copyHint: { zh: '会复制原目录及其资源文件，并写入新的名称；目标目录已存在时不会覆盖。', en: 'Copies the whole skill directory, including resources, under a new name. Existing targets are never overwritten.' },
      deleteHint: { zh: '仅删除当前工作区中被技能中心管理的目录。', en: 'Only removes this managed skill directory from the current workspace.' },
      p3note: {
        zh: '支持编辑 SKILL.md、复制为模板与删除；文件写入后下一轮对话生效。新增技能会自动补齐中英文描述。',
        en: 'Edit SKILL.md, duplicate as template, or delete a managed skill; changes apply on the next turn. New skills automatically get bilingual descriptions.',
      },
      warnings: { zh: '扫描提示', en: 'Scan notices' },
      p0note: {
        zh: 'P0 只读：本页只做扫描、来源分组与 token 汇总，不写入任何状态。',
        en: 'P0 is read-only: this page only scans, groups and estimates; it writes no state.',
      },
      f5note: {
        zh: '菜单若未刷新，按 F5。',
        en: 'If the menu looks stale, press F5.',
      },
      hiddenBundled: { zh: '官方内置技能已完全隐藏', en: 'Bundled skills are fully hidden' },
      count: { zh: '条', en: '' },
      sourceCustom: { zh: '自定义', en: 'Custom' },
    }

    function detectLang(ctx) {
      try {
        const locale = ctx.get('locale')
        const active = locale?.getLocale?.()?.active ?? ''
        return String(active).toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en'
      } catch {
        return 'en'
      }
    }

    function readPreferredLanguage() {
      try {
        const value = window.localStorage.getItem(LANG_STORAGE_KEY)
        return SUPPORTED_LANGS.has(value) ? value : undefined
      } catch {
        return undefined
      }
    }

    function currentLanguage(ctx) {
      return readPreferredLanguage() ?? detectLang(ctx)
    }

    function setPluginLanguage(lang) {
      if (!SUPPORTED_LANGS.has(lang)) return
      try {
        window.localStorage.setItem(LANG_STORAGE_KEY, lang)
      } catch {
        // Persistence is optional; the in-memory subscribers still update.
      }
      for (const listener of Array.from(LANG_SUBSCRIBERS)) {
        try {
          listener()
        } catch {
          // One broken listener must not block the others.
        }
      }
    }

    function subscribeLanguage(listener) {
      LANG_SUBSCRIBERS.add(listener)
      return () => LANG_SUBSCRIBERS.delete(listener)
    }

    function useLang(ctx) {
      const [lang, setLang] = useState(() => currentLanguage(ctx))
      useEffect(() => {
        const update = () => setLang(currentLanguage(ctx))
        const unsubscribeLanguage = subscribeLanguage(update)
        let unsubscribeLocale
        try {
          const locale = ctx.get('locale')
          if (locale && typeof locale.subscribe === 'function') {
            unsubscribeLocale = locale.subscribe(update)
          }
        } catch {
          // Locale is optional for this page.
        }
        const onStorage = (event) => {
          if (!event || event.key === LANG_STORAGE_KEY) update()
        }
        try {
          window.addEventListener('storage', onStorage)
        } catch {
          // Storage events are optional.
        }
        return () => {
          unsubscribeLanguage()
          if (typeof unsubscribeLocale === 'function') unsubscribeLocale()
          try {
            window.removeEventListener('storage', onStorage)
          } catch {
            // Ignore a hostile window object.
          }
        }
      }, [ctx])
      return lang
    }

    function LanguageSwitch({ lang, onChange }) {
      return h(
        'div',
        { className: 'langSwitch', role: 'group', 'aria-label': t(lang, 'language') },
        h(
          'button',
          {
            type: 'button',
            className: `langBtn${lang === 'zh' ? ' langOn' : ''}`,
            'aria-pressed': lang === 'zh',
            'aria-label': t(lang, 'switchToZh'),
            onClick: () => onChange('zh'),
          },
          t(lang, 'langZh'),
        ),
        h(
          'button',
          {
            type: 'button',
            className: `langBtn${lang === 'en' ? ' langOn' : ''}`,
            'aria-pressed': lang === 'en',
            'aria-label': t(lang, 'switchToEn'),
            onClick: () => onChange('en'),
          },
          t(lang, 'langEn'),
        ),
      )
    }

    function t(lang, key) {
      const entry = TEXT[key]
      return entry ? entry[lang] ?? entry.en : key
    }

    // SKILL.md descriptions are authored in one language. The host attaches
    // optional display translations (`descriptionZh` / `descriptionEn`) so the
    // list follows the plugin language switch without changing what the model
    // sees or the token estimate derived from the original description.
    function skillDescription(skill, lang) {
      const localized = lang === 'zh' ? skill?.descriptionZh : skill?.descriptionEn
      return typeof localized === 'string' && localized.trim() ? localized : String(skill?.description ?? '')
    }

    function sourceName(skill, lang) {
      const label = skill.sourceLabel
      if (label && typeof label === 'object') return label[lang] ?? label.en ?? skill.source
      return skill.source === 'custom' ? t(lang, 'sourceCustom') : String(skill.source ?? '')
    }

    function formatCount(value) {
      return new Intl.NumberFormat().format(value)
    }

    function invocationText(skill, lang) {
      const parts = []
      if (skill.invocation?.modelInvocable) parts.push(t(lang, 'invocationModel'))
      if (skill.invocation?.userInvocable) parts.push(t(lang, 'invocationUser'))
      return parts.length ? `${t(lang, 'callable')}${t(lang, 'separator')}${parts.join(' / ')}` : t(lang, 'invocationNone')
    }

    async function fetchList(workspaceId) {
      const query = workspaceId
        ? `?action=list&workspaceId=${encodeURIComponent(workspaceId)}`
        : '?action=list'
      const response = await fetch(API + query, { cache: 'no-store' })
      const data = await response.json().catch(() => undefined)
      if (!data || data.ok !== true) {
        throw new Error((data && data.error) || `HTTP ${response.status}`)
      }
      return data
    }

    async function postState(body) {
      return postAction('setState', body)
    }

    async function postAction(action, body) {
      const response = await fetch(`${API}?action=${encodeURIComponent(action)}`, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => undefined)
      if (!data || data.ok !== true) {
        throw new Error((data && data.error) || `HTTP ${response.status}`)
      }
      return data
    }

    async function fetchSkill(name, workspaceId) {
      const query = `?action=read&name=${encodeURIComponent(name)}${
        workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : ''
      }`
      const response = await fetch(API + query, { cache: 'no-store' })
      const data = await response.json().catch(() => undefined)
      if (!data || data.ok !== true) {
        throw new Error((data && data.error) || `HTTP ${response.status}`)
      }
      return data
    }

    function Badge({ children, tone = 'neutral', title }) {
      return h('span', { className: `badge badge-${tone}`, title }, children)
    }

    function Switch({ checked, lang, disabled = false, busy = false, onToggle, label }) {
      return h(
        'button',
        {
          type: 'button',
          className: 'switch',
          role: 'switch',
          'aria-checked': checked ? 'true' : 'false',
          'aria-label': label,
          title: label,
          'aria-busy': busy ? 'true' : 'false',
          disabled: disabled || busy,
          onClick: onToggle,
        },
        h('span', { className: 'knob' }),
      )
    }

    function SkillRow({ skill, lang, onToggle, onReset, onEdit, onCopy, onDelete, pendingName }) {
      const tones = skill.scope === 'project' ? 'project' : 'user'
      const busy = pendingName === skill.name
      const editable = Boolean(skill.editable) && !skill.missingFile
      const switchLabel = `${t(lang, skill.enabled ? 'disableSkill' : 'enableSkill')} ${skill.name}`
      return h(
        'article',
        { className: 'row' },
        h(
          'div',
          { className: 'rowHead' },
          h(
            'div',
            { className: 'identity' },
            h('span', { className: 'skillName' }, skill.name),
            h(
              'div',
              { className: 'badges' },
              h(Badge, { tone: tones }, t(lang, skill.scope === 'project' ? 'scopeProject' : 'scopeUser')),
              skill.path ? h(Badge, { tone: 'neutral' }, t(lang, 'filesystem')) : null,
              h(Badge, { tone: skill.missingFile ? 'danger' : 'neutral' }, invocationText(skill, lang)),
              skill.missingFile ? h(Badge, { tone: 'danger' }, t(lang, 'missingFile')) : null,
              skill.explicitState
                ? h(
                    Badge,
                    { tone: 'neutral' },
                    t(lang, skill.stateSource === 'project' ? 'projectState' : 'globalState'),
                  )
                : null,
              h(Badge, { tone: 'source' }, sourceName(skill, lang)),
            ),
          ),
          h(
            'div',
            { className: 'rowActions' },
            editable && onEdit
              ? h('button', { type: 'button', className: 'linkBtn', disabled: busy, onClick: () => onEdit(skill) }, t(lang, 'editSkill'))
              : null,
            editable && onCopy
              ? h('button', { type: 'button', className: 'linkBtn', disabled: busy, onClick: () => onCopy(skill) }, t(lang, 'copySkill'))
              : null,
            editable && onDelete
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'linkBtn linkBtnDanger',
                    disabled: busy,
                    onClick: () => onDelete(skill),
                  },
                  t(lang, 'deleteSkill'),
                )
              : null,
            skill.explicitState && onReset
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'linkBtn',
                    disabled: busy,
                    onClick: () => onReset(skill),
                  },
                  t(lang, 'resetDefault'),
                )
              : null,
            h(Switch, {
              checked: skill.enabled,
              lang,
              disabled: skill.missingFile,
              busy,
              label: switchLabel,
              onToggle: onToggle ? () => onToggle(skill) : undefined,
            }),
          ),
        ),
        h('p', { className: 'description', title: skillDescription(skill, lang) || '' }, skillDescription(skill, lang) || '—'),
        h(
          'code',
          { className: `path${skill.missingFile ? ' pathMissing' : ''}` },
          skill.path || t(lang, 'noPath'),
        ),
      )
    }

    function Group({ title, skills, lang, onToggle, onReset, onEdit, onCopy, onDelete, pendingName }) {
      if (!skills.length) return null
      return h(
        'section',
        { className: 'group' },
        h('h3', { className: 'groupTitle' }, `${title} · ${skills.length}`),
        h(
          'div',
          { className: 'rows' },
          skills.map((skill) =>
            h(SkillRow, {
              key: skill.name,
              skill,
              lang,
              onToggle,
              onReset,
              onEdit,
              onCopy,
              onDelete,
              pendingName,
            }),
          ),
        ),
      )
    }

    function SkillEditorModal({ editor, lang, busy, error, onChange, onClose, onSave }) {
      if (!editor) return null
      const copy = editor.mode === 'copy'
      return h(
        'div',
        { className: 'modalOverlay' },
        h(
          'div',
          { className: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t(lang, copy ? 'copyTitle' : 'editTitle') },
          h(
            'div',
            { className: 'modalHead' },
            h('h3', { className: 'modalTitle' }, t(lang, copy ? 'copyTitle' : 'editTitle')),
            h(
              'button',
              { type: 'button', className: 'iconBtn', onClick: onClose, disabled: busy, 'aria-label': t(lang, 'cancel') },
              '×',
            ),
          ),
          h(
            'label',
            { className: 'modalField' },
            h('span', { className: 'fieldLabel' }, t(lang, copy ? 'newName' : 'nameLabel')),
            h('input', {
              className: 'input',
              value: editor.name,
              readOnly: !copy,
              onChange: (event) => onChange({ name: event.target.value }),
            }),
          ),
          h(
            'label',
            { className: 'modalField' },
            h('span', { className: 'fieldLabel' }, t(lang, 'descriptionLabel')),
            h('textarea', {
              className: 'input textarea',
              rows: 3,
              value: editor.description,
              onChange: (event) => onChange({ description: event.target.value }),
            }),
          ),
          copy
            ? h('p', { className: 'modalHint' }, t(lang, 'copyHint'))
            : h(
                'div',
                null,
                h(
                  'label',
                  { className: 'modalField' },
                  h('span', { className: 'fieldLabel' }, t(lang, 'whenToUseLabel')),
                  h('input', {
                    className: 'input',
                    value: editor.whenToUse,
                    onChange: (event) => onChange({ whenToUse: event.target.value }),
                  }),
                ),
                h(
                  'div',
                  { className: 'checkboxRow' },
                  h(
                    'label',
                    null,
                    h('input', {
                      type: 'checkbox',
                      checked: editor.modelInvocable,
                      onChange: (event) => onChange({ modelInvocable: event.target.checked }),
                    }),
                    ` ${t(lang, 'modelInvocableLabel')}`,
                  ),
                  h(
                    'label',
                    null,
                    h('input', {
                      type: 'checkbox',
                      checked: editor.userInvocable,
                      onChange: (event) => onChange({ userInvocable: event.target.checked }),
                    }),
                    ` ${t(lang, 'userInvocableLabel')}`,
                  ),
                ),
              ),
          copy
            ? null
            : h(
                'label',
                { className: 'modalField' },
                h('span', { className: 'fieldLabel' }, t(lang, 'bodyLabel')),
                h('textarea', {
                  className: 'input textarea bodyEditor',
                  rows: 16,
                  value: editor.body,
                  onChange: (event) => onChange({ body: event.target.value }),
                }),
              ),
          error
            ? h('div', { className: 'notice noticeError' }, h('strong', null, `${t(lang, 'operationFailed')}: ${error}`))
            : null,
          h(
            'div',
            { className: 'modalActions' },
            h('button', { type: 'button', className: 'btn btnGhost', onClick: onClose, disabled: busy }, t(lang, 'cancel')),
            h(
              'button',
              { type: 'button', className: 'btn btnPrimary', onClick: onSave, disabled: busy },
              busy ? t(lang, 'saving') : t(lang, 'save'),
            ),
          ),
        ),
      )
    }

    function DeleteConfirmModal({ target, lang, busy, error, onClose, onConfirm }) {
      if (!target) return null
      return h(
        'div',
        { className: 'modalOverlay' },
        h(
          'div',
          { className: 'modal modalSmall', role: 'dialog', 'aria-modal': 'true', 'aria-label': t(lang, 'deleteTitle') },
          h(
            'div',
            { className: 'modalHead' },
            h('h3', { className: 'modalTitle' }, `${t(lang, 'deleteTitle')} · ${target.name}`),
          ),
          h('p', { className: 'modalHint' }, t(lang, 'deleteConfirm')),
          h('p', { className: 'modalHint muted' }, t(lang, 'deleteHint')),
          error
            ? h('div', { className: 'notice noticeError' }, h('strong', null, `${t(lang, 'operationFailed')}: ${error}`))
            : null,
          h(
            'div',
            { className: 'modalActions' },
            h('button', { type: 'button', className: 'btn btnGhost', onClick: onClose, disabled: busy }, t(lang, 'cancel')),
            h(
              'button',
              { type: 'button', className: 'btn btnDanger', onClick: onConfirm, disabled: busy },
              busy ? t(lang, 'deleting') : t(lang, 'deleteSkill'),
            ),
          ),
        ),
      )
    }

    /**
     * The sidebar row's glyph: an open skill book with a small toggle dot. Hand-drawn
     * on a 16px grid because a client bundle may not depend on an icon package.
     */
    function SkillCenterSidebarIcon({ size, active }) {
      const edge = typeof size === 'number' && size > 0 ? size : 16
      return h(
        'svg',
        {
          width: edge,
          height: edge,
          viewBox: '0 0 16 16',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-hidden': 'true',
          style: active ? { opacity: 1 } : undefined,
        },
        h('path', {
          d: 'M2.4 3.5h3.8c1.1 0 1.8.7 1.8 1.8v7.2c-.5-.5-1.1-.8-1.8-.8H2.4V3.5Z',
          stroke: 'currentColor',
          strokeWidth: '1.3',
          strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M13.6 3.5H9.8c-1.1 0-1.8.7-1.8 1.8v7.2c.5-.5 1.1-.8 1.8-.8h3.8V3.5Z',
          stroke: 'currentColor',
          strokeWidth: '1.3',
          strokeLinejoin: 'round',
        }),
        h('circle', { cx: '12.9', cy: '11.2', r: '1.7', fill: 'currentColor' }),
      )
    }

    function SkillCenterPage({ ctx, seat }) {
      const inMainSeat = seat === 'main'
      const lang = useLang(ctx)
      const [data, setData] = useState(undefined)
      const [loading, setLoading] = useState(true)
      const [refreshing, setRefreshing] = useState(false)
      const [error, setError] = useState('')
      const [workspaceId, setWorkspaceId] = useState('')
      const [query, setQuery] = useState('')
      const [sourceFilter, setSourceFilter] = useState('all')
      const [statusFilter, setStatusFilter] = useState('all')
      const [pendingName, setPendingName] = useState('')
      const [notice, setNotice] = useState(undefined)
      const [editor, setEditor] = useState(undefined)
      const [editorBusy, setEditorBusy] = useState(false)
      const [editorError, setEditorError] = useState('')
      const [deleteTarget, setDeleteTarget] = useState(undefined)
      const [deleteBusy, setDeleteBusy] = useState(false)
      const [deleteError, setDeleteError] = useState('')

      const load = useCallback(
        async (id, quiet = false) => {
          if (quiet) setRefreshing(true)
          else setLoading(true)
          setError('')
          try {
            const payload = await fetchList(id)
            setData(payload)
            if (!workspaceId && payload.workspaceId) setWorkspaceId(payload.workspaceId)
          } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : String(loadError))
          } finally {
            setLoading(false)
            setRefreshing(false)
          }
        },
        [workspaceId],
      )

      useEffect(() => {
        load(workspaceId)
      }, [workspaceId, load])

      const changeSkillState = useCallback(
        async (skill, nextState) => {
          if (!skill || skill.missingFile) return
          setPendingName(skill.name)
          setNotice(undefined)
          try {
            await postState({
              name: skill.name,
              state: nextState,
              // Project skills belong to this workspace; user skills are global.
              scope: skill.scope === 'project' ? 'project' : 'global',
              workspaceId: workspaceId || data?.workspaceId || undefined,
            })
            const payload = await fetchList(workspaceId || data?.workspaceId)
            setData(payload)
            setNotice({ tone: 'ok', text: t(lang, nextState === 'inherit' ? 'resetDone' : 'nextTurn') })
          } catch (switchError) {
            setNotice({
              tone: 'error',
              text: `${t(lang, 'switchFailed')}: ${switchError instanceof Error ? switchError.message : String(switchError)}`,
            })
          } finally {
            setPendingName('')
          }
        },
        [data?.workspaceId, lang, workspaceId],
      )
      const toggleSkill = useCallback(
        (skill) => changeSkillState(skill, skill && skill.enabled ? 'off' : 'on'),
        [changeSkillState],
      )
      const resetSkill = useCallback((skill) => changeSkillState(skill, 'inherit'), [changeSkillState])

      const activeWorkspaceId = workspaceId || data?.workspaceId || ''

      const openEditor = useCallback(
        async (skill, mode) => {
          setNotice(undefined)
          setEditorError('')
          setPendingName(skill.name)
          try {
            const payload = await fetchSkill(skill.name, activeWorkspaceId)
            const source = payload.skill
            setEditor({
              mode,
              sourceName: source.name,
              name: mode === 'copy' ? `${source.name}-copy` : source.name,
              description: source.description || '',
              whenToUse: source.whenToUse || '',
              modelInvocable: source.invocation?.modelInvocable !== false,
              userInvocable: source.invocation?.userInvocable !== false,
              body: source.body || '',
            })
          } catch (readError) {
            setNotice({
              tone: 'error',
              text: `${t(lang, 'operationFailed')}: ${readError instanceof Error ? readError.message : String(readError)}`,
            })
          } finally {
            setPendingName('')
          }
        },
        [activeWorkspaceId, lang],
      )
      const openEdit = useCallback((skill) => openEditor(skill, 'edit'), [openEditor])
      const openCopy = useCallback((skill) => openEditor(skill, 'copy'), [openEditor])
      const openDelete = useCallback((skill) => {
        setNotice(undefined)
        setDeleteError('')
        setDeleteTarget(skill)
      }, [])

      const saveEditor = useCallback(async () => {
        if (!editor) return
        setEditorBusy(true)
        setEditorError('')
        try {
          if (editor.mode === 'copy') {
            await postAction('duplicate', {
              name: editor.sourceName,
              targetName: editor.name,
              description: editor.description,
              workspaceId: activeWorkspaceId || undefined,
            })
          } else {
            await postAction('save', {
              name: editor.name,
              description: editor.description,
              whenToUse: editor.whenToUse,
              modelInvocable: editor.modelInvocable,
              userInvocable: editor.userInvocable,
              body: editor.body,
              workspaceId: activeWorkspaceId || undefined,
            })
          }
          const copied = editor.mode === 'copy'
          setEditor(undefined)
          await load(activeWorkspaceId, true)
          setNotice({ tone: 'ok', text: t(lang, copied ? 'copied' : 'saved') })
        } catch (saveError) {
          setEditorError(saveError instanceof Error ? saveError.message : String(saveError))
        } finally {
          setEditorBusy(false)
        }
      }, [activeWorkspaceId, editor, lang, load])

      const confirmDelete = useCallback(async () => {
        if (!deleteTarget) return
        setDeleteBusy(true)
        setDeleteError('')
        try {
          await postAction('delete', { name: deleteTarget.name, workspaceId: activeWorkspaceId || undefined })
          setDeleteTarget(undefined)
          await load(activeWorkspaceId, true)
          setNotice({ tone: 'ok', text: t(lang, 'deleted') })
        } catch (deleteFailure) {
          setDeleteError(deleteFailure instanceof Error ? deleteFailure.message : String(deleteFailure))
        } finally {
          setDeleteBusy(false)
        }
      }, [activeWorkspaceId, deleteTarget, lang, load])

      const skills = Array.isArray(data?.skills) ? data.skills : []
      const filtered = useMemo(() => {
        const needle = query.trim().toLowerCase()
        return skills.filter((skill) => {
          if (sourceFilter !== 'all' && skill.scope !== sourceFilter) return false
          if (statusFilter === 'enabled' && !skill.enabled) return false
          if (statusFilter === 'disabled' && skill.enabled) return false
          if (!needle) return true
          return (
            String(skill.name ?? '').toLowerCase().includes(needle) ||
            String(skill.description ?? '').toLowerCase().includes(needle) ||
            String(skill.descriptionZh ?? '').toLowerCase().includes(needle) ||
            String(skill.descriptionEn ?? '').toLowerCase().includes(needle)
          )
        })
      }, [skills, query, sourceFilter, statusFilter])

      const projectSkills = filtered.filter((skill) => skill.scope === 'project')
      const userSkills = filtered.filter((skill) => skill.scope === 'user')
      const groups = data?.groups ?? { project: 0, user: 0 }
      const tokenEstimate = data?.tokenEstimate ?? { count: 0, tokens: 150 }

      return h(
        'div',
        { className: inMainSeat ? 'page pageMain' : 'page' },
        h(
          'header',
          { className: 'header' },
          h(
            'div',
            { className: 'titleLine' },
            h('h2', { className: 'title' }, t(lang, 'title')),
            h(Badge, { tone: 'phase' }, t(lang, 'readonly')),
            h(LanguageSwitch, { lang, onChange: setPluginLanguage }),
          ),
          h('p', { className: 'subtitle' }, t(lang, 'subtitle')),
        ),
        h(
          'div',
          { className: 'summary' },
          h(
            'div',
            { className: 'summaryMain' },
            h('strong', { className: 'summaryNumber' }, formatCount(tokenEstimate.count)),
            h('span', null, t(lang, 'tokenSummary')),
            h('strong', { className: 'summaryNumber' }, formatCount(tokenEstimate.tokens)),
            h('span', null, t(lang, 'tokensPerRequest')),
            h(Badge, { tone: 'estimate' }, t(lang, 'estimate')),
          ),
          h('p', { className: 'summaryHint' }, t(lang, 'tokenHint')),
        ),
        h(
          'div',
          { className: 'toolbar' },
          h(
            'label',
            { className: 'field searchField' },
            h('span', { className: 'fieldLabel' }, t(lang, 'searchLabel')),
            h('input', {
              className: 'input',
              type: 'search',
              value: query,
              placeholder: t(lang, 'search'),
              onChange: (event) => setQuery(event.target.value),
              'aria-label': t(lang, 'search'),
            }),
          ),
          h(
            'label',
            { className: 'field' },
            h('span', { className: 'fieldLabel' }, t(lang, 'workspace')),
            h(
              'select',
              {
                className: 'input select',
                value: activeWorkspaceId,
                onChange: (event) => setWorkspaceId(event.target.value),
                'aria-label': t(lang, 'workspace'),
              },
              (data?.workspaces ?? []).map((workspace) =>
                h('option', { key: workspace.id, value: workspace.id }, workspace.title || workspace.path),
              ),
            ),
          ),
          h(
            'div',
            { className: 'field' },
            h('span', { className: 'fieldLabel' }, t(lang, 'source')),
            h(
              'div',
              { className: 'segmented', role: 'group', 'aria-label': t(lang, 'source') },
              h(
                'button',
                {
                  type: 'button',
                  className: `segBtn${sourceFilter === 'all' ? ' segOn' : ''}`,
                  'aria-pressed': sourceFilter === 'all',
                  onClick: () => setSourceFilter('all'),
                },
                t(lang, 'allSources'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: `segBtn${sourceFilter === 'project' ? ' segOn' : ''}`,
                  'aria-pressed': sourceFilter === 'project',
                  onClick: () => setSourceFilter('project'),
                },
                `${t(lang, 'projectSource')} ${groups.project}`,
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: `segBtn${sourceFilter === 'user' ? ' segOn' : ''}`,
                  'aria-pressed': sourceFilter === 'user',
                  onClick: () => setSourceFilter('user'),
                },
                `${t(lang, 'userSource')} ${groups.user}`,
              ),
            ),
          ),
          h(
            'label',
            { className: 'field' },
            h('span', { className: 'fieldLabel' }, t(lang, 'status')),
            h(
              'select',
              {
                className: 'input select statusSelect',
                value: statusFilter,
                onChange: (event) => setStatusFilter(event.target.value),
                'aria-label': t(lang, 'status'),
              },
              h('option', { value: 'all' }, t(lang, 'allStatus')),
              h('option', { value: 'enabled' }, t(lang, 'enabledStatus')),
              h('option', { value: 'disabled' }, t(lang, 'disabledStatus')),
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'refresh',
              onClick: () => load(activeWorkspaceId, true),
              disabled: refreshing,
            },
            refreshing ? t(lang, 'refreshing') : t(lang, 'refresh'),
          ),
        ),
        data?.unprotected > 0
          ? h(
              'div',
              { className: 'notice noticeError' },
              h('strong', null, `${data.unprotected} ${t(lang, 'unprotectedBanner')}`),
              data.unprotectedSkills && data.unprotectedSkills.length
                ? h('p', null, data.unprotectedSkills.join(', '))
                : null,
            )
          : null,
        notice
          ? h(
              'div',
              { className: `notice ${notice.tone === 'ok' ? 'noticeOk' : 'noticeError'}` },
              h('strong', null, notice.text),
            )
          : null,
        data?.warnings && data.warnings.length
          ? h(
              'div',
              { className: 'notice noticeWarn' },
              h('strong', null, `${t(lang, 'warnings')} (${data.warnings.length})`),
              h(
                'ul',
                { className: 'warningList' },
                data.warnings.slice(0, 6).map((warning, index) => h('li', { key: index }, warning)),
              ),
            )
          : null,
        error
          ? h(
              'div',
              { className: 'notice noticeError' },
              h('strong', null, t(lang, 'errorTitle')),
              h('p', null, error),
              h('button', { type: 'button', className: 'refresh', onClick: () => load(activeWorkspaceId) }, t(lang, 'retry')),
            )
          : null,
        loading && !data
          ? h('div', { className: 'empty' }, t(lang, 'loading'))
          : filtered.length === 0
            ? h(
                'div',
                { className: 'empty' },
                h('strong', null, t(lang, 'empty')),
                h('p', null, t(lang, 'emptyHint')),
              )
            : h(
                'div',
                { className: 'groups' },
                sourceFilter !== 'user'
                  ? h(Group, {
                      title: t(lang, 'projectGroup'),
                      skills: projectSkills,
                      lang,
                      onToggle: toggleSkill,
                      onReset: resetSkill,
                      onEdit: openEdit,
                      onCopy: openCopy,
                      onDelete: openDelete,
                      pendingName,
                    })
                  : null,
                sourceFilter !== 'project'
                  ? h(Group, {
                      title: t(lang, 'userGroup'),
                      skills: userSkills,
                      lang,
                      onToggle: toggleSkill,
                      onReset: resetSkill,
                      onEdit: openEdit,
                      onCopy: openCopy,
                      onDelete: openDelete,
                      pendingName,
                    })
                  : null,
              ),
        h(
          'footer',
          { className: 'footer' },
          h('p', null, t(lang, 'p3note')),
          h('p', { className: 'muted' }, `${t(lang, 'f5note')} · ${t(lang, 'hiddenBundled')}`),
        ),
        h(SkillEditorModal, {
          editor,
          lang,
          busy: editorBusy,
          error: editorError,
          onChange: (patch) => setEditor((current) => (current ? { ...current, ...patch } : current)),
          onClose: () => {
            if (!editorBusy) {
              setEditor(undefined)
              setEditorError('')
            }
          },
          onSave: saveEditor,
        }),
        h(DeleteConfirmModal, {
          target: deleteTarget,
          lang,
          busy: deleteBusy,
          error: deleteError,
          onClose: () => {
            if (!deleteBusy) {
              setDeleteTarget(undefined)
              setDeleteError('')
            }
          },
          onConfirm: confirmDelete,
        }),
      )
    }

    const STYLES = `
      .page { display: flex; flex-direction: column; gap: 14px; padding: 4px 0 24px; color: var(--dsw-alias-label-primary); }
      .pageMain { box-sizing: border-box; flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 20px 24px 24px; scrollbar-gutter: stable; }
      .header { display: flex; flex-direction: column; gap: 5px; }
      .titleLine { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .title { margin: 0; font-size: 18px; line-height: 1.3; font-weight: 650; }
      .langSwitch { display: inline-flex; align-items: center; margin-left: auto; padding: 2px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); }
      .langBtn { height: 24px; padding: 0 9px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11.5px; cursor: pointer; white-space: nowrap; }
      .langBtn:hover { color: var(--dsw-alias-label-primary); }
      .langBtn.langOn { background: var(--dsw-alias-brand-primary); color: #fff; }
      .subtitle { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 1.55; }
      .summary { position: sticky; top: 0; z-index: 3; display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-base); box-shadow: 0 2px 8px rgba(0,0,0,.04); }
      .summaryMain { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; font-size: 13px; }
      .summaryNumber { font-size: 18px; font-variant-numeric: tabular-nums; }
      .summaryHint { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 11.5px; }
      .toolbar { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
      .field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
      .fieldLabel { color: var(--dsw-alias-label-secondary); font-size: 11px; font-weight: 550; }
      .searchField { flex: 1 1 240px; min-width: 200px; }
      .input { box-sizing: border-box; height: 32px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; outline: none; }
      .input:focus-visible { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent); }
      .select { min-width: 150px; max-width: 280px; }
      .statusSelect { min-width: 112px; }
      .segmented { display: inline-flex; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; overflow: hidden; background: var(--dsw-alias-bg-layer-1); }
      .segBtn { height: 32px; padding: 0 10px; border: 0; border-right: 1px solid var(--dsw-alias-border-l1); background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap; }
      .segBtn:last-child { border-right: 0; }
      .segBtn:hover { background: var(--dsw-alias-bg-layer-2); }
      .segBtn.segOn { background: var(--dsw-alias-brand-primary); color: #fff; }
      .refresh { height: 32px; padding: 0 15px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12.5px; cursor: pointer; }
      .refresh:hover:not(:disabled) { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
      .refresh:disabled { opacity: .55; cursor: default; }
      .groups { display: flex; flex-direction: column; gap: 16px; }
      .group { display: flex; flex-direction: column; gap: 8px; }
      .groupTitle { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; font-weight: 600; letter-spacing: .02em; }
      .rows { display: flex; flex-direction: column; gap: 8px; }
      .row { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
      .rowHead { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .identity { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
      .skillName { font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
      .badges { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
      .badge { display: inline-flex; align-items: center; height: 19px; padding: 0 6px; border-radius: 999px; font-size: 10.5px; line-height: 1; white-space: nowrap; border: 1px solid transparent; }
      .badge-neutral { color: var(--dsw-alias-label-secondary); border-color: var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
      .badge-project { color: var(--dsw-alias-state-success); border-color: color-mix(in srgb, var(--dsw-alias-state-success) 32%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-success) 9%, transparent); }
      .rowActions { display: flex; align-items: center; gap: 10px; flex: none; }
      .linkBtn { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 12px; cursor: pointer; padding: 2px 0; }
      .linkBtn:hover { color: var(--dsw-alias-brand-primary); }
      .linkBtn:disabled { opacity: .5; cursor: default; }
      .linkBtnDanger { color: var(--dsw-alias-state-error); }
      .linkBtnDanger:hover { color: var(--dsw-alias-state-error); opacity: .8; }
      .modalOverlay { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0,0,0,.42); }
      .modal { box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; width: min(780px, 100%); max-height: calc(100vh - 48px); overflow: auto; padding: 18px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-base); box-shadow: 0 18px 60px rgba(0,0,0,.25); }
      .modalSmall { width: min(460px, 100%); }
      .modalHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .modalTitle { margin: 0; font-size: 16px; font-weight: 650; }
      .iconBtn { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 22px; line-height: 1; cursor: pointer; padding: 0 2px; }
      .iconBtn:hover { color: var(--dsw-alias-label-primary); }
      .modalField { display: flex; flex-direction: column; gap: 5px; }
      .textarea { height: auto; padding: 8px 10px; line-height: 1.55; resize: vertical; }
      .bodyEditor { font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12px; }
      .checkboxRow { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; color: var(--dsw-alias-label-primary); font-size: 12.5px; }
      .checkboxRow label { display: inline-flex; align-items: center; gap: 6px; }
      .modalHint { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.55; }
      .modalActions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding-top: 4px; }
      .btn { height: 32px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); font: inherit; font-size: 12.5px; cursor: pointer; }
      .btn:disabled { opacity: .55; cursor: default; }
      .btnGhost { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
      .btnPrimary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
      .btnDanger { background: var(--dsw-alias-state-error); border-color: var(--dsw-alias-state-error); color: #fff; }
      .badge-user { color: var(--dsw-alias-brand-primary); border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, transparent); }
      .badge-source { color: var(--dsw-alias-label-secondary); border-color: var(--dsw-alias-border-l1); background: transparent; }
      .badge-danger { color: var(--dsw-alias-state-error); border-color: color-mix(in srgb, var(--dsw-alias-state-error) 32%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-error) 8%, transparent); }
      .badge-phase { color: var(--dsw-alias-state-warn); border-color: color-mix(in srgb, var(--dsw-alias-state-warn) 32%, transparent); background: color-mix(in srgb, var(--dsw-alias-state-warn) 9%, transparent); }
      .badge-estimate { color: var(--dsw-alias-label-secondary); border-color: var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
      .switch { position: relative; flex: 0 0 auto; width: 42px; height: 24px; padding: 0; border: 0; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); cursor: pointer; }
      .switch:disabled { cursor: not-allowed; opacity: .55; }
      .switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
      .knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform .16s ease; }
      .switch[aria-checked="true"] .knob { transform: translateX(18px); }
      .description { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; margin: 0; color: var(--dsw-alias-label-primary); font-size: 12.5px; line-height: 1.58; white-space: pre-wrap; overflow-wrap: anywhere; }
      .path { display: block; padding: 5px 7px; border-radius: 6px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); font-size: 10.5px; line-height: 1.45; overflow-wrap: anywhere; }
      .pathMissing { color: var(--dsw-alias-state-error); }
      .notice { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 9px; font-size: 12px; line-height: 1.5; }
      .notice p { margin: 0; }
      .noticeWarn { border-color: color-mix(in srgb, var(--dsw-alias-state-warn) 40%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-warn) 7%, var(--dsw-alias-bg-layer-1)); }
      .noticeError { border-color: color-mix(in srgb, var(--dsw-alias-state-error) 40%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-error) 7%, var(--dsw-alias-bg-layer-1)); }
      .noticeOk { border-color: color-mix(in srgb, var(--dsw-alias-state-success) 40%, var(--dsw-alias-border-l1)); background: color-mix(in srgb, var(--dsw-alias-state-success) 7%, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-state-success); }
      .warningList { margin: 0; padding-left: 18px; color: var(--dsw-alias-label-secondary); }
      .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; min-height: 160px; padding: 24px; border: 1px dashed var(--dsw-alias-border-l1); border-radius: 10px; color: var(--dsw-alias-label-secondary); text-align: center; }
      .empty p { margin: 0; font-size: 12.5px; }
      .footer { display: flex; flex-direction: column; gap: 3px; padding-top: 4px; color: var(--dsw-alias-label-secondary); font-size: 11.5px; }
      .footer p { margin: 0; }
      .muted { opacity: .82; }
      @media (max-width: 720px) {
        .toolbar { align-items: stretch; }
        .searchField { flex-basis: 100%; }
        .select { max-width: none; width: 100%; }
        .refresh { align-self: flex-end; }
      }
      @media (prefers-reduced-motion: reduce) {
        .knob { transition: none; }
      }
    `

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (!slots || typeof slots.register !== 'function') return

      // Publish the UI dictionary to the Harness locale service as well as
      // keeping a synchronous copy for this component's own render pass. The
      // locale entity is optional on older clients, hence the runtime guard.
      const locale = ctx.get('locale')
      if (locale && typeof locale.register === 'function') {
        const dictionaries = { zh: {}, en: {} }
        for (const [key, value] of Object.entries(TEXT)) {
          dictionaries.zh[key] = value.zh
          dictionaries.en[key] = value.en
        }
        ctx.effect(() => locale.register('dsh-skill-center', dictionaries), 'skill-center.locale')
      }

      ctx.effect(
        () => {
          const style = document.createElement('style')
          style.setAttribute('data-plugin', 'dsh-skill-center')
          style.textContent = STYLES
          document.head.appendChild(style)
          return () => {
            style.remove()
          }
        },
        'skill-center.styles',
      )

      // The main panel is registered unconditionally: the sidebar row selects this key,
      // and having it present before the row is clicked avoids a blank first frame.
      ctx.effect(
        () =>
          slots.inject('main', () =>
            slots.register({ name: 'main', key: PANEL_KEY }, () =>
              h(SkillCenterPage, { ctx, seat: 'main' }),
            ),
          ),
        'skill-center.main-panel',
      )

      // A first-class sidebar entry beside Plugins / Scheduled tasks / Context insight /
      // MCP Switch. It shares its id with the keyed main panel above.
      const injectLocalized = (slotName, build) =>
        slots.inject(slotName, () => {
          let disposeRow
          const mount = () => {
            if (disposeRow) disposeRow()
            disposeRow = build()
          }
          mount()
          const unsubscribe = subscribeLanguage(mount)
          return () => {
            unsubscribe()
            if (disposeRow) disposeRow()
            disposeRow = undefined
          }
        })

      ctx.effect(
        () =>
          injectLocalized('sidebar.panellist', () =>
            slots.register(
              {
                name: 'sidebar.panellist',
                id: PANEL_KEY,
                order: SIDEBAR_ORDER,
                label: () => (currentLanguage(ctx) === 'zh' ? '技能中心' : 'Skill Center'),
              },
              SkillCenterSidebarIcon,
            ),
          ),
        'skill-center.sidebar-row',
      )

      ctx.effect(
        () =>
          injectLocalized('settings.section', () =>
            slots.register(
              {
                name: 'settings.section',
                id: 'skill-center',
                order: 71,
                locale: 'dsh-skill-center',
                label: () => (currentLanguage(ctx) === 'zh' ? '技能中心' : 'Skill Center'),
              },
              () => h(SkillCenterPage, { ctx }),
            ),
          ),
        'skill-center.settings-section',
      )
    }

    const module = { exports: { inject: ['slots'], apply } }
    return module.exports
  },
})
