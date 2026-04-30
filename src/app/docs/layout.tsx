import 'fumadocs-ui/style.css'
import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import { RootProvider } from 'fumadocs-ui/provider/next'
import type { ReactNode } from 'react'
import { getSource } from '@/lib/fumadocs/source'

export default async function DocsRootLayout({ children }: { children: ReactNode }) {
  const source = await getSource()

  return (
    <RootProvider>
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: 'Quayer API',
          transparentMode: 'top',
        }}
        sidebar={{ collapsible: true }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  )
}
