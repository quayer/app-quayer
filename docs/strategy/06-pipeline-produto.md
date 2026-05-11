# PRD — Pipeline de Processamento: Módulos 2-5

**Projeto:** Base de Conhecimento — Metodologia Startup (Cápsula One)
**Data:** 2026-04-03
**Autor:** Claude Code
**Baseline:** MODULO1 (100% completo, pipeline validado)

---

## Contexto

O MODULO1 foi processado com sucesso usando um pipeline de 10 User Stories (US-001 a US-010). Os módulos 2 a 5 contêm vídeos brutos (.ts), PDFs e materiais complementares que precisam passar pelo mesmo pipeline. O MODELO2 teve processamento parcial (MP4 convertidos, 1 PDF vazio, sem transcrições).

### Inventário de Conteúdo Bruto

| Módulo | Pasta | Tema | Aulas | Tamanho Total | PDFs | Materiais Extra |
|--------|-------|------|:-----:|:-------------:|:----:|:---------------:|
| 2 | `MODELO2/` | Estratégias de Entrada no Mercado | 4 | 754 MB | 3 | 1 planilha .xlsx |
| 3 | `MODELO3/` | Identificando a Dor do Cliente | 4 | 533 MB | 1 | 1 roteiro .docx |
| 4 | `MODULO4/` | Solução e Produto | 4 | 771 MB | 1 | — |
| 5 | `MODULO5/` | Modelos de Receita | 2 | 255 MB | 1 | — |
| **Total** | | | **14** | **2.313 MB** | **6** | **2** |

### Aulas por Módulo (detalhe)

**MODELO2 — Estratégias de Entrada no Mercado**
| # | Arquivo .ts | Tamanho | MP4 | Material |
|---|-------------|:-------:|:---:|----------|
| 1 | Segmentação de Mercado | 370 MB | Convertido | PDF: A importância da Segmentação |
| 2 | Processo Empreendedor | 154 MB | Convertido | PDF: O processo empreendedor + Processo Empreendedor |
| 3.1 | Como Segmentar | 225 MB | Convertido | — |
| 3.2 | Segmentar — Usando o Excel | 30 MB | Convertido | Planilha: Excel - Planilha de Segmentação.xlsx |
| **Refs:** | `ref.txt` → 1 link (Medium/Astella) | | | |

**MODELO3 — Identificando a Dor do Cliente**
| # | Arquivo .ts | Tamanho | Material |
|---|-------------|:-------:|----------|
| 1 | Jobs to be Done | 182 MB | PDF: A Descoberta do Cliente |
| 2 | Jornada & Dores | 91 MB | — |
| 3.1 | Entrevista | 144 MB | — |
| 3.2 | Roteiro de Entrevista | 116 MB | .docx: Roteiro de Entrevista - Persona, Job, Jornada e Dores |
| **Refs:** | `ref.txt` → 2 links (First Round Review, YouTube) | | |

**MODULO4 — Solução e Produto**
| # | Arquivo .ts | Tamanho | Material |
|---|-------------|:-------:|----------|
| 1 | Redefinição do Problema | 83 MB | PDF: Solução e Produto |
| 2 | MVP | 316 MB | — |
| 3 | Aderência Problema-Solução | 208 MB | — |
| 4 | Otimizar MVP | 164 MB | — |
| **Refs:** | `REF.txt` → 5 links (YouTube + First Round Review) | | |

**MODULO5 — Modelos de Receita**
| # | Arquivo .ts | Tamanho | Material |
|---|-------------|:-------:|----------|
| 1 | Proposta de valor quantificada | 115 MB | PDF: Teste de Modelos de Receita |
| 2 | Captura de valor | 140 MB | — |
| **Refs:** | nenhum | | |

---

## Problema de Naming

Os módulos 2 e 3 usam `MODELO` em vez de `MODULO`. Decisão necessária:

- **Opção A:** Renomear para `MODULO2/`, `MODULO3/` (consistência)
- **Opção B:** Manter como está (evita quebrar refs do OneDrive)

**Recomendação:** Opção A (renomear), pois não há refs externas e a consistência facilita automação do script.

---

## Pipeline — Fases

```
Fase 0: Normalizar estrutura (naming + subpastas)
Fase 1: Converter .ts → .mp4 (ffmpeg)
Fase 2: Extrair áudio .mp4 → .mp3 (ffmpeg)
Fase 3: Transcrever com Whisper API
Fase 4: Processar PDFs + materiais → Markdown
Fase 5: Criar documento master por aula (transcrição + PDF + contexto)
Fase 6: Criar INDEX.md por módulo
Fase 7: Criar/atualizar skills por módulo
Fase 8: Validar links de referência
Fase 9: Pesquisar tendências 2026/2027
Fase 10: Atualizar INDEX.md global
```

---

## User Stories

### US-100: Normalizar estrutura de pastas
**Como** processador do pipeline,
**Quero** que todos os módulos tenham naming e subpastas consistentes,
**Para que** o script de automação funcione uniformemente.

**Ações:**
1. Renomear `MODELO2/` → `MODULO2/` (se aprovado)
2. Renomear `MODELO3/` → `MODULO3/`
3. Criar subpastas faltantes em cada módulo: `mp4/`, `audio/`, `transcricoes/`, `pdfs/`, `aulas/`, `links/`, `tendencias/`
4. Validar que nenhum arquivo se perde no rename

**Critério de aceite:** Todos os módulos seguem o padrão `MODULO{N}/` com subpastas idênticas ao MODULO1.

**Custo:** $0 | **Risco:** Baixo (arquivos locais)

---

### US-101: Converter .ts → .mp4 (Módulos 3, 4, 5)
**Como** processador do pipeline,
**Quero** converter todos os vídeos .ts restantes para .mp4,
**Para que** possam ser processados pelo ffmpeg para áudio.

**Nota:** MODELO2 já tem MP4 convertidos (4 arquivos). Só falta módulos 3, 4, 5.

**Ações:**
```bash
# Para cada .ts em MODULO3/, MODULO4/, MODULO5/:
ffmpeg -i "input.ts" -c copy "mp4/output.mp4"
```

**Mapeamento de nomes:**

| Módulo | Arquivo .ts | → MP4 |
|--------|-------------|-------|
| 3 | IDENTIFICANDO A DOR DO CLIENTE1. Jobs to be Done.ts | `mp4/aula_01_jobs_to_be_done.mp4` |
| 3 | IDENTIFICANDO A DOR DO CLIENTE2. Jornada & Dores.ts | `mp4/aula_02_jornada_dores.mp4` |
| 3 | IDENTIFICANDO A DOR DO CLIENTE3.1Entrevista.ts | `mp4/aula_03_1_entrevista.mp4` |
| 3 | IDENTIFICANDO A DOR DO CLIENTE.3.2Roteiro de Entrevista.ts | `mp4/aula_03_2_roteiro_entrevista.mp4` |
| 4 | 1. Redefinição do Problema.ts | `mp4/aula_01_redefinicao_problema.mp4` |
| 4 | 2. MVP.ts | `mp4/aula_02_mvp.mp4` |
| 4 | 3.Aderência ProblemaSolução.ts | `mp4/aula_03_aderencia_problema_solucao.mp4` |
| 4 | 4. Otimizar MVP.ts | `mp4/aula_04_otimizar_mvp.mp4` |
| 5 | 1. Proposta de valor quantificada.ts | `mp4/aula_01_proposta_valor.mp4` |
| 5 | 2. Captura de valor.ts | `mp4/aula_02_captura_valor.mp4` |

**Critério de aceite:** 10 arquivos MP4 criados, reproduzíveis, tamanho ~= original .ts.

**Custo:** $0 (local) | **Risco:** Baixo

---

### US-102: Extrair áudio .mp4 → .mp3 (Módulos 2, 3, 4, 5)
**Como** processador do pipeline,
**Quero** extrair o áudio de todos os MP4 em formato .mp3,
**Para que** possam ser enviados ao Whisper API (limite 25MB).

**Ações:**
```bash
# Para cada .mp4:
ffmpeg -i "mp4/input.mp4" -vn -acodec libmp3lame -q:a 4 "audio/output.mp3"
```

**Mapeamento:** Mesmo nome do MP4 mas em `audio/` com extensão `.mp3`.

**Validação pós:**
- Verificar que cada .mp3 tem < 25MB (limite Whisper)
- Se > 25MB, split com: `ffmpeg -i input.mp3 -f segment -segment_time 1200 -c copy audio/aula_XX_part%02d.mp3`

**Critério de aceite:** 14 arquivos .mp3 (4+4+4+2), todos < 25MB.

**Custo:** $0 (local) | **Risco:** Baixo

---

### US-103: Transcrever com Whisper API (Módulos 2, 3, 4, 5)
**Como** processador do pipeline,
**Quero** transcrever todos os áudios usando Whisper API,
**Para que** tenhamos transcrições em markdown com timestamps.

**Ações:**
1. Atualizar `scripts/transcribe.mjs` para aceitar módulo como argumento (hoje hardcoded `MODULO1`)
2. Rodar para cada módulo: `node scripts/transcribe.mjs MODULO2`
3. Output: `transcricoes/aula_XX_raw.json` + `transcricoes/aula_XX_raw.md`

**Estimativa de custo Whisper:**
| Módulo | Aulas | Duração estimada | Custo (~$0.006/min) |
|--------|:-----:|:----------------:|:-------------------:|
| 2 | 4 | ~45 min | ~$0.27 |
| 3 | 4 | ~35 min | ~$0.21 |
| 4 | 4 | ~50 min | ~$0.30 |
| 5 | 2 | ~20 min | ~$0.12 |
| **Total** | **14** | **~150 min** | **~$0.90** |

**Critério de aceite:** 14 transcrições (.md + .json) com timestamps por segmento.

**Custo:** ~$0.90 | **Risco:** Médio (depende de API key + limite de arquivo)

---

### US-104: Processar PDFs e materiais → Markdown (Módulos 2, 3, 4, 5)
**Como** processador do pipeline,
**Quero** extrair todos os PDFs e materiais complementares para Markdown,
**Para que** possam ser integrados nos documentos master.

**Inventário:**
| Módulo | Arquivo | Destino |
|--------|---------|---------|
| 2 | A+importancia+da+Segmentação.pdf | `pdfs/importancia_segmentacao.md` (reprocessar — arquivo vazio!) |
| 2 | O+processo+empreendedor.pdf | `pdfs/processo_empreendedor.md` |
| 2 | Processo+Empreendedor.pdf | `pdfs/processo_empreendedor_slides.md` |
| 2 | Excel - Planilha de Segmentação.xlsx | `pdfs/planilha_segmentacao.md` (extrair estrutura) |
| 3 | A+Descoberta+do+Cliente.pdf | `pdfs/descoberta_cliente.md` |
| 3 | Roteiro de Entrevista...docx | `pdfs/roteiro_entrevista.md` |
| 4 | Solução+e+Produto.pdf | `pdfs/solucao_produto.md` |
| 5 | Teste+de+Modelos+de+Receita.pdf | `pdfs/teste_modelos_receita.md` |

**Nota:** MODELO2 tem `pdfs/importancia_segmentacao.md` mas com 0 bytes — precisa reprocessar.

**Ferramentas:** `pdf-parse` (PDFs), `mammoth` (.docx), `xlsx` (planilhas)

**Critério de aceite:** 8 arquivos .md com conteúdo extraído, sem arquivos vazios.

**Custo:** $0 (local) | **Risco:** Baixo

---

### US-105: Criar documentos master por aula (Módulos 2, 3, 4, 5)
**Como** consumidor da base de conhecimento,
**Quero** um documento master por aula que combine transcrição + PDF + contexto,
**Para que** cada aula tenha uma referência completa e consultável.

**Formato (seguir MODULO1):**
```markdown
# Aula XX: [Nome]

**Instrutor:** Tomás Martins (Cápsula One)
**Duração:** MM:SS
**Módulo:** N — [Tema]

---

## Resumo Executivo
- [3-5 bullets com os pontos principais]

## Conceitos-Chave
### [Conceito 1]
[Explicação baseada na transcrição + slides]

## Frameworks e Ferramentas
[Se aplicável]

## Citações Relevantes
> "Quote direto da transcrição"

## Conexões com Outros Módulos
[Links cruzados]

## Aplicação Prática — Quayer
[Como aplicar ao projeto do Gabriel]
```

**Critério de aceite:** 14 documentos master em `aulas/`, formato consistente com MODULO1.

**Custo:** $0 (Claude Code gera) | **Risco:** Baixo

---

### US-106: Criar INDEX.md por módulo
**Como** consumidor da base de conhecimento,
**Quero** um INDEX.md por módulo com visão geral, mapa de conceitos e links,
**Para que** cada módulo seja navegável independentemente.

**Formato:** Seguir `MODULO1/INDEX.md` (tabela de aulas, mapa Mermaid, materiais, estatísticas).

**Critério de aceite:** 4 arquivos INDEX.md (um por módulo), com mapa Mermaid de conceitos.

**Custo:** $0 | **Risco:** Baixo

---

### US-107: Criar/atualizar skills por módulo
**Como** usuário do Claude Code,
**Quero** skills específicas por módulo para consulta durante o trabalho,
**Para que** eu possa aplicar os frameworks da metodologia direto no projeto.

**Skills propostas:**
| Módulo | Skill | Domínio |
|--------|-------|---------|
| 2 | `modulo2-segmentacao.md` | Segmentação de mercado, TAM/SAM/SOM, processo empreendedor |
| 3 | `modulo3-descoberta-cliente.md` | Jobs to be Done, jornada do cliente, entrevistas, dores |
| 4 | `modulo4-solucao-produto.md` | MVP, problem-solution fit, redefinição de problema |
| 5 | `modulo5-modelos-receita.md` | Proposta de valor, captura de valor, modelos de receita |

**Critério de aceite:** 4 novas skills em `skills/`, formato YAML frontmatter compatível com Claude Code.

**Custo:** $0 | **Risco:** Baixo

---

### US-108: Validar links de referência (Módulos 2, 3, 4)
**Como** consumidor da base de conhecimento,
**Quero** que todos os links nos ref.txt sejam validados (HTTP status),
**Para que** eu saiba quais referências ainda estão acessíveis.

**Links a validar:**
| Módulo | Links |
|--------|:-----:|
| 2 | 1 (Medium) |
| 3 | 2 (First Round, YouTube) |
| 4 | 5 (YouTube x3, First Round x2) |
| 5 | 0 |
| **Total** | **8** |

**Output:** `links/links-report.md` por módulo.

**Critério de aceite:** Relatório com URL, status HTTP, título da página.

**Custo:** $0 | **Risco:** Baixo

---

### US-109: Pesquisar tendências 2026/2027 por módulo
**Como** consumidor da base de conhecimento,
**Quero** contexto atualizado sobre cada tema (tendências 2026/2027),
**Para que** o conteúdo do curso esteja complementado com informações recentes.

**Temas a pesquisar:**
| Módulo | Tema de pesquisa |
|--------|-----------------|
| 2 | Segmentação de mercado em SaaS 2026, frameworks modernos de GTM |
| 3 | Customer discovery com AI, ferramentas de pesquisa qualitativa 2026 |
| 4 | MVP com AI/no-code 2026, product-market fit frameworks modernos |
| 5 | Modelos de receita SaaS 2026, usage-based pricing, PLG trends |

**Output:** `tendencias/[tema]_tendencias_2026.md` por módulo.

**Critério de aceite:** 4+ documentos de tendências com fontes citadas.

**Custo:** $0 | **Risco:** Médio (qualidade depende das fontes)

---

### US-110: Atualizar INDEX.md global
**Como** consumidor da base de conhecimento,
**Quero** que o INDEX.md raiz reflita todos os 5 módulos processados,
**Para que** sirva como ponto de entrada único para toda a base.

**Ações:**
1. Atualizar tabela de módulos (1-5 com links)
2. Atualizar tabela de skills (8 skills)
3. Atualizar estatísticas globais
4. Adicionar seção de planilhas (.xlsx)
5. Adicionar seção de materiais extras (.docx)

**Critério de aceite:** INDEX.md com 5 módulos, todas as skills, todos os materiais listados.

**Custo:** $0 | **Risco:** Baixo

---

### US-111: Atualizar script de automação
**Como** processador do pipeline,
**Quero** que `scripts/transcribe.mjs` aceite qualquer módulo como argumento,
**Para que** não precise editar o script a cada módulo.

**Mudanças:**
```javascript
// De:
const audioDir = path.join(BASE, 'MODULO1', 'audio');
// Para:
const moduleName = process.argv[2] || 'MODULO1';
const audioDir = path.join(BASE, moduleName, 'audio');
```

**Bonus:** Criar `scripts/pipeline.mjs` que orquestra todas as fases (ffmpeg → whisper → pdf → master).

**Critério de aceite:** `node scripts/transcribe.mjs MODULO2` funciona sem editar o script.

**Custo:** $0 | **Risco:** Baixo

---

## Ordem de Execução

```
US-100 (normalizar)
  │
  ├─→ US-101 (converter .ts → .mp4) ──→ US-102 (extrair áudio) ──→ US-103 (Whisper)
  │                                                                        │
  ├─→ US-104 (processar PDFs)                                              │
  │         │                                                              │
  │         └──────────────────────────→ US-105 (documentos master) ←──────┘
  │                                            │
  ├─→ US-111 (atualizar script)                ├─→ US-106 (INDEX por módulo)
  │                                            ├─→ US-107 (skills)
  ├─→ US-108 (validar links)                   └─→ US-109 (tendências)
  │                                                       │
  └───────────────────────────────────────────────→ US-110 (INDEX global)
```

### Fases paralelas possíveis:
- **US-101 + US-104 + US-108 + US-111** podem rodar em paralelo
- **US-102** depende de US-101
- **US-103** depende de US-102 + US-111
- **US-105** depende de US-103 + US-104
- **US-106, US-107, US-109** dependem de US-105
- **US-110** depende de todas as anteriores

---

## Estimativa de Custo Total

| Item | Custo |
|------|:-----:|
| ffmpeg (conversão + áudio) | $0.00 |
| Whisper API (~150 min) | ~$0.90 |
| PDFs/materiais (local) | $0.00 |
| Claude Code (geração de masters/skills) | Incluído na sessão |
| **Total** | **~$0.90** |

---

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|:------------:|:-------:|-----------|
| Áudio > 25MB (limite Whisper) | Média | Baixo | Split automático no script |
| OPENAI_API_KEY expirada | Baixa | Alto | Verificar antes de rodar |
| PDF com imagens sem texto | Média | Médio | Processar manualmente / OCR |
| .docx com formatação complexa | Baixa | Baixo | mammoth fallback |
| Rename MODELO→MODULO quebra refs | Baixa | Baixo | Não há refs externas |

---

## Definition of Done (Global)

- [ ] 5 módulos com naming consistente (`MODULO1/` a `MODULO5/`)
- [ ] 14 aulas transcritas com timestamps (`.md` + `.json`)
- [ ] 8 PDFs/materiais extraídos para Markdown (nenhum vazio)
- [ ] 14 documentos master por aula
- [ ] 5 INDEX.md por módulo com mapa Mermaid
- [ ] 8 skills para Claude Code (4 existentes + 4 novas)
- [ ] Links validados por módulo
- [ ] Tendências 2026/2027 por módulo
- [ ] INDEX.md global atualizado com 5 módulos
- [ ] Script parametrizado para qualquer módulo
