# Skill: Design System & Frontend Aesthetics

## Quando carregar esta skill
Ao criar componentes UI, layouts, páginas, landing pages, dashboards, ou qualquer trabalho visual/frontend.

---

## Fonte
Baseado no cookbook oficial da Anthropic: [Prompting for Frontend Aesthetics](https://platform.claude.com/cookbook/prompting-for-frontend-aesthetics)

---

## Stack de Design do Quayer

```
Tailwind CSS v4          → Utility-first + @theme inline
shadcn/ui (New York)     → Componentes base (Zinc)
Radix UI                 → 25+ primitivos acessíveis
Framer Motion            → Animações React
Recharts                 → Gráficos
Lucide React             → Ícones
OKLch color space        → Light/dark modes
WCAG 2.1 AA              → Acessibilidade obrigatória
```

---

## Design Tokens — Referência Rápida

| Token | Arquivo | Uso |
|---|---|---|
| Cores | `src/styles/tokens/colors.css` | WhatsApp green (#25d366), zinc base, accents |
| Tipografia | `src/styles/tokens/typography.css` | Inter (sans), Fira Code (mono) |
| Espaçamento | `src/styles/tokens/spacing.css` | Escala 4px base |
| Animações | `src/styles/tokens/animations.css` | Durations, easings, transitions |
| Temas | `src/styles/themes/` | 5+ temas prontos |
| Global | `src/app/globals.css` | CSS variables OKLch, a11y utilities |

---

## Regra Anti-AI-Slop (do Cookbook Anthropic)

<frontend_aesthetics>
Claude tende a convergir para outputs genéricos. Em frontend, isso cria o "AI slop" aesthetic. Evite isso. Crie frontends distintivos que surpreendam.

### Tipografia
- **Quayer usa Inter** como padrão do app — respeitar em componentes internos
- Para **landing pages, marketing, onboarding**: usar fonts distintivas
- Sugestões display: Clash Display, Satoshi, Cabinet Grotesk, Bricolage Grotesque
- Sugestões editorial: Playfair Display, Crimson Pro, Fraunces
- **Nunca** para marketing: Arial, Roboto, system fonts genéricas
- Princípio: contraste alto nos pairings (display + mono, serif + sans)
- Usar extremos de peso: 200 vs 800, não 400 vs 600
- Jumps de tamanho: 3x+, não 1.5x

### Cor & Tema
- **Paleta Quayer**: zinc/slate base + WhatsApp green (#25d366) como accent dominante
- Usar CSS variables do design system (`--whatsapp-green`, `--accent-*`, `--bg-*`)
- Cor dominante + acento afiado > paleta tímida e distribuída igualmente
- Evitar: gradientes roxos em fundo branco (clichê AI)
- Commitar em UMA estética coesa por página/componente

### Motion & Animações
- Usar tokens do sistema: `--duration-*`, `--ease-*`, `--transition-*`
- Framer Motion para componentes React complexos
- CSS puro para transições simples
- Foco em **momentos de alto impacto**: page load com staggered reveals (`animation-delay`)
- Uma animação de entrada bem orquestrada > micro-interações espalhadas
- Princípio: motion deve comunicar hierarquia e estado, não decorar

### Backgrounds & Profundidade
- Criar atmosfera com layers — nunca só cor sólida em áreas grandes
- Gradientes CSS sutis, padrões geométricos, ou efeitos contextuais
- Usar `--bg-primary` (#0a0a0a) como base, layering com `--bg-secondary`/`--bg-tertiary`
- Sombras e overlays: usar tokens `--shadow-*`

### Evitar (defaults genéricos)
- Font families overused (Roboto, Arial, system fonts) em marketing
- Esquemas de cor clichê (roxo + branco)
- Layouts previsíveis e patterns cookie-cutter
- Design sem caráter específico do contexto
- Space Grotesk (overused pelo Claude entre gerações)
</frontend_aesthetics>

---

## Componentes UI — Onde Ficam

```
src/client/components/
├── ui/                  → 50+ componentes shadcn/Radix (NÃO editar diretamente)
├── custom/              → Componentes customizados (empty-state, status-badge)
├── auth/                → Forms de autenticação
├── chat/                → Interface de chat WhatsApp
├── admin-settings/      → Painel admin
├── editor/              → Rich text (Tiptap)
├── layout/              → Sidebar, header, page layouts
├── charts/              → Variações de gráficos
├── skeletons/           → Loading states
├── accessibility/       → Componentes a11y
└── providers/           → Context providers
```

---

## Padrões Obrigatórios

### Ao criar componentes
1. Usar `class-variance-authority` (cva) para variantes
2. Usar `cn()` de `@/lib/utils` para merge de classes
3. Usar `forwardRef` quando o componente aceita ref
4. Exportar tipo das props
5. Respeitar dark mode via CSS variables OKLch

### Ao criar páginas/layouts
1. Responsivo mobile-first (Tailwind breakpoints)
2. Loading states com skeletons (não spinners genéricos)
3. Empty states com ilustração e CTA
4. Error boundaries com fallback visual
5. Focus indicators visíveis (a11y)

### Ao criar animações
```tsx
// Framer Motion — staggered reveal pattern
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 }
}

<motion.div variants={container} initial="hidden" animate="show">
  {items.map(i => <motion.div key={i} variants={item} />)}
</motion.div>
```

### Ao usar cores
```tsx
// Usar classes Tailwind que mapeiam para CSS variables
// OK:
<div className="bg-background text-foreground border-border" />
<div className="bg-primary text-primary-foreground" />

// Para accent WhatsApp:
<div className="bg-emerald-500 text-white" /> // ~#25d366

// NUNCA hardcode hex:
<div className="bg-[#25d366]" /> // Evitar — usar tokens
```

---

## Checklist de Qualidade Visual

Antes de finalizar qualquer componente/página:

- [ ] Hierarquia visual clara (tamanho, peso, cor)
- [ ] Espaçamento consistente (usar escala 4px)
- [ ] Contraste WCAG AA (4.5:1 texto, 3:1 UI)
- [ ] Dark mode funcional
- [ ] Estados: hover, focus, active, disabled, loading, empty, error
- [ ] Responsivo: mobile → tablet → desktop
- [ ] Animações com `prefers-reduced-motion` respeitado
- [ ] Sem text overflow ou truncation inesperado
- [ ] Ícones Lucide consistentes (não misturar icon libs)
