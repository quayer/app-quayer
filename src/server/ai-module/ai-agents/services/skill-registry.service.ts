/**
 * Skill Registry Service
 *
 * Carrega skills definidas como arquivos markdown com frontmatter YAML em
 * SkillManifest compatível com skill-activator.service.
 *
 * Convenção:
 *  - Arquivos .md no diretório alvo (ex.: `.claude/skills/agent/*.md`).
 *  - Frontmatter YAML simples entre duas linhas `---`.
 *  - Conteúdo após o segundo `---` vira `SkillManifest.content` (trimmed).
 *
 * Decisão de design: parser YAML manual (regex) em vez de `js-yaml` para
 * evitar dependência. Cobre o subset que usamos:
 *  - key: value (string)
 *  - key: true|false (boolean)
 *  - key:\n  subkey: value (objeto plano de 1 nível, ex. triggers)
 *  - key: [a, b]  ou  key:\n  - a\n  - b (arrays de string)
 *
 * Reference: src/skills/loadSkillsDir.ts do Claude Code leak.
 */
import {
  promises as nodeFs,
  type Dirent as NodeDirent,
  type Stats as NodeStats,
} from 'fs'
import { join } from 'path'

import type { SkillManifest } from './skill-activator.service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillFrontmatter {
  name: string
  description: string
  triggers?: {
    keywords?: string[]
    journeyStages?: string[]
    customerJourney?: string[]
  }
  alwaysActive?: boolean
  // permite campos arbitrários
  [key: string]: unknown
}

/**
 * Interface mínima de fs para mock em testes. Compatível com `fs/promises`.
 */
export interface FsLike {
  readdir(path: string): Promise<string[]>
  readFile(path: string, encoding: string): Promise<string>
  stat(path: string): Promise<{ isFile(): boolean }>
}

// ---------------------------------------------------------------------------
// Default fs (Node)
// ---------------------------------------------------------------------------

const defaultFs: FsLike = {
  async readdir(path) {
    // node retorna Dirent[] ou string[] dependendo das opções; aqui pedimos
    // string[] (encoding default).
    const entries = (await nodeFs.readdir(path)) as unknown as
      | string[]
      | NodeDirent[]
    return entries.map((e) =>
      typeof e === 'string' ? e : (e as NodeDirent).name,
    )
  },
  async readFile(path, encoding) {
    return nodeFs.readFile(path, { encoding: encoding as BufferEncoding })
  },
  async stat(path) {
    const s = (await nodeFs.stat(path)) as NodeStats
    return { isFile: () => s.isFile() }
  },
}

// ---------------------------------------------------------------------------
// YAML mini-parser (subset)
// ---------------------------------------------------------------------------

/**
 * Parse um valor escalar YAML simples.
 *
 *  - "true" / "false" → boolean
 *  - número puro → number
 *  - "[a, b, c]" → array de strings (sem aspas)
 *  - string com ou sem aspas → string (aspas externas removidas)
 */
function parseScalar(raw: string): unknown {
  const v = raw.trim()
  if (v === 'true') return true
  if (v === 'false') return false
  if (v === 'null' || v === '~' || v === '') return null
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)

  // inline array: [a, b, "c"]
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim()
    if (inner.length === 0) return []
    return inner.split(',').map((item) => unquote(item.trim()))
  }

  return unquote(v)
}

function unquote(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1)
  }
  return s
}

interface YamlParseResult {
  data: Record<string, unknown>
}

/**
 * Parse um bloco YAML com indentação por 2 espaços.
 * Suporta:
 *  - key: scalar
 *  - key:           (mapa aninhado)
 *      sub: scalar
 *  - key:           (array de blocos)
 *      - item
 *      - item
 */
function parseYaml(source: string): YamlParseResult {
  const lines = source.split(/\r?\n/)
  const data: Record<string, unknown> = {}

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line === undefined) {
      i++
      continue
    }
    if (line.trim() === '' || line.trim().startsWith('#')) {
      i++
      continue
    }

    const indent = line.length - line.trimStart().length
    if (indent !== 0) {
      // Linha indentada solta no topo: ignora.
      i++
      continue
    }

    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/)
    if (!m) {
      i++
      continue
    }

    const key = m[1]!
    const rest = m[2] ?? ''

    if (rest.trim().length > 0) {
      data[key] = parseScalar(rest)
      i++
      continue
    }

    // Sem valor inline: olha próximas linhas indentadas.
    const block: string[] = []
    i++
    while (i < lines.length) {
      const next = lines[i]
      if (next === undefined) break
      if (next.trim() === '') {
        block.push(next)
        i++
        continue
      }
      const nIndent = next.length - next.trimStart().length
      if (nIndent === 0) break
      block.push(next)
      i++
    }

    data[key] = parseBlockValue(block)
  }

  return { data }
}

function parseBlockValue(block: string[]): unknown {
  const meaningful = block.filter((l) => l.trim() !== '')
  if (meaningful.length === 0) return null

  // Detectar lista (todas linhas começam com `- `)
  const allList = meaningful.every((l) => /^\s*-\s+/.test(l))
  if (allList) {
    return meaningful.map((l) => {
      const m = l.match(/^\s*-\s+(.*)$/)
      return m ? unquote(m[1]!.trim()) : ''
    })
  }

  // Caso contrário, mapa aninhado. Reduzimos indentação base e re-parseamos.
  const baseIndent = Math.min(
    ...meaningful.map((l) => l.length - l.trimStart().length),
  )
  const dedented = block
    .map((l) => (l.length >= baseIndent ? l.slice(baseIndent) : l))
    .join('\n')

  return parseYaml(dedented).data
}

// ---------------------------------------------------------------------------
// Frontmatter extraction
// ---------------------------------------------------------------------------

interface ExtractedFrontmatter {
  frontmatter: string
  body: string
}

function extractFrontmatter(raw: string): ExtractedFrontmatter | null {
  // Normaliza CRLF para LF antes de matchar.
  const normalized = raw.replace(/\r\n/g, '\n')
  // Permite BOM e whitespace inicial.
  const stripped = normalized.replace(/^﻿/, '').replace(/^\s+/, '')
  if (!stripped.startsWith('---')) return null

  const afterOpen = stripped.slice(3)
  // A primeira linha após `---` deve ser um newline (ou só LF).
  if (!afterOpen.startsWith('\n')) return null

  const rest = afterOpen.slice(1)
  const closeIdx = rest.indexOf('\n---')
  if (closeIdx === -1) return null

  const frontmatter = rest.slice(0, closeIdx)
  // Após `\n---`, consome até o próximo \n (ou EOF).
  const afterClose = rest.slice(closeIdx + 4)
  const bodyStart = afterClose.indexOf('\n')
  const body = bodyStart === -1 ? '' : afterClose.slice(bodyStart + 1)
  return { frontmatter, body }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse um arquivo de skill (string raw com frontmatter + body markdown).
 * Retorna `null` se faltar frontmatter, campos obrigatórios ou ocorrer erro.
 */
export function parseSkillFile(rawContent: string): SkillManifest | null {
  try {
    const extracted = extractFrontmatter(rawContent)
    if (!extracted) return null

    const parsed = parseYaml(extracted.frontmatter).data
    const front = parsed as SkillFrontmatter

    if (typeof front.name !== 'string' || front.name.trim() === '') return null
    if (
      typeof front.description !== 'string' ||
      front.description.trim() === ''
    ) {
      return null
    }

    const manifest: SkillManifest = {
      name: front.name.trim(),
      description: front.description.trim(),
      content: extracted.body.trim(),
    }

    if (typeof front.alwaysActive === 'boolean') {
      manifest.alwaysActive = front.alwaysActive
    }

    if (front.triggers && typeof front.triggers === 'object') {
      const t = front.triggers as Record<string, unknown>
      const triggers: NonNullable<SkillManifest['triggers']> = {}
      if (Array.isArray(t.keywords)) {
        triggers.keywords = t.keywords.map(String)
      }
      if (Array.isArray(t.journeyStages)) {
        triggers.journeyStages = t.journeyStages.map(String)
      }
      if (Array.isArray(t.customerJourney)) {
        triggers.customerJourney = t.customerJourney.map(String)
      }
      if (Object.keys(triggers).length > 0) {
        manifest.triggers = triggers
      }
    }

    return manifest
  } catch {
    return null
  }
}

/**
 * Lê um diretório, carrega todo `*.md` válido e retorna a lista de skills.
 * Fail-safe: diretório inexistente ou arquivo com parse error → ignorado.
 */
export async function loadSkillsFromDirectory(
  dirPath: string,
  fs: FsLike = defaultFs,
): Promise<SkillManifest[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(dirPath)
  } catch {
    return []
  }

  const mdFiles = entries.filter((f) => f.toLowerCase().endsWith('.md'))
  const skills: SkillManifest[] = []

  for (const file of mdFiles) {
    const fullPath = join(dirPath, file)
    let raw: string
    try {
      raw = await fs.readFile(fullPath, 'utf8')
    } catch {
      // arquivo ilegível — ignora
      continue
    }

    const manifest = parseSkillFile(raw)
    if (manifest) {
      skills.push(manifest)
    } else {
      // Skill inválida — log warning sem quebrar o loader.
       
      console.warn(
        `[skill-registry] Skipping invalid skill file: ${fullPath}`,
      )
    }
  }

  return skills
}

/**
 * Filtra skills cujo `name` está incluído em `names`.
 * Útil para selecionar um subset configurado por agente.
 */
export function filterSkillsByName(
  skills: SkillManifest[],
  names: string[],
): SkillManifest[] {
  if (skills.length === 0 || names.length === 0) return []
  const wanted = new Set(names)
  return skills.filter((s) => wanted.has(s.name))
}
