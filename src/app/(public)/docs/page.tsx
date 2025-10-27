/**
 * API Documentation Page
 *
 * Interface visual para explorar a API usando Scalar
 * https://github.com/scalar/scalar
 */

export default function DocsPage() {
  return (
    <html lang="pt-BR">
      <head>
        <title>Quayer API - Documentação</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        {/* Scalar API Reference */}
        <script
          id="api-reference"
          data-url="/api/docs"
          dangerouslySetInnerHTML={{
            __html: ``,
          }}
        />
        <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
      </body>
    </html>
  )
}
