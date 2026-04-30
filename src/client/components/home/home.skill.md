# Skill: home

Dashboard principal do Quayer — ponto de entrada após login.

## Propósito

- Exibir projetos recentes do workspace
- CTA de criar novo agente (navega para `/`)
- Input de prompt rápido para iniciar novo projeto Builder

## Inventário de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `home-page.tsx` | Componente principal: lista projetos recentes + prompt de criação |

## Props

```typescript
interface HomePageProps {
  recentProjects: Array<{
    id: string
    name: string
    status: string
    type: string
    updatedAt: string
  }>
}
```

## Fluxo de dados

```
src/app/page.tsx (Server Component)
    │  api.builder.projects.list.query()
    ▼
HomePage (Client Component)
    ├── Input#builder-home-input  ← ⌘K foca aqui (de qualquer página)
    └── ProjetosList (projetos recentes, max 6)
```

## ID especial

O `<textarea id="builder-home-input">` é referenciado pelo atalho global ⌘K no `AppShellClient`.
Nunca renomear esse ID sem atualizar `app-shell-client.tsx`.

## Ao estender

- Novo widget no dashboard: adicionar diretamente em `home-page.tsx` (componente é pequeno)
- Se ultrapassar ~150 linhas, extrair para `home/components/` e compor
- Mudança no prompt: editar o textarea + handler `onSubmit` que chama `api.builder.projects.create`
