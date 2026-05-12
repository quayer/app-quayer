/**
 * skill-registry.service — unit tests
 *
 * Cobertura:
 *  - parseSkillFile: frontmatter válido, sem frontmatter, faltando campos,
 *    arrays, booleans, trim do body.
 *  - loadSkillsFromDirectory: múltiplos arquivos, mistura de extensões,
 *    diretório inexistente, arquivos com parse error.
 *  - filterSkillsByName.
 *
 * fs é mockado via objeto literal — sem tocar disco.
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/ai-agents/services/skill-registry.service.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parseSkillFile,
  loadSkillsFromDirectory,
  filterSkillsByName,
  type FsLike,
} from './skill-registry.service'
import type { SkillManifest } from './skill-activator.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFs(files: Record<string, string>, dirEntries?: string[]): FsLike {
  return {
    async readdir(_path: string) {
      return dirEntries ?? Object.keys(files)
    },
    async readFile(path: string, _encoding: string) {
      // Match por basename para evitar colisão de endsWith
      // (ex.: 'invalid.md'.endsWith('valid.md') === true).
      const normalized = path.replace(/\\/g, '/')
      const base = normalized.split('/').pop() ?? normalized
      const key = Object.keys(files).find((k) => k === base)
      if (key === undefined) throw new Error(`ENOENT: ${path}`)
      return files[key]!
    },
    async stat(_path: string) {
      return { isFile: () => true }
    },
  }
}

function makeFailingReaddirFs(): FsLike {
  return {
    async readdir() {
      throw new Error('ENOENT: no such directory')
    },
    async readFile() {
      throw new Error('not used')
    },
    async stat() {
      return { isFile: () => true }
    },
  }
}

function skillFixture(opts: {
  name?: string
  description?: string
  triggers?: string
  alwaysActive?: string
  body?: string
}): string {
  const lines: string[] = ['---']
  if (opts.name !== undefined) lines.push(`name: ${opts.name}`)
  if (opts.description !== undefined) {
    lines.push(`description: ${opts.description}`)
  }
  if (opts.triggers) lines.push(opts.triggers)
  if (opts.alwaysActive) lines.push(`alwaysActive: ${opts.alwaysActive}`)
  lines.push('---')
  lines.push(opts.body ?? 'Default body content.')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// parseSkillFile
// ---------------------------------------------------------------------------

describe('parseSkillFile', () => {
  it('1. frontmatter válido + content retorna SkillManifest com fields corretos', () => {
    const raw = skillFixture({
      name: 'pricing',
      description: 'Discuss pricing',
      body: 'When user asks about price, respond with table.',
    })

    const result = parseSkillFile(raw)
    expect(result).not.toBeNull()
    expect(result!.name).toBe('pricing')
    expect(result!.description).toBe('Discuss pricing')
    expect(result!.content).toBe(
      'When user asks about price, respond with table.',
    )
  })

  it('2. sem frontmatter (só conteúdo) → null', () => {
    const raw = '# Just a markdown file\n\nNo frontmatter here.'
    expect(parseSkillFile(raw)).toBeNull()
  })

  it('3. frontmatter sem name → null', () => {
    const raw = skillFixture({ description: 'has desc only' })
    expect(parseSkillFile(raw)).toBeNull()
  })

  it('4. frontmatter sem description → null', () => {
    const raw = skillFixture({ name: 'no-desc' })
    expect(parseSkillFile(raw)).toBeNull()
  })

  it('5. triggers.keywords ["a", "b"] parseia como array de strings', () => {
    const raw = [
      '---',
      'name: kw-skill',
      'description: with keywords',
      'triggers:',
      '  keywords:',
      '    - preço',
      '    - desconto',
      '---',
      'Body.',
    ].join('\n')

    const result = parseSkillFile(raw)
    expect(result).not.toBeNull()
    expect(result!.triggers).toBeDefined()
    expect(result!.triggers!.keywords).toEqual(['preço', 'desconto'])
  })

  it('5b. triggers.keywords inline [a, b] também parseia como array', () => {
    const raw = [
      '---',
      'name: kw-inline',
      'description: inline list',
      'triggers:',
      '  keywords: [preço, desconto]',
      '---',
      'Body.',
    ].join('\n')

    const result = parseSkillFile(raw)
    expect(result).not.toBeNull()
    expect(result!.triggers!.keywords).toEqual(['preço', 'desconto'])
  })

  it('6. alwaysActive: true parseia como boolean', () => {
    const raw = skillFixture({
      name: 'always-on',
      description: 'always loaded',
      alwaysActive: 'true',
    })

    const result = parseSkillFile(raw)
    expect(result).not.toBeNull()
    expect(result!.alwaysActive).toBe(true)
  })

  it('7. content é trimmed (sem espaço/newline no início/fim)', () => {
    const raw = [
      '---',
      'name: trim-me',
      'description: trim test',
      '---',
      '',
      '',
      'Real body content here.',
      '',
      '',
    ].join('\n')

    const result = parseSkillFile(raw)
    expect(result).not.toBeNull()
    expect(result!.content).toBe('Real body content here.')
  })
})

// ---------------------------------------------------------------------------
// loadSkillsFromDirectory
// ---------------------------------------------------------------------------

describe('loadSkillsFromDirectory', () => {
  // Silenciar console.warn (esperado em casos de skill inválida)
  let warnSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })
  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('8. diretório com 3 .md files válidos → array de 3 SkillManifest', async () => {
    const files: Record<string, string> = {
      'a.md': skillFixture({ name: 'a', description: 'A skill' }),
      'b.md': skillFixture({ name: 'b', description: 'B skill' }),
      'c.md': skillFixture({ name: 'c', description: 'C skill' }),
    }
    const fs = makeFs(files)

    const result = await loadSkillsFromDirectory('/skills', fs)
    expect(result).toHaveLength(3)
    expect(result.map((s) => s.name).sort()).toEqual(['a', 'b', 'c'])
  })

  it('9. mistura de .md válido com .txt e .md inválido → só retorna .md válidos', async () => {
    const files: Record<string, string> = {
      'valid.md': skillFixture({
        name: 'valid-one',
        description: 'fine',
      }),
      // .md sem campos obrigatórios → inválido
      'invalid.md': '---\nname: only-name\n---\nbody',
      // .txt — deve ser ignorado pela extensão
      'README.txt': skillFixture({
        name: 'ignored',
        description: 'should not load',
      }),
    }
    const fs = makeFs(files)

    const result = await loadSkillsFromDirectory('/skills', fs)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('valid-one')
  })

  it('10. diretório inexistente → array vazio (fail-safe)', async () => {
    const fs = makeFailingReaddirFs()
    const result = await loadSkillsFromDirectory('/does-not-exist', fs)
    expect(result).toEqual([])
  })

  it('11. .md com parse error é ignorado e o loader segue com os outros (log warning)', async () => {
    const files: Record<string, string> = {
      'good.md': skillFixture({
        name: 'good',
        description: 'good one',
      }),
      // Sem closing `---`: extractFrontmatter retorna null → skill inválida.
      'broken.md': '---\nname: broken\ndescription: still broken\nno close',
    }
    const fs = makeFs(files)

    const result = await loadSkillsFromDirectory('/skills', fs)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('good')
    expect(warnSpy).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// filterSkillsByName
// ---------------------------------------------------------------------------

describe('filterSkillsByName', () => {
  const sample: SkillManifest[] = [
    { name: 'a', description: 'A', content: 'body a' },
    { name: 'b', description: 'B', content: 'body b' },
    { name: 'c', description: 'C', content: 'body c' },
  ]

  it('12. filtra corretamente pelos names passados', () => {
    const result = filterSkillsByName(sample, ['a', 'c'])
    expect(result).toHaveLength(2)
    expect(result.map((s) => s.name)).toEqual(['a', 'c'])
  })

  it('13. names vazios → array vazio', () => {
    expect(filterSkillsByName(sample, [])).toEqual([])
  })

  it('14. skills vazias → array vazio', () => {
    expect(filterSkillsByName([], ['a', 'b'])).toEqual([])
  })
})
