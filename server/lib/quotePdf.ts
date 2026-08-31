import PDFDocument from "pdfkit";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

export type QuotePdfInput = {
  workshopName: string;
  quoteNumber: number;
  customerName: string;
  vehicleMake: string;
  vehicleModel: string;
  vehiclePlate: string | null;
  validUntil: string;
  items: Array<{ description: string; quantity: number; unitPrice: number; discount: number }>;
  subtotal: number;
  discountTotal: number;
  total: number;
  notes: string | null;
  terms: string | null;
};

export function generateQuotePdfBuffer(input: QuotePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", chunk => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).fillColor("#171717").text(input.workshopName, { continued: false });
    doc.moveDown(0.2);
    doc.fontSize(14).fillColor("#E84D1C").text(`Proposta de Orçamento #${String(input.quoteNumber).padStart(6, "0")}`);
    doc.moveDown(1);

    doc.fontSize(10).fillColor("#171717");
    doc.text(`Cliente: ${input.customerName}`);
    const vehicleLine = `Veículo: ${input.vehicleMake} ${input.vehicleModel}${input.vehiclePlate ? ` — Placa ${input.vehiclePlate}` : ""}`;
    doc.text(vehicleLine);
    doc.text(`Válido até: ${dateFmt.format(new Date(input.validUntil))}`);
    doc.moveDown(1);

    const tableTop = doc.y;
    const columns = { description: 48, quantity: 320, unitPrice: 380, total: 460 };
    doc.fontSize(9).fillColor("#666666");
    doc.text("Item", columns.description, tableTop);
    doc.text("Qtd", columns.quantity, tableTop);
    doc.text("Unitário", columns.unitPrice, tableTop);
    doc.text("Total", columns.total, tableTop);
    doc.moveTo(48, tableTop + 14).lineTo(547, tableTop + 14).strokeColor("#e5e5e5").stroke();

    let cursorY = tableTop + 22;
    doc.fontSize(10).fillColor("#171717");
    for (const item of input.items) {
      const lineTotal = item.quantity * item.unitPrice - item.discount;
      if (cursorY > 720) {
        doc.addPage();
        cursorY = 48;
      }
      doc.text(item.description, columns.description, cursorY, { width: 260 });
      doc.text(String(item.quantity), columns.quantity, cursorY);
      doc.text(money.format(item.unitPrice), columns.unitPrice, cursorY);
      doc.text(money.format(lineTotal), columns.total, cursorY);
      cursorY += 20;
    }

    cursorY += 10;
    doc.moveTo(48, cursorY).lineTo(547, cursorY).strokeColor("#e5e5e5").stroke();
    cursorY += 14;
    doc.fontSize(10).fillColor("#666666").text("Subtotal", columns.unitPrice, cursorY);
    doc.fillColor("#171717").text(money.format(input.subtotal), columns.total, cursorY);
    cursorY += 16;
    if (input.discountTotal > 0) {
      doc.fillColor("#666666").text("Descontos", columns.unitPrice, cursorY);
      doc.fillColor("#171717").text(`- ${money.format(input.discountTotal)}`, columns.total, cursorY);
      cursorY += 16;
    }
    doc.fontSize(13).fillColor("#171717").text("Total", columns.unitPrice, cursorY);
    doc.text(money.format(input.total), columns.total, cursorY);
    cursorY += 30;

    if (input.notes) {
      doc.fontSize(9).fillColor("#666666").text("Observações", 48, cursorY);
      cursorY += 14;
      doc.fontSize(10).fillColor("#171717").text(input.notes, 48, cursorY, { width: 499 });
      cursorY = doc.y + 16;
    }
    if (input.terms) {
      doc.fontSize(9).fillColor("#666666").text("Condições", 48, cursorY);
      cursorY += 14;
      doc.fontSize(10).fillColor("#171717").text(input.terms, 48, cursorY, { width: 499 });
    }

    doc.end();
  });
}
