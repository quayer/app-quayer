/**
 * oRPC SPIKE — base builder + contexto inicial
 *
 * Equivalente ao "contexto" do Igniter.js: aqui o contexto inicial é injetado
 * pelo catch-all do Next (route handler) via `handler.handle(request, { context })`.
 *
 * No Igniter, o context é criado em src/igniter.context.ts e as procedures
 * estendem-no retornando objetos. No oRPC, middlewares estendem o contexto
 * via `next({ context: {...} })` — mesma semântica, sintaxe diferente.
 */
import { os } from '@orpc/server'

export type SpikeInitialContext = {
  /** Headers da request HTTP — necessário para o middleware de auth (Bearer/cookie). */
  headers: Headers
}

/** Builder base com o contexto inicial tipado (equivale ao `igniter` builder). */
export const base = os.$context<SpikeInitialContext>()
