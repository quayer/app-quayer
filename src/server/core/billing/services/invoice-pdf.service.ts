/**
 * Invoice PDF Generation Service
 *
 * Generates professional invoice PDFs using PDFKit.
 * All monetary values are in CENTAVOS (Int). 14900 = R$ 149,00
 *
 * NOTE: Requires `pdfkit` package. Install if not present:
 *   npm install pdfkit @types/pdfkit
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface InvoicePdfData {
  invoiceNumber: number;
  issuedAt: Date;
  dueDate: Date;
  orgName: string;
  orgDocument: string; // CPF or CNPJ
  planName: string;
  description: string;
  periodStart?: Date;
  periodEnd?: Date;
  totalCents: number;
  status: string; // e.g. "PAID", "PENDING"
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

function formatDocument(doc: string): string {
  const cleaned = doc.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (cleaned.length === 14) {
    return cleaned.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5'
    );
  }
  return doc;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Rascunho',
    PENDING: 'Pendente',
    PROCESSING: 'Processando',
    PAID: 'Pago',
    OVERDUE: 'Vencida',
    CANCELED: 'Cancelada',
    REFUNDED: 'Estornada',
  };
  return labels[status] ?? status;
}

// ── Service ────────────────────────────────────────────────────────────────

class InvoicePdfService {
  /**
   * Generates a clean, professional invoice PDF.
   * Returns a Buffer containing the PDF bytes.
   */
  async generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
    let PDFDocument: typeof import('pdfkit');
    try {
      PDFDocument = (await import('pdfkit')).default;
    } catch {
      throw new Error(
        '[InvoicePdf] PDFKit not found. Install it: npm install pdfkit @types/pdfkit'
      );
    }

    return new Promise<Buffer>((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
          info: {
            Title: `Fatura #${data.invoiceNumber}`,
            Author: 'Quayer',
            Subject: `Fatura de servico - ${data.orgName}`,
          },
        });

        const chunks: Uint8Array[] = [];
        doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const pageWidth = doc.page.width - 100; // 50px margin each side

        // ── Header ───────────────────────────────────────────────────────

        doc
          .fontSize(28)
          .font('Helvetica-Bold')
          .fillColor('#1a1a2e')
          .text('QUAYER', 50, 50);

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#666666')
          .text('Plataforma de Comunicacao Empresarial', 50, 82);

        // Invoice title - right aligned
        doc
          .fontSize(22)
          .font('Helvetica-Bold')
          .fillColor('#1a1a2e')
          .text('FATURA', 350, 50, { width: pageWidth - 300, align: 'right' });

        // Invoice number and status
        const statusText = statusLabel(data.status);
        const statusColor = data.status === 'PAID' ? '#27ae60' : data.status === 'OVERDUE' ? '#e74c3c' : '#f39c12';

        doc
          .fontSize(12)
          .font('Helvetica')
          .fillColor('#666666')
          .text(`#${String(data.invoiceNumber).padStart(6, '0')}`, 350, 78, {
            width: pageWidth - 300,
            align: 'right',
          });

        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor(statusColor)
          .text(statusText.toUpperCase(), 350, 95, {
            width: pageWidth - 300,
            align: 'right',
          });

        // Divider
        doc
          .moveTo(50, 120)
          .lineTo(50 + pageWidth, 120)
          .strokeColor('#e0e0e0')
          .lineWidth(1)
          .stroke();

        // ── Invoice details ──────────────────────────────────────────────

        const detailsY = 140;

        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor('#999999')
          .text('DATA DE EMISSAO', 50, detailsY);

        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#333333')
          .text(formatDate(data.issuedAt), 50, detailsY + 14);

        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor('#999999')
          .text('DATA DE VENCIMENTO', 200, detailsY);

        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#333333')
          .text(formatDate(data.dueDate), 200, detailsY + 14);

        // ── From / To ────────────────────────────────────────────────────

        const fromToY = 195;

        // From
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor('#999999')
          .text('DE', 50, fromToY);

        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#333333')
          .text('Quayer Tecnologia Ltda', 50, fromToY + 14);

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#666666')
          .text('contato@quayer.com', 50, fromToY + 30);

        // To
        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor('#999999')
          .text('PARA', 300, fromToY);

        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .fillColor('#333333')
          .text(data.orgName, 300, fromToY + 14);

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#666666')
          .text(formatDocument(data.orgDocument), 300, fromToY + 30);

        // ── Line items table ─────────────────────────────────────────────

        const tableY = 275;

        // Table header background
        doc.rect(50, tableY, pageWidth, 28).fill('#f8f9fa');

        doc
          .fontSize(9)
          .font('Helvetica-Bold')
          .fillColor('#666666')
          .text('DESCRICAO', 60, tableY + 8, { width: 300 })
          .text('PERIODO', 360, tableY + 8, { width: 100 })
          .text('VALOR', 460, tableY + 8, { width: pageWidth - 410, align: 'right' });

        // Table row
        const rowY = tableY + 36;

        const periodText =
          data.periodStart && data.periodEnd
            ? `${formatDate(data.periodStart)} - ${formatDate(data.periodEnd)}`
            : '-';

        doc
          .fontSize(10)
          .font('Helvetica-Bold')
          .fillColor('#333333')
          .text(data.planName, 60, rowY, { width: 290 });

        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#666666')
          .text(data.description, 60, rowY + 16, { width: 290 });

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#333333')
          .text(periodText, 360, rowY + 4, { width: 100 });

        doc
          .fontSize(11)
          .font('Helvetica')
          .fillColor('#333333')
          .text(formatCurrency(data.totalCents), 460, rowY + 4, {
            width: pageWidth - 410,
            align: 'right',
          });

        // Divider below items
        const dividerY = rowY + 50;
        doc
          .moveTo(50, dividerY)
          .lineTo(50 + pageWidth, dividerY)
          .strokeColor('#e0e0e0')
          .lineWidth(1)
          .stroke();

        // ── Total ────────────────────────────────────────────────────────

        const totalY = dividerY + 16;

        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#333333')
          .text('TOTAL', 360, totalY);

        doc
          .fontSize(16)
          .font('Helvetica-Bold')
          .fillColor('#1a1a2e')
          .text(formatCurrency(data.totalCents), 430, totalY - 2, {
            width: pageWidth - 380,
            align: 'right',
          });

        // ── Footer ───────────────────────────────────────────────────────

        const footerY = 700;

        doc
          .moveTo(50, footerY)
          .lineTo(50 + pageWidth, footerY)
          .strokeColor('#e0e0e0')
          .lineWidth(0.5)
          .stroke();

        doc
          .fontSize(10)
          .font('Helvetica')
          .fillColor('#999999')
          .text('Obrigado pela confianca!', 50, footerY + 12, {
            width: pageWidth,
            align: 'center',
          });

        doc
          .fontSize(8)
          .fillColor('#bbbbbb')
          .text(
            'Este documento foi gerado automaticamente pela plataforma Quayer.',
            50,
            footerY + 30,
            { width: pageWidth, align: 'center' }
          );

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }
}

export const invoicePdfService = new InvoicePdfService();
