import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

export type InvoiceInput = {
  invoiceNumber: string;
  customerName: string;
  customerEmail: string;
  plan: 'pro' | 'max';
  amountPaise: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  paidAt: Date;
};

const STORAGE_DIR = path.resolve(__dirname, '../../../storage/invoices');

function ensureStorageDir() {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

function formatInr(amountPaise: number): string {
  return `₹${(amountPaise / 100).toFixed(2)}`;
}

function planLabel(plan: 'pro' | 'max'): string {
  return plan === 'pro' ? 'Pro Plan' : 'Max Plan';
}

export function invoiceFilePath(invoiceNumber: string): string {
  return path.join(STORAGE_DIR, `${invoiceNumber}.pdf`);
}

export async function generateInvoicePdf(
  input: InvoiceInput
): Promise<{ absolutePath: string; relativePath: string }> {
  ensureStorageDir();
  const absolutePath = invoiceFilePath(input.invoiceNumber);
  const relativePath = path.join('storage', 'invoices', `${input.invoiceNumber}.pdf`);

  if (fs.existsSync(absolutePath)) {
    return { absolutePath, relativePath };
  }

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(absolutePath);
    doc.pipe(stream);

    // Watermark behind content
    doc.save();
    doc.opacity(0.08);
    doc.font('Helvetica-Bold').fontSize(72);
    doc.rotate(-32, { origin: [300, 400] });
    doc.fillColor('#0f172a');
    doc.text('COSMO', 80, 360, { align: 'center', width: 440 });
    doc.restore();

    doc.opacity(1);
    doc.fillColor('#0f172a');
    doc.font('Helvetica-Bold').fontSize(22).text('Cosmo', 50, 50);
    doc.font('Helvetica').fontSize(10).fillColor('#64748b');
    doc.text('Invoice', 50, 78);

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(16);
    doc.text(input.invoiceNumber, 350, 50, { align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor('#64748b');
    doc.text(`Date: ${input.paidAt.toLocaleDateString('en-IN')}`, 350, 72, {
      align: 'right',
    });
    doc.text('Status: PAID', 350, 88, { align: 'right' });

    doc.moveDown(3);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text('Bill to');
    doc.font('Helvetica').fontSize(11);
    doc.text(input.customerName);
    doc.fillColor('#64748b').text(input.customerEmail);

    doc.moveDown(1.5);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12).text('Details');
    doc.moveDown(0.4);

    const tableTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Item', 50, tableTop);
    doc.text('Period', 220, tableTop);
    doc.text('Amount', 450, tableTop, { align: 'right' });

    doc
      .moveTo(50, tableTop + 16)
      .lineTo(545, tableTop + 16)
      .strokeColor('#e2e8f0')
      .stroke();

    const rowY = tableTop + 28;
    const period = `${input.periodStart.toLocaleDateString('en-IN')} – ${input.periodEnd.toLocaleDateString('en-IN')}`;
    doc.font('Helvetica').fontSize(10).fillColor('#0f172a');
    doc.text(`${planLabel(input.plan)} (1 month)`, 50, rowY, { width: 160 });
    doc.text(period, 220, rowY, { width: 200 });
    doc.text(formatInr(input.amountPaise), 450, rowY, { align: 'right' });

    doc
      .moveTo(50, rowY + 28)
      .lineTo(545, rowY + 28)
      .strokeColor('#e2e8f0')
      .stroke();

    doc.font('Helvetica-Bold').fontSize(12);
    doc.text('Total', 350, rowY + 40);
    doc.text(formatInr(input.amountPaise), 450, rowY + 40, { align: 'right' });

    doc.moveDown(4);
    doc.font('Helvetica').fontSize(9).fillColor('#64748b');
    doc.text(`Razorpay Order: ${input.razorpayOrderId}`);
    doc.text(`Razorpay Payment: ${input.razorpayPaymentId}`);
    doc.text(`Currency: ${input.currency}`);

    // Secondary watermark near footer
    doc.save();
    doc.opacity(0.06);
    doc.font('Helvetica-Bold').fontSize(48);
    doc.rotate(-20, { origin: [300, 700] });
    doc.fillColor('#0f172a');
    doc.text('PAID', 180, 680, { width: 300, align: 'center' });
    doc.restore();

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return { absolutePath, relativePath };
}
