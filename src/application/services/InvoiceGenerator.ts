import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Order } from '../../domain/entities';

interface InvoiceData {
  orderGroupId: string;
  clientName: string;
  clientEmail: string;
  orders: Order[];
  date?: Date;
}

export class InvoiceGenerator {
  private static readonly CLUB_NAME = 'CLUB BALONCESTO UROS DE RIVAS';
  private static readonly CLUB_CIF = 'GXXXXXXXXX';
  private static readonly CLUB_ADDRESS = 'Calle de Aigües Tortes, 28522 - Rivas-Vaciamadrid, Madrid';
  private static readonly IVA_RATE = 0.21;

  private static getBase64ImageFromUrl = async (imageUrl: string): Promise<string | null> => {
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
  };

  public static async generatePdfFactura(data: InvoiceData): Promise<void> {
    const doc = new jsPDF();
    const { orderGroupId, clientName, clientEmail, orders } = data;
    const issueDate = data.date || new Date();

    const shortId = orderGroupId.substring(0, 8).toUpperCase();

    // 1. Load Logo Asynchronously
    const logoUrl = `${import.meta.env.BASE_URL}assets/navbar_black_bull.png`;
    const logoBase64 = await this.getBase64ImageFromUrl(logoUrl);
    if (logoBase64) {
      // (image, format, x, y, width, height)
      doc.addImage(logoBase64, 'PNG', 14, 15, 20, 20);
    } // If it fails securely ignores it

    // -- Header Section --
    const headerX = logoBase64 ? 38 : 14;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(this.CLUB_NAME, headerX, 22);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`CIF: ${this.CLUB_CIF}`, headerX, 28);
    doc.text(`Dirección: ${this.CLUB_ADDRESS}`, headerX, 33);

    // -- Client Section --
    const leftCol = 14;
    const rightCol = 130;
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Cliente: ${clientName}`, leftCol, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`Email: ${clientEmail}`, leftCol, 55);

    doc.setFont('helvetica', 'bold');
    doc.text(`Factura Nº: 2025-${shortId}`, rightCol, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(`Fecha: ${issueDate.toLocaleDateString('es-ES')}`, rightCol, 55);

    // -- Table Data --
    const tableData = orders.map(o => {
      const description = o.size ? `${o.item_name} [${o.size}]` : o.item_name || 'Producto';
      return [
        description,
        '1',
        `${o.amount.toFixed(2)} €`,
        `${o.amount.toFixed(2)} €`
      ];
    });

    autoTable(doc, {
      startY: 65,
      head: [['Concepto', 'Cantidad', 'Precio Unitario', 'Importe']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40] },
      styles: { fontSize: 10 }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 100;
    
    // -- Calculation --
    const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0);
    const subtotal = totalAmount / (1 + this.IVA_RATE);
    const ivaAmount = totalAmount - subtotal;

    doc.setFont('helvetica', 'normal');
    const startY = finalY + 10;
    doc.text(`Subtotal:`, 130, startY);
    doc.text(`${subtotal.toFixed(2)} €`, 180, startY, { align: 'right' });

    doc.text(`+ IVA (21%):`, 130, startY + 6);
    doc.text(`${ivaAmount.toFixed(2)} €`, 180, startY + 6, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Total a pagar:`, 130, startY + 16);
    doc.text(`${totalAmount.toFixed(2)} €`, 180, startY + 16, { align: 'right' });

    doc.save(`Factura_${shortId}.pdf`);
  }
}
