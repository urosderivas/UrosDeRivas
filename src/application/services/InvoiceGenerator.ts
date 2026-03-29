import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Order } from '../../domain/entities';

export interface InvoiceData {
  orderGroupId: string;
  clientName: string;
  clientEmail: string;
  orders: Order[];
  date?: Date;
  /** 'paid_stripe' | 'paid_hand' | 'pending' */
  paymentStatus: 'paid_stripe' | 'paid_hand' | 'pending';
}

export class InvoiceGenerator {
  private static readonly CLUB_NAME = 'CLUB BALONCESTO UROS DE RIVAS';
  private static readonly CLUB_CIF = 'GXXXXXXXXX';
  private static readonly CLUB_ADDRESS = 'Calle de Aigües Tortes, 28522 - Rivas-Vaciamadrid, Madrid';
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

  public static async generatePdfFactura(data: InvoiceData): Promise<void> {
    const doc = new jsPDF();
    const { orderGroupId, clientName, clientEmail, orders, paymentStatus } = data;
    const issueDate = data.date || new Date();
    const shortId = orderGroupId.substring(0, 8).toUpperCase();

    // 1. Load Logo — use the black bull on a light grey rect for visibility
    const logoUrl = `${import.meta.env.BASE_URL}assets/navbar_black_bull.png`;
    const logoBase64 = await this.getBase64ImageFromUrl(logoUrl);

    if (logoBase64) {
      // Light grey background rect behind the logo
      doc.setFillColor(240, 240, 240);
      doc.roundedRect(12, 12, 26, 26, 3, 3, 'F');
      doc.addImage(logoBase64, 'PNG', 14, 14, 22, 22);
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

    doc.setFont('helvetica', 'bold');
    doc.text(`Factura Nº: ${shortId}`, 130, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${issueDate.toLocaleDateString('es-ES')}`, 130, 55);

    // Stripe session reference
    if (orderGroupId.startsWith('cs_')) {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`Ref. Stripe: ${orderGroupId}`, 130, 60);
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
      startY: 68,
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
    } else if (paymentStatus === 'paid_hand') {
      statusLabel = 'PAGADO EN MANO:';
      doc.setTextColor(34, 139, 34); // green
    }

    doc.text(statusLabel, 130, startY + 17);
    doc.text(`${totalAmount.toFixed(2)} €`, 190, startY + 17, { align: 'right' });
    doc.setTextColor(0, 0, 0);

    // Anti-falsification QR Code
    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=uros_id_${orderGroupId}`;
      const qrRes = await fetch(qrUrl);
      const qrBlob = await qrRes.blob();
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(qrBlob);
      });
      doc.addImage(base64, 'PNG', 14, startY - 5, 25, 25);
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.text(`ID Validación: ${shortId}`, 14, startY + 23);
    } catch (e) { console.error("Could not fetch QR code", e); }

    // Footer mark
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Documento generado automáticamente — C.B. Uros de Rivas', 14, 285);
    doc.setTextColor(0, 0, 0);

    doc.save(`Factura_${shortId}.pdf`);
  }
}
