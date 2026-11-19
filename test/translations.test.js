import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { localizedDescriptions } from '../lib/descriptions.js'
import { buildInventory } from '../lib/inventory.js'
import {
  descriptionFingerprint,
  emptyTranslationCache,
  ensureSkillDescriptions,
  looksChinese,
  readTranslationCache,
  translationCachePath,
  translationPlan,
  writeTranslationCache,
} from '../lib/translations.js'

test('translationPlan translates English to Chinese and Chinese to English', () => {
  const cache = emptyTranslationCache()
  assert.deepEqual(translationPlan({ name: 'future-en', description: 'Build a dashboard.' }, cache), {
    zh: true,
    en: false,
  })
  assert.deepEqual(translationPlan({ name: 'future-zh', description: '构建一个仪表盘。' }, cache), {
    zh: false,
    en: true,
  })
  // Manual entries are complete for these known skills.
  assert.deepEqual(translationPlan({ name: 'finesse-brief', description: 'English original' }, cache), {
    zh: false,
    en: false,
  })
})

test('translation cache is hash-scoped and round-trips atomically', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-center-translations-'))
  try {
    const filePath = translationCachePath(root)
    const cache = emptyTranslationCache()
    cache.entries['future-skill'] = {
      hash: descriptionFingerprint('Build widgets.'),
      zh: '构建小部件。',
    }
    await writeTranslationCache(filePath, cache)
    const loaded = await readTranslationCache(filePath)
    assert.equal(loaded.cache.entries['future-skill'].zh, '构建小部件。')
    const disk = JSON.parse(await readFile(filePath, 'utf8'))
    assert.equal(disk.version, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ensureSkillDescriptions uses the translator service and caches the result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-center-translator-'))
  try {
    const calls = []
    const translator = {
      maxTextChars: 4000,
      resolve({ text, targetLanguage }) {
        calls.push({ text, targetLanguage })
        return { text, targetLanguage }
      },
      async translate(spec) {
        return spec.targetLanguage === 'zh' ? '构建一个仪表盘。' : 'Build a dashboard.'
      },
    }
    const ctx = {
      get(name) {
        return name === 'translator' ? translator : undefined
      },
    }
    const first = await ensureSkillDescriptions({
      ctx,
      skills: [{ name: 'future-skill', description: 'Build a dashboard.' }],
      cache: emptyTranslationCache(),
      dshHome: root,
    })
    assert.equal(first.stats.translated, 1)
    assert.equal(first.entries['future-skill'].zh, '构建一个仪表盘。')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].targetLanguage, 'zh')

    const second = await ensureSkillDescriptions({
      ctx,
      skills: [{ name: 'future-skill', description: 'Build a dashboard.' }],
      cache: { version: 1, entries: first.entries },
      dshHome: root,
    })
    assert.equal(second.stats.attempted, 0)
    assert.equal(calls.length, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('ensureSkillDescriptions falls back to the active default model', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-center-llm-'))
  try {
    const ctx = {
      get(name) {
        if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'fixture', model: 'fixture-model' }) }
        if (name === 'llm') {
          return {
            async *stream() {
              yield { type: 'text-delta', text: '构建' }
              yield { type: 'text-delta', text: '仪表盘。' }
              yield { type: 'finish', reason: { kind: 'stop' } }
            },
          }
        }
        return undefined
      },
    }
    const result = await ensureSkillDescriptions({
      ctx,
      skills: [{ name: 'future-skill', description: 'Build a dashboard.' }],
      cache: emptyTranslationCache(),
      dshHome: root,
    })
    assert.equal(result.stats.translated, 1)
    assert.equal(result.entries['future-skill'].zh, '构建仪表盘。')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('unknown generated descriptions override the inventory display fields only', () => {
  assert.equal(looksChinese('构建一个仪表盘。'), true)
  assert.equal(looksChinese('Build a dashboard.'), false)
  assert.deepEqual(localizedDescriptions('future-skill', 'Build a dashboard.', {
    'future-skill': { zh: '构建一个仪表盘。' },
  }), {
    zh: '构建一个仪表盘。',
    en: 'Build a dashboard.',
  })
  const inventory = buildInventory({
    snapshotSkills: [
      {
        name: 'future-skill',
        description: 'Build a dashboard.',
        source: 'user-dsh',
        path: '/home/.dsh/skills/future-skill/SKILL.md',
        invocation: { modelInvocable: true, userInvocable: true },
        provider: 'filesystem',
      },
    ],
    descriptionTranslations: { 'future-skill': { zh: '构建一个仪表盘。' } },
  })
  assert.equal(inventory.skills[0].description, 'Build a dashboard.')
  assert.equal(inventory.skills[0].descriptionZh, '构建一个仪表盘。')
  assert.equal(inventory.skills[0].descriptionEn, 'Build a dashboard.')
})
