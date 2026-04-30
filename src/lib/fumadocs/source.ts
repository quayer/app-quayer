import { cache } from 'react'
import { createOpenAPI, openapiSource } from 'fumadocs-openapi/server'
import { loader } from 'fumadocs-core/source'
import type { Document } from 'fumadocs-openapi'
import openapiDoc from '@/docs/openapi.json'

const openapi = createOpenAPI({
  input: () => ({ quayer: openapiDoc as unknown as Document }),
})

export const getSource = cache(async () => {
  const virtualSource = await openapiSource(openapi)
  return loader({ source: virtualSource, baseUrl: '/docs' })
})
