/**
 * Envelope de wire do Igniter — paridade byte a byte durante a migração.
 *
 * O Igniter serializa TODO retorno de handler dentro de `this._response`:
 *   response.success(x) / response.json(x)  ->  { data: x, error: null }
 *   response.notFound(msg) etc.             ->  { data: null, error: { message, code } }
 * (fonte: @igniter-js/core dist, IgniterResponseProcessor.toResponse)
 *
 * Os handlers oRPC portados devolvem `ok(x)` para reproduzir o envelope de
 * sucesso exato — consumidores de /api/v1 (fetch cru do frontend, clients
 * externos via API key) continuam vendo o mesmo body. Quando a migração dos
 * call-sites para o client oRPC terminar, o envelope pode ser removido numa
 * passada única (decisão registrada para a SPEC-CORE).
 *
 * DELTA CONHECIDO (aceito no gate): corpos de ERRO lançados via ORPCError
 * têm shape do oRPC, não o do Igniter — os status HTTP são preservados e os
 * consumidores auditados até aqui só leem o status em erros.
 */

/** Envelope de sucesso do Igniter: `{ data, error: null }`. */
export function ok<T>(data: T): { data: T; error: null } {
  return { data, error: null }
}
