import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(root, relativePath), 'utf8'))
}

function collectKeys(value, prefix = '') {
  const keys = []
  if (!value || typeof value !== 'object' || Array.isArray(value)) return keys
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (child && typeof child === 'object' && !Array.isArray(child)) keys.push(...collectKeys(child, path))
    else keys.push(path)
  }
  return keys.sort()
}

test('package manifest exposes host, client, locale and icon entry points', async () => {
  const pkg = await readJson('package.json')
  assert.match(pkg.description, /技能|启用|禁用/)
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.dsh.engines.dsh, '>=0.2.0-rc.1')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.deepEqual(pkg.dsh.client.inject, [
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-slots',
  ])
  for (const key of ['.', './index.js', './client', './package.json', './locale/*.json', './icon']) {
    assert.ok(pkg.exports[key], `missing export ${key}`)
  }
  for (const required of [
    'ctx.effect',
    'ctx.get',
    'ctx.on',
    'ctx.skills.registerProvider',
    'ctx.skills.snapshot',
    'ctx.webServer.register',
    'ctx.workspaceRegistry.list',
  ]) {
    assert.ok(pkg.dsh.requires.includes(required), `dsh.requires missing ${required}`)
  }
  for (const file of pkg.files) {
    await stat(join(root, file)).catch((error) => {
      assert.fail(`files entry does not exist: ${file} (${error.code})`)
    })
  }
})

test('Chinese and English locale dictionaries have the same keys and metadata', async () => {
  const zh = await readJson('locale/zh.json')
  const en = await readJson('locale/en.json')
  assert.deepEqual(collectKeys(zh), collectKeys(en))
  assert.ok(zh.meta.title.trim())
  assert.ok(zh.meta.description.trim())
  assert.ok(en.meta.title.trim())
  assert.ok(en.meta.description.trim())
  assert.match(zh.meta.description, /编辑|复制|删除/)
  assert.match(en.meta.description, /edit|duplicate|delete/i)
})

test('bilingual READMEs and publishing guide exist and describe the settings entry', async () => {
  const readme = await readFile(join(root, 'README.md'), 'utf8')
  const readmeEn = await readFile(join(root, 'README.en.md'), 'utf8')
  const publishing = await readFile(join(root, 'docs', 'PUBLISHING.md'), 'utf8')
  assert.match(readme, /设置 → 技能中心/)
  assert.match(readmeEn, /Settings → Skill Center/)
  assert.match(publishing, /awesome-dsh-plugin/)
  assert.match(publishing, /github:[A-Za-z0-9_.-]+\/dsh-skill-center/)
})

test('client registers a sidebar entry and its matching main panel', async () => {
  const client = await readFile(join(root, 'client.js'), 'utf8')
  assert.match(client, /const PANEL_KEY = 'skill-center'/)
  assert.match(client, /name: 'sidebar\.panellist'/)
  assert.match(client, /name: 'main', key: PANEL_KEY/)
})

test('client exposes a persisted bilingual language switch', async () => {
  const client = await readFile(join(root, 'client.js'), 'utf8')
  assert.match(client, /const LANG_STORAGE_KEY = 'dsh-skill-center\.lang'/)
  assert.match(client, /function LanguageSwitch/)
  assert.match(client, /function currentLanguage/)
  assert.match(client, /h\(LanguageSwitch, \{ lang, onChange: setPluginLanguage \}\)/)
  assert.match(client, /LANG_SUBSCRIBERS/)
  assert.doesNotMatch(client, /return parts\.length \? `\$\{t\(lang, 'callable'\)\}：/)
})
