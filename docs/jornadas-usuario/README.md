# Jornadas de Usuário - Quayer Platform

## Estrutura de Documentação

```
jornadas-usuario/
├── README.md                          # Este arquivo
├── 01-admin/                          # Jornadas do Administrador do Sistema
│   ├── jornada-admin-completa.md      # Mapeamento completo
│   └── oportunidades-melhoria.md      # Melhorias identificadas
├── 02-master/                         # Jornadas do Master da Organização
│   ├── jornada-master-completa.md
│   └── oportunidades-melhoria.md
├── 03-manager/                        # Jornadas do Gerente
│   ├── jornada-manager-completa.md
│   └── oportunidades-melhoria.md
└── 04-user/                           # Jornadas do Usuário Comum
    ├── jornada-user-completa.md
    └── oportunidades-melhoria.md
```

## Perfis de Usuário

| Perfil | Role Sistema | Role Org | Acesso |
|--------|--------------|----------|--------|
| **Admin** | `admin` | N/A | Painel administrativo global + todas funcionalidades |
| **Master** | `user` | `master` | Dono da organização, acesso total à org |
| **Manager** | `user` | `manager` | Gerente, gerencia equipe e configurações |
| **User** | `user` | `user` | Atendente, acesso básico a conversas e contatos |

## Convenções

### Status das Jornadas
- ✅ Funcional
- ⚠️ Parcial / Com problemas
- ❌ Não implementado
- 🔄 Em desenvolvimento

### Prioridade de Melhorias
- 🔴 Crítico
- 🟠 Alto
- 🟡 Médio
- 🟢 Baixo
