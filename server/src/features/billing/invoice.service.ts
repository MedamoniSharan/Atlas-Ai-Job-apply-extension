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

/** Same mark path as client CosmosLogo (viewBox 0 0 24 24). */
const COSMO_MARK_PATH =
  'M12 8.145c1.715 0 3.107-1.375 3.107-3.072S13.717 2 12 2 8.893 3.375 8.893 5.072 10.283 8.145 12 8.145M12 22c1.715 0 3.107-1.375 3.107-3.072s-1.39-3.073-3.107-3.073-3.107 1.376-3.107 3.073S10.283 22 12 22M6.004 11.646c1.716 0 3.107-1.375 3.107-3.072S7.721 5.5 6.004 5.5 2.897 6.877 2.897 8.575s1.39 3.072 3.107 3.072M17.996 18.492c1.715 0 3.107-1.375 3.107-3.072s-1.39-3.073-3.107-3.073-3.107 1.376-3.107 3.073 1.39 3.072 3.107 3.072M17.996 11.646c1.715 0 3.107-1.374 3.107-3.072s-1.39-3.072-3.107-3.072-3.107 1.374-3.107 3.072 1.39 3.072 3.107 3.072M6.004 18.492c1.716 0 3.107-1.375 3.107-3.073s-1.39-3.072-3.107-3.072-3.107 1.378-3.107 3.074 1.39 3.072 3.107 3.072z';

/** Cosmo brand colors (match dashboard) */
const INK = '#121212';
const MUTED = '#777169';
const BRAND = '#15362b';
const LINE = '#e5e5e5';
const SOFT = '#f4f4f2';
const WHITE = '#ffffff';

function ensureStorageDir() {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

function drawCosmoMark(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  size: number,
  color: string
) {
  const scale = size / 24;
  doc.save();
  doc.translate(x, y);
  doc.scale(scale);
  doc.path(COSMO_MARK_PATH).fill(color);
  doc.restore();
}

function formatInr(amountPaise: number): string {
  return `₹${(amountPaise / 100).toFixed(2)}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function planLabel(plan: 'pro' | 'max'): string {
  return plan === 'pro' ? 'Premium Plan' : 'UltraMag Plan';
}

export function invoiceFilePath(invoiceNumber: string): string {
  return path.join(STORAGE_DIR, `${invoiceNumber}.pdf`);
}

/**
 * Cosmo tax invoice template (PDFKit).
 * Layout: brand header → bill-to + meta → line items → totals → payment refs → footer.
 * Diagonal "COSMO" + "PAID" watermarks sit behind the content.
 */
export async function generateInvoicePdf(
  input: InvoiceInput
): Promise<{ absolutePath: string; relativePath: string }> {
  ensureStorageDir();
  const absolutePath = invoiceFilePath(input.invoiceNumber);
  const relativePath = path.join(
    'storage',
    'invoices',
    `${input.invoiceNumber}.pdf`
  );

  if (fs.existsSync(absolutePath)) {
    return { absolutePath, relativePath };
  }

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      info: {
        Title: `Invoice ${input.invoiceNumber}`,
        Author: 'cosmovai',
        Subject: `${planLabel(input.plan)} subscription`,
      },
    });
    const stream = fs.createWriteStream(absolutePath);
    doc.pipe(stream);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const left = 48;
    const right = pageW - 48;
    const contentW = right - left;

    // —— Watermarks (behind everything) ——
    doc.save();
    doc.fillColor(BRAND);
    doc.opacity(0.05);
    doc.font('Helvetica-Bold').fontSize(96);
    doc.rotate(-28, { origin: [pageW / 2, pageH / 2] });
    doc.text('COSMO', 0, pageH / 2 - 40, {
      width: pageW,
      align: 'center',
    });
    doc.restore();

    doc.save();
    doc.fillColor(BRAND);
    doc.opacity(0.06);
    doc.font('Helvetica-Bold').fontSize(64);
    doc.rotate(-18, { origin: [pageW / 2, pageH - 160] });
    doc.text('PAID', 0, pageH - 200, { width: pageW, align: 'center' });
    doc.restore();

    // —— Brand header bar ——
    doc.opacity(1);
    doc.rect(0, 0, pageW, 96).fill(BRAND);

    // Logo mark + wordmark
    const markSize = 34;
    const markX = left;
    const markY = 31;
    drawCosmoMark(doc, markX, markY, markSize, WHITE);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(26);
    doc.text('cosmo', markX + markSize + 10, 34);
    doc.font('Helvetica').fontSize(10).fillColor('#c5d4ce');
    doc.text('by cosmovai', markX + markSize + 10, 64);

    doc.font('Helvetica-Bold').fontSize(18).fillColor(WHITE);
    doc.text('TAX INVOICE', left, 36, { width: contentW, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor('#c5d4ce');
    doc.text('Paid · Digital receipt', left, 58, {
      width: contentW,
      align: 'right',
    });

    // Small mark in the From block
    drawCosmoMark(doc, left, 190, 18, BRAND);

    // —— Soft meta strip ——
    doc.rect(0, 96, pageW, 56).fill(SOFT);
    doc.fillColor(MUTED).font('Helvetica').fontSize(9);
    doc.text('Invoice number', left, 108);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11);
    doc.text(input.invoiceNumber, left, 122);

    doc.fillColor(MUTED).font('Helvetica').fontSize(9);
    doc.text('Invoice date', left + 200, 108);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11);
    doc.text(formatDate(input.paidAt), left + 200, 122);

    doc.fillColor(MUTED).font('Helvetica').fontSize(9);
    doc.text('Status', left + 360, 108);
    doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(11);
    doc.text('PAID', left + 360, 122);

    // —— From / Bill to ——
    let y = 176;
    doc.fillColor(MUTED).font('Helvetica').fontSize(9);
    doc.text('From', left + 26, y);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12);
    doc.text('cosmovai', left + 26, y + 14);
    doc.font('Helvetica').fontSize(10).fillColor(MUTED);
    doc.text('AI job apply automation', left + 26, y + 30);
    doc.text('support@cosmovai.com', left + 26, y + 44);

    doc.fillColor(MUTED).font('Helvetica').fontSize(9);
    doc.text('Bill to', left + 280, y);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12);
    doc.text(input.customerName, left + 280, y + 14, { width: 220 });
    doc.font('Helvetica').fontSize(10).fillColor(MUTED);
    doc.text(input.customerEmail, left + 280, y + 30, { width: 220 });

    // —— Line items table ——
    y = 270;
    doc.rect(left, y, contentW, 28).fill(BRAND);
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9);
    doc.text('DESCRIPTION', left + 12, y + 9);
    doc.text('PERIOD', left + 250, y + 9);
    doc.text('AMOUNT', left + 12, y + 9, {
      width: contentW - 24,
      align: 'right',
    });

    y += 28;
    const rowH = 52;
    doc.rect(left, y, contentW, rowH).fill(WHITE);
    doc
      .moveTo(left, y + rowH)
      .lineTo(right, y + rowH)
      .strokeColor(LINE)
      .lineWidth(1)
      .stroke();

    const period = `${formatDate(input.periodStart)} – ${formatDate(input.periodEnd)}`;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11);
    doc.text(`${planLabel(input.plan)}`, left + 12, y + 12);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text('Subscription · 1 month access', left + 12, y + 28);
    doc.fillColor(INK).font('Helvetica').fontSize(10);
    doc.text(period, left + 250, y + 18, { width: 160 });
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text(formatInr(input.amountPaise), left + 12, y + 18, {
      width: contentW - 24,
      align: 'right',
    });

    // —— Totals ——
    y += rowH + 24;
    const totalsX = left + contentW - 220;
    doc.fillColor(MUTED).font('Helvetica').fontSize(10);
    doc.text('Subtotal', totalsX, y);
    doc.fillColor(INK).text(formatInr(input.amountPaise), totalsX, y, {
      width: 220,
      align: 'right',
    });
    y += 18;
    doc.fillColor(MUTED).text('Tax / GST', totalsX, y);
    doc.fillColor(INK).text('Included', totalsX, y, {
      width: 220,
      align: 'right',
    });
    y += 22;
    doc.rect(totalsX - 8, y - 6, 228, 36).fill(SOFT);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12);
    doc.text('Total paid', totalsX, y + 6);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(BRAND);
    doc.text(formatInr(input.amountPaise), totalsX, y + 5, {
      width: 220,
      align: 'right',
    });

    // —— Payment references ——
    y += 64;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11);
    doc.text('Payment details', left, y);
    y += 18;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(`Gateway: Razorpay`, left, y);
    y += 14;
    doc.text(`Order ID: ${input.razorpayOrderId}`, left, y);
    y += 14;
    doc.text(`Payment ID: ${input.razorpayPaymentId}`, left, y);
    y += 14;
    doc.text(`Currency: ${input.currency}`, left, y);

    // —— Notes ——
    y += 28;
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(11);
    doc.text('Notes', left, y);
    y += 16;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED);
    doc.text(
      'This is a computer-generated invoice for your Cosmo subscription. No physical signature is required. For billing help, email support@cosmovai.com.',
      left,
      y,
      { width: contentW, lineGap: 2 }
    );

    // —— Footer ——
    doc
      .moveTo(left, pageH - 56)
      .lineTo(right, pageH - 56)
      .strokeColor(LINE)
      .stroke();
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    doc.text(
      'cosmovai · cosmo job apply assistant · Thank you for your purchase.',
      left,
      pageH - 42,
      { width: contentW, align: 'center' }
    );

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return { absolutePath, relativePath };
}
