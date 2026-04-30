/**
 * Invoices Controller - List and view invoices for the user's organization
 *
 * All routes require authentication. Operations are scoped to the user's current organization.
 */

import { igniter } from '@/igniter';
import { billingRepository } from '../billing.repository';
import { listInvoicesSchema, invoiceIdParamSchema } from '../billing.schemas';
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure';
import { invoicePdfService } from '../services/invoice-pdf.service';
import { getDatabase } from '@/server/services/database';

export const invoicesController = igniter.controller({
  name: 'invoices',
  path: '/invoices',
  actions: {
    // LIST invoices for user's org (paginated)
    list: igniter.query({
      path: '/',
      method: 'GET',
      query: listInvoicesSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const orgId = user.currentOrgId;
        if (!orgId) {
          return response.badRequest('Usuário não possui organização ativa');
        }

        const result = await billingRepository.findInvoicesByOrg(orgId, request.query);
        return response.success(result);
      },
    }),

    // GET single invoice by ID
    getById: igniter.query({
      path: '/:id' as const,
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const orgId = user.currentOrgId;
        if (!orgId) {
          return response.badRequest('Usuário não possui organização ativa');
        }

        const { id } = request.params as { id: string };

        const invoice = await billingRepository.findInvoiceById(id, orgId);
        if (!invoice) {
          return response.notFound('Fatura não encontrada');
        }

        return response.success({ invoice });
      },
    }),

    // DOWNLOAD invoice PDF URL
    download: igniter.query({
      path: '/:id/download' as const,
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;

        if (!user) {
          return response.unauthorized('Autenticação necessária');
        }

        const orgId = user.currentOrgId;
        if (!orgId) {
          return response.badRequest('Usuário não possui organização ativa');
        }

        const { id } = request.params as { id: string };

        const invoice = await billingRepository.findInvoiceById(id, orgId);
        if (!invoice) {
          return response.notFound('Fatura não encontrada');
        }

        if (!invoice.pdfUrl) {
          // Generate PDF on-demand if not yet available
          try {
            const db = getDatabase();
            const fullInvoice = await db.invoice.findFirst({
              where: { id, organizationId: orgId },
              include: {
                subscription: {
                  include: { organization: true, plan: true },
                },
              },
            });

            if (!fullInvoice?.subscription) {
              return response.badRequest(
                'Não foi possível gerar o PDF: dados da assinatura não encontrados. Tente novamente mais tarde.'
              );
            }

            const org = fullInvoice.subscription.organization;
            const plan = fullInvoice.subscription.plan;

            const pdfBuffer = await invoicePdfService.generateInvoicePdf({
              invoiceNumber: fullInvoice.number,
              issuedAt: fullInvoice.issuedAt,
              dueDate: fullInvoice.dueDate,
              orgName: org.name,
              orgDocument: org.document ?? '',
              planName: plan.name,
              description: fullInvoice.description,
              totalCents: fullInvoice.totalCents,
              status: fullInvoice.status,
            });

            // Return PDF as base64 for immediate download
            const pdfBase64 = pdfBuffer.toString('base64');
            return response.success({
              pdfBase64,
              filename: `fatura-${fullInvoice.number}.pdf`,
              contentType: 'application/pdf',
            });
          } catch (pdfError) {
            console.error('[Invoices] Error generating PDF on-demand:', pdfError);
            return response.badRequest(
              'Não foi possível gerar o PDF da fatura. Tente novamente mais tarde.'
            );
          }
        }

        return response.success({ pdfUrl: invoice.pdfUrl });
      },
    }),
  },
});
