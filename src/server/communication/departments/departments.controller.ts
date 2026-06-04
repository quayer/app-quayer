/**
 * Departments — Controller (composer)
 *
 * Compõe os route files do módulo departments (CRUD de Department + gestão da
 * roleta de membros). Toda a lógica vive nos handlers de `departments.routes.ts`.
 *
 * Suporte de dados para a tool `dispatch_to_agent` (distribuição round-robin de
 * conversas para atendentes humanos por departamento).
 *
 * Registro no router: ver instruções no fim de departments.routes.ts /
 * no retorno desta tarefa. NÃO editar igniter.router.ts aqui.
 */

import { igniter } from '@/igniter'
import { departmentsRoutes } from './departments.routes'

export const departmentsController = igniter.controller({
  name: 'departments',
  path: '/departments',
  description:
    'Departamentos e membros da roleta (round-robin) — multi-tenant, org-isolated',
  actions: {
    ...departmentsRoutes,
  },
})
