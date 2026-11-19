/**
 * UI descriptions for skills whose SKILL.md description is written in the
 * other language. These translations are display-only: the model-facing
 * catalog and the token estimate always keep the original description.
 *
 * A skill can override its entry by adding `description-zh` / `description-en`
 * to the SKILL.md frontmatter; scan.js intentionally ignores unknown fields,
 * so this table is the central place for plugin-local translations.
 */
export const SKILL_DESCRIPTIONS = Object.freeze({
  'finesse-brief': {
    zh: '在动手设计之前先定义产品——把一句模糊需求变成可直接开工的 Workbench Spec，明确产品是什么、给谁用、首屏结构、数据模型与页面层级；覆盖个人每日回访工作台与业务系统/后台，并输出 spec.md 与可执行的实现说明。',
  },
  'finesse-ui': {
    zh: '构建与打磨高质感的 Web 界面：品牌站、产品仪表盘与工作流、AI 工作台、电商、H5/移动端页面与组件；支持 Apple 风格、视觉审计、可访问性、动效与设计系统提取。',
  },
  'rea-video': {
    en: 'Reverse-engineer how a video was made, shot by shot: live action, stock footage, AI generation, 3D render, 2D animation, stop motion, code-template render, screen capture, still-image push/pull, and static frames; identify AI processing and post-production layers, analyze voice, music, sound effects, and editing rhythm, then produce a practical replication plan.',
  },
  'remove-ai-marks': {
    zh: '移除多家厂商的 AI 来源标记：不可见 Unicode、统计式文本水印（通过改写）、以及 PNG/JPEG/WebP/SVG/PDF/DOCX/ODT/HTML/MD/TEX 中的 C2PA/EXIF/XMP/容器元数据；覆盖 Claude、Gemini/SynthID、OpenAI 与开源大模型采样标记。',
  },
  'reverse-engineer-anything': {
    zh: '使用 REA 逆向拆解原生、托管、Electron/JavaScript、打包、固件与浏览器目标；基于已发布产物或运行时证据解释功能、比较版本、反编译代码或指导重建；普通源码仓库架构分析不适用。',
  },
})

/**
 * @param {string} name
 * @returns {{ zh?: string, en?: string }}
 */
export function manualDescriptions(name) {
  return SKILL_DESCRIPTIONS[name] ?? {}
}

/**
 * Resolve both display languages. Manual entries win, then generated entries
 * from the translation cache, then the original SKILL.md text.
 *
 * @param {string} name
 * @param {string} original
 * @param {Record<string, { zh?: string, en?: string }>} [translations]
 * @returns {{ zh: string, en: string }}
 */
export function localizedDescriptions(name, original, translations = {}) {
  const entry = SKILL_DESCRIPTIONS[name] ?? {}
  const generated = translations?.[name] ?? {}
  return {
    zh: entry.zh || generated.zh || original || '',
    en: entry.en || generated.en || original || '',
  }
}
