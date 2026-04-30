import { getSource } from '@/lib/fumadocs/source'
import { createAPIPage } from 'fumadocs-openapi/ui'
import { createOpenAPI } from 'fumadocs-openapi/server'
import { DocsPage, DocsBody, DocsTitle, DocsDescription } from 'fumadocs-ui/page'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { Document } from 'fumadocs-openapi'
import openapiDoc from '@/docs/openapi.json'

const openapi = createOpenAPI({ input: () => ({ quayer: openapiDoc as unknown as Document }) })
const APIPage = createAPIPage(openapi)

interface OpenAPIPageData {
  title: string
  description?: string
  toc: { title: string; url: string; depth: number }[]
  getAPIPageProps: () => Parameters<typeof APIPage>[0]
}

interface Props {
  params: Promise<{ slug?: string[] }>
}

function DocsHomePage() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-8 max-w-2xl">
      <h1 className="text-4xl font-bold">Quayer API Docs</h1>
      <p className="text-lg text-fd-muted-foreground">
        Documentação completa da API — 150+ endpoints para integração com a
        plataforma multi-tenant de WhatsApp.
      </p>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <Link
          href="/docs/quayer/core/auth/me"
          className="rounded-lg border p-4 hover:bg-fd-accent transition-colors"
        >
          <h3 className="font-semibold mb-1">Autenticação</h3>
          <p className="text-sm text-fd-muted-foreground">
            OTP, Magic Link, TOTP, Passkeys, Google OAuth
          </p>
        </Link>

        <Link
          href="/docs/quayer/communication/instances"
          className="rounded-lg border p-4 hover:bg-fd-accent transition-colors"
        >
          <h3 className="font-semibold mb-1">Instâncias WhatsApp</h3>
          <p className="text-sm text-fd-muted-foreground">
            Criar, conectar e gerenciar números WhatsApp
          </p>
        </Link>

        <Link
          href="/docs/quayer/crm/contacts"
          className="rounded-lg border p-4 hover:bg-fd-accent transition-colors"
        >
          <h3 className="font-semibold mb-1">CRM — Contatos</h3>
          <p className="text-sm text-fd-muted-foreground">
            Listar, atualizar e gerenciar contatos
          </p>
        </Link>

        <Link
          href="/docs/quayer/features/webhooks"
          className="rounded-lg border p-4 hover:bg-fd-accent transition-colors"
        >
          <h3 className="font-semibold mb-1">Webhooks</h3>
          <p className="text-sm text-fd-muted-foreground">
            Eventos em tempo real para suas integrações
          </p>
        </Link>
      </div>
    </main>
  )
}

export default async function Page({ params }: Props) {
  const { slug } = await params

  if (!slug || slug.length === 0) {
    return <DocsHomePage />
  }

  const source = await getSource()
  const page = source.getPage(slug) as ({ data: OpenAPIPageData } & NonNullable<ReturnType<typeof source.getPage>>) | undefined

  if (!page) notFound()

  const apiProps = page.data.getAPIPageProps()

  return (
    <DocsPage toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <APIPage {...apiProps} />
      </DocsBody>
    </DocsPage>
  )
}

export async function generateStaticParams() {
  const source = await getSource()
  return source.getPages().map((page) => ({ slug: page.slugs }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!slug || slug.length === 0) {
    return { title: 'Quayer API Docs', description: 'Documentação completa da API Quayer' }
  }
  const source = await getSource()
  const page = source.getPage(slug)
  if (!page) return {}
  return {
    title: `${page.data.title} — Quayer API`,
    description: page.data.description,
  }
}
