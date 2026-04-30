# Skill: ui (shadcn/ui primitivos)

Biblioteca de componentes base — shadcn/ui sobre Radix UI + Tailwind.
São primitivos sem opinião de negócio. Nunca contêm lógica de produto.

## Regra de ouro

- Não modificar esses arquivos para adicionar comportamento de produto
- Customizações de aparência: via `className` prop (Tailwind)
- Customizações de comportamento: criar wrapper na pasta do feature

## Categorias

### Inputs e formulários
`button` · `input` · `label` · `textarea` · `checkbox` · `radio-group` · `select`
`switch` · `slider` · `input-otp` · `phone-input` · `password-input` · `form`

### Overlays e modais
`dialog` · `alert-dialog` · `sheet` · `drawer` · `popover` · `hover-card`
`dropdown-menu` · `context-menu` · `tooltip` · `accessible-dialog`

### Navegação
`tabs` · `navigation-menu` · `breadcrumb` · `pagination` · `command`
`accordion` · `collapsible`

### Layout e display
`card` · `badge` · `separator` · `table` · `scroll-area` · `resizable`
`progress` · `skeleton` · `avatar` · `lazy-avatar`

### Feedback
`sonner` (toast) · `alert`

### Misc
`calendar` · `carousel` · `toggle` · `toggle-group`
`page-header` · `error-display` · `bulk-action-bar` · `filter-bar`
`activity-timeline` · `stars-background` · `theme-switcher` · `google-icon`

### Charts (`ui/charts/`)
`chart` (base) · `area-chart` · `bar-chart` · `line-chart`
Wrapper sobre Recharts. Exportados via `ui/charts/index.tsx`.

## Como adicionar novo componente shadcn

```bash
# Via MCP Shadcn (disponível no Antigravity)
# ou manualmente:
npx shadcn@latest add <component-name>
```

O arquivo vai para esta pasta automaticamente.

## form.tsx — padrão React Hook Form

```tsx
import { useForm } from "react-hook-form"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/client/components/ui/form"

const form = useForm<Schema>({ resolver: zodResolver(schema) })

<Form {...form}>
  <FormField control={form.control} name="email" render={({ field }) => (
    <FormItem>
      <FormLabel>Email</FormLabel>
      <FormControl><Input {...field} /></FormControl>
      <FormMessage />
    </FormItem>
  )} />
</Form>
```

## page-header — props

```typescript
interface PageHeaderProps {
  title: string
  description?: string
  icon?: LucideIcon
  actions?: ReactNode   // botões no canto direito
}
```

## Ao estender

- Novo primitivo externo: `npx shadcn@latest add X` — não criar manualmente
- Customização pontual: `className` prop, não editar o arquivo base
- Comportamento de produto: criar wrapper em `custom/` ou na pasta da feature
