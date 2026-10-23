import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';
import { Order } from '../../domain/entities';
import { CLUB, clubAddressLine } from '../../config';
import { clubLogoUrl } from '../../utils/media';

export interface InvoiceData {
  orderGroupId: string;
  clientName: string;
  clientEmail: string;
  orders: Order[];
  date?: Date;
  paymentStatus: 'paid_stripe' | 'free' | 'paid' | 'pending';
}

/**
 * Estado de pago de un grupo de pedidos. Los pagados por Stripe pasan a
 * "processing" (pendiente de entrega) en cuanto llega el webhook, así que
 * cuentan ya como pagados. Los gratuitos no tienen pago; los pedidos antiguos
 * sin pago online solo cuentan como pagados si un admin los completó.
 */
export function invoicePaymentStatus(groupKey: string, orders: Order[]): InvoiceData['paymentStatus'] {
  if (groupKey.startsWith('cs_')) {
    return orders.every(o => o.status === 'processing' || o.status === 'completed') ? 'paid_stripe' : 'pending';
  }
  if (groupKey.startsWith('free_')) return 'free';
  return orders.every(o => o.status === 'completed') ? 'paid' : 'pending';
}

export class InvoiceGenerator {
  private static readonly CLUB_NAME = CLUB.legalName.toUpperCase();
  private static readonly CLUB_CIF = CLUB.cif;
  private static readonly CLUB_ADDRESS = clubAddressLine;
  private static readonly IVA_RATE = 0.21;

  private static async getBase64ImageFromUrl(imageUrl: string): Promise<string | null> {
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.error('Error cargando logo PDF:', e);
      return null;
    }
  }

  public static async generateReceiptPdf(data: InvoiceData): Promise<void> {
    const doc = new jsPDF();
    const { orderGroupId, clientName, clientEmail, orders, paymentStatus } = data;
    const issueDate = data.date || new Date();
    // Las sesiones de Stripe empiezan todas por "cs_test_"/"cs_live_": el final es lo que las distingue
    const shortId = orderGroupId.slice(-8).toUpperCase();

    // 1. Escudo del club sobre un recuadro gris claro
    const logoUrl = clubLogoUrl;
    const logoBase64 = await this.getBase64ImageFromUrl(logoUrl);

    if (logoBase64) {
      // Light grey background rect behind the logo
      doc.setFillColor(240, 240, 240);
      doc.roundedRect(12, 12, 26, 26, 3, 3, 'F');
      // El escudo es más alto que ancho (519 × 664): se centra sin deformarlo
      doc.addImage(logoBase64, 'PNG', 16.4, 14, 17.2, 22);
    }

    // -- Header Section --
    const headerX = logoBase64 ? 42 : 14;
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(this.CLUB_NAME, headerX, 22);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text(`CIF: ${this.CLUB_CIF}`, headerX, 28);
    doc.text(`Dirección: ${this.CLUB_ADDRESS}`, headerX, 33);
    doc.setTextColor(0, 0, 0);

    // Horizontal separator
    doc.setDrawColor(200, 200, 200);
    doc.line(14, 42, 196, 42);

    // -- Client Section --
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Cliente: ${clientName}`, 14, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`Email: ${clientEmail}`, 14, 55);

    // Justificante de pago, no factura: una factura exige numeración correlativa
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('JUSTIFICANTE DE PAGO', 130, 50);
    doc.setFontSize(10);
    doc.text(`Nº: ${shortId}`, 130, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${issueDate.toLocaleDateString('es-ES')}`, 130, 60);

    // Stripe session reference
    if (orderGroupId.startsWith('cs_')) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      // Use maxWidth to prevent cropping on long Stripe IDs
      doc.text(`Ref. Stripe: ${orderGroupId}`, 130, 65, { maxWidth: 65 });
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
    }

    // -- Table Data --
    const tableData = orders.map(o => {
      const qty = o.quantity || 1;
      const unitPrice = qty > 1 ? (o.amount / qty) : o.amount;
      const desc = o.size ? `${o.item_name || 'Producto'} [${o.size}]` : (o.item_name || 'Producto');
      return [desc, String(qty), `${unitPrice.toFixed(2)} €`, `${o.amount.toFixed(2)} €`];
    });

    autoTable(doc, {
      startY: 74,
      head: [['Concepto', 'Cantidad', 'Precio Unitario', 'Importe']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255] },
      styles: { fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { halign: 'center', cellWidth: 25 },
        2: { halign: 'right', cellWidth: 35 },
        3: { halign: 'right', cellWidth: 35 },
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 100;

    // -- Totals --
    const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0);
    const subtotal = totalAmount / (1 + this.IVA_RATE);
    const ivaAmount = totalAmount - subtotal;

    const startY = finalY + 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Subtotal:', 130, startY);
    doc.text(`${subtotal.toFixed(2)} €`, 190, startY, { align: 'right' });

    doc.text('+ IVA (21%):', 130, startY + 6);
    doc.text(`${ivaAmount.toFixed(2)} €`, 190, startY + 6, { align: 'right' });

    // Separator line
    doc.setDrawColor(180, 180, 180);
    doc.line(128, startY + 9, 192, startY + 9);

    // Payment status label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);

    let statusLabel = 'Total a pagar:';
    if (paymentStatus === 'paid_stripe') {
      statusLabel = 'PAGADO (Stripe):';
      doc.setTextColor(34, 139, 34); // green
    } else if (paymentStatus === 'free') {
      statusLabel = 'GRATUITO:';
      doc.setTextColor(34, 139, 34); // green
    } else if (paymentStatus === 'paid') {
      statusLabel = 'PAGADO:';
      doc.setTextColor(34, 139, 34); // green
    }

    doc.text(statusLabel, 130, startY + 17);
    doc.text(`${totalAmount.toFixed(2)} €`, 190, startY + 17, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // Anti-falsification QR Code
    try {
      // Se genera en el navegador: el código no sale a ningún servicio externo
      const base64 = await QRCode.toDataURL(`uros_id_${orderGroupId}`, { width: 200, margin: 1 });
      doc.addImage(base64, 'PNG', 14, startY - 5, 25, 25);
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(`ID Validación: ${shortId}`, 14, startY + 23);
    } catch (e) { console.error("Could not generate QR code", e); }

    // Footer mark
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Documento generado automáticamente — ${CLUB.legalName}`, 14, 285);
    doc.setTextColor(0, 0, 0);

    doc.save(`Justificante_${shortId}.pdf`);
  }
}
