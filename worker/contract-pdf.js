import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 46;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export async function buildContractPdf(contract) {
  const pdf = await PDFDocument.create();
  const [font, bold] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold),
  ]);
  const colors = {
    dark: rgb(0.09, 0.11, 0.12),
    teal: rgb(0.0, 0.52, 0.47),
    muted: rgb(0.38, 0.42, 0.44),
    line: rgb(0.79, 0.82, 0.83),
    pale: rgb(0.92, 0.97, 0.96),
    soft: rgb(0.96, 0.97, 0.97),
  };
  const ctx = { pdf, font, bold, colors, page: null, y: 0, pageNumber: 0, contract };

  addPage(ctx);
  heading(ctx, "CANARY 360 & COMUNICATION S.L.", 12, colors.teal);
  heading(ctx, "ACUERDO COMERCIAL DE PUBLICIDAD", 25, colors.dark);
  paragraph(ctx, `Contrato vinculado al presupuesto ${contract.quoteNumber}`, { size: 12, color: colors.muted, after: 18 });

  callout(ctx, "EL ACUERDO EN 30 SEGUNDOS", `${contract.customerCompany} contrata los productos publicitarios enumerados en este acuerdo durante ${contract.months} ${contract.months === 1 ? "mes" : "meses"}. Importe total: ${money(contract.totalCents)}, impuestos incluidos.`);

  const signerRows = [
    ["Editor", "CANARY 360 & COMUNICATION S.L. · NIF B56378318 · Avenida Las Américas 8, Local 396-E, 38640 Arona, Tenerife"],
    ["Firmante del Editor", "Marco Notarbartolo · Director Canarias"],
    ["Cliente", contract.customerCompany],
    ["Datos fiscales del Cliente", `${contract.taxId} · ${contract.fiscalAddress}`],
    ["Firmante del Cliente", `${contract.legalSignerName} · ${contract.legalSignerRole}`],
  ];
  section(ctx, "Quién firma", keyValuesHeight(ctx, signerRows));
  keyValues(ctx, signerRows);
  paragraph(ctx, "El Cliente confirma que contrata los servicios para su actividad comercial o profesional.", { after: 12 });

  section(ctx, "Productos y precio acordados", 90);
  productTable(ctx, contract.items);
  totals(ctx, contract);

  const plan = paymentPlan(contract.months, contract.netCents);

  const scheduleRows = [
    ["Fecha prevista de inicio", formatDate(contract.campaignStartDate)],
    ["Fecha prevista de finalización", formatDate(contract.campaignEndDate)],
    ["Duración comercial", `${contract.months} ${contract.months === 1 ? "mes" : "meses"}`],
    ["Pago", plan.summaryLine],
    ["Inicio", "Tras la recepción del pago, los materiales y la aprobación del Cliente"],
    ["Impuestos", `${contract.taxName} al ${formatPercent(contract.taxRateBps)} aplicado sobre la base imponible`],
  ];
  section(ctx, "Fechas y ejecución", keyValuesHeight(ctx, scheduleRows));
  keyValues(ctx, scheduleRows);

  const paymentTerms = [
    "Pago de las inserciones publicitarias. Para una salida única o un paquete de 3 salidas, el importe íntegro debe abonarse antes de la primera publicación. Los artículos relacionados, si los hubiera, deben abonarse antes de la salida en la que se publiquen.",
    "Pago de los paquetes de 6 y 12 salidas. El paquete de 6 salidas se abona en 2 cuotas, cada una equivalente a 3 salidas: una antes de la salida n.º 1 y otra antes de la salida n.º 4. El paquete de 12 salidas se abona en 4 cuotas, cada una equivalente a 3 salidas, antes de las salidas n.º 1, 4, 7 y 10. Cada cuota se calcula sobre el importe imponible (sin impuestos) del acuerdo. Los plazos siguen las salidas programadas, aunque no sean consecutivas, y no los trimestres naturales. El compromiso de compra del paquete completo se mantiene en cualquier caso. La publicación queda supeditada a la recepción del pago correspondiente y a la aprobación del material.",
    "Aprobación de calidad de las piezas gráficas. Todas las piezas gráficas, incluidas las sustituciones, deben cumplir los estándares de calidad de la publicación y ser aprobadas antes de su publicación. La evaluación considera legibilidad, resolución de las imágenes, maquetación, dimensiones e idoneidad para impresión.",
    "Envío del material antes del pago. Se recomienda enviar la pieza gráfica con antelación para verificar su idoneidad y evitar el pago de una inserción cuyo material aún no haya sido aprobado. El pago no implica la aprobación de la pieza gráfica.",
    "Servicio de diseño gráfico con presupuesto separado. Si la calidad no es adecuada, la publicación pone a disposición su propio servicio de diseño gráfico. Este servicio tiene coste adicional, no incluido en los precios de las inserciones y los paquetes, y se inicia únicamente tras la aceptación de un presupuesto separado con costes, plazos y condiciones de pago.",
  ];
  section(ctx, "Condiciones de pago", firstListItemHeight(ctx, paymentTerms));
  numbered(ctx, paymentTerms);
  callout(ctx, "CALENDARIO DE PAGO DE ESTE ACUERDO", plan.schedule.join(" "));

  const campaignRows = [
    ["Enlace de destino", contract.destinationUrl],
    ["Edición impresa", contract.printEdition],
    ["Tirada prevista", `${contract.printRun} ejemplares`],
    ["Distribución", contract.distribution],
    ["Isla comercial", contract.island],
    ["Referencia", contract.quoteNumber],
  ];
  section(ctx, "Datos operativos de la campaña", keyValuesHeight(ctx, campaignRows));
  keyValues(ctx, campaignRows);

  if (contract.complimentaryNote) {
    callout(
      ctx,
      "SERVICIO DE CORTESÍA (NO CONTRACTUAL)",
      `${contract.complimentaryNote} Este servicio adicional se ofrece a título de cortesía y no modifica los importes, plazos ni obligaciones de pago establecidos en este acuerdo.`,
    );
  }

  const onboardingSteps = [
    "El Cliente envía el logotipo, las imágenes, los textos, el enlace y los datos de contacto al menos 7 días laborables antes de la fecha de inicio.",
    "El Editor revisa los materiales y prepara las piezas correspondientes a los productos contratados.",
    "El Cliente aprueba las piezas por correo electrónico. Se incluyen dos rondas de cambios, salvo condición distinta indicada expresamente en el presupuesto.",
    "La ejecución comienza cuando se han recibido el pago, los materiales y la aprobación final.",
    "Si el Cliente entrega o aprueba con retraso, las fechas se desplazan por el mismo periodo sin incumplimiento del Editor.",
  ];
  section(ctx, "Cómo empezamos", firstListItemHeight(ctx, onboardingSteps));
  numbered(ctx, onboardingSteps);

  const materialRequirements = [
    "Los archivos deberán entregarse en JPG, PNG, WebP o PDF con resolución y dimensiones adecuadas al producto adquirido.",
    "El Cliente facilitará textos, identidad visual, datos de contacto y URL de destino correctos y actualizados.",
    "Las adaptaciones razonables para visualización móvil están incluidas cuando el formato contratado tenga versión digital.",
    "Los requisitos técnicos específicos indicados en el presupuesto o por el equipo de producción forman parte del acuerdo.",
  ];
  section(ctx, "Requisitos de materiales", firstListItemHeight(ctx, materialRequirements));
  bulletList(ctx, materialRequirements);

  const scopeIntro = "El Editor garantiza la prestación y publicación de los espacios o servicios descritos en el presente acuerdo. No garantiza ventas, contactos, facturación, posicionamiento en buscadores ni otros resultados comerciales. Las métricas se facilitarán únicamente cuando el soporte contratado permita obtenerlas.";
  section(ctx, "Alcance y resultados", paragraphHeight(ctx, scopeIntro));
  paragraph(ctx, scopeIntro);
  paragraph(ctx, "Cuando exista contenido patrocinado, se identificará claramente como publicidad o colaboración comercial. La permanencia, rotación y ubicación serán las descritas en el producto contratado y en el presupuesto vinculado.");

  section(ctx, "Condiciones comerciales", legalParagraphHeight(ctx, "Contenidos y derechos.", "El Cliente garantiza que los textos, imágenes, marcas, enlaces y mensajes entregados son lícitos, veraces y pueden utilizarse. El Editor podrá rechazar contenidos ilícitos, engañosos, discriminatorios o perjudiciales."));
  legalParagraph(ctx, "Contenidos y derechos.", "El Cliente garantiza que los textos, imágenes, marcas, enlaces y mensajes entregados son lícitos, veraces y pueden utilizarse. El Editor podrá rechazar contenidos ilícitos, engañosos, discriminatorios o perjudiciales.");
  legalParagraph(ctx, "Uso de los contenidos.", "Una vez efectuado el pago, el Cliente podrá volver a publicar las piezas finales creadas específicamente para la campaña en sus propios canales, citando a Vivi le Canarie cuando corresponda y respetando derechos de terceros.");
  legalParagraph(ctx, "Cambios y aprobaciones.", "Los cambios, fechas y aprobaciones deberán constar por escrito, incluido el correo electrónico. Las solicitudes que excedan las rondas incluidas podrán presupuestarse por separado.");
  legalParagraph(ctx, "Si el Cliente cancela.", "Antes del inicio se retendrá el 20 % del precio. Después del inicio deberán abonarse los servicios ya prestados y el 15 % de la parte pendiente de ejecución; cualquier saldo a favor se devolverá en un plazo de 15 días.");
  legalParagraph(ctx, "Si el Editor no presta el servicio.", "El Cliente podrá elegir entre recuperar el periodo o espacio no prestado y recibir un reembolso proporcional calculado sobre las líneas afectadas del presupuesto vinculado.");
  legalParagraph(ctx, "Interrupciones digitales.", "Si un soporte digital permanece fuera de línea más de cuatro horas acumuladas en un mes por causas imputables al Editor, la campaña se prolongará por el tiempo perdido.");
  legalParagraph(ctx, "Privacidad y seguimiento.", "No se incluyen píxeles, cookies ni listas de usuarios del Cliente. Cualquier herramienta de seguimiento o tratamiento adicional de datos requerirá un acuerdo separado.");
  legalParagraph(ctx, "Validez y firma electrónica.", "Este acuerdo, el presupuesto vinculado, la verificación OTP, la firma en pantalla y el registro de auditoría forman una única evidencia contractual. Se admite la firma electrónica.");
  legalParagraph(ctx, "Ley y jurisdicción.", "Se aplica la legislación española. Primero se intentará alcanzar una solución amistosa; en su defecto, las partes se someten a los juzgados y tribunales de Santa Cruz de Tenerife, salvo normas imperativas.");

  callout(ctx, "ACLARACIÓN IMPORTANTE", "El contacto comercial puede gestionar el proyecto, pero el documento debe firmarlo una persona con poder suficiente para obligar legalmente al Cliente.");

  addPage(ctx);
  const contactRows = [
    ["Contacto del Editor", "Marco Notarbartolo · Director Canarias"],
    ["Contacto del Cliente", `${contract.legalSignerName} · ${contract.customerEmail} · ${contract.customerPhone}`],
    ["Correo de facturación", contract.billingEmail],
  ];
  section(ctx, "Contactos", keyValuesHeight(ctx, contactRows));
  keyValues(ctx, contactRows);

  const confirmationIntro = "Las Partes confirman que han leído y aceptan el presente acuerdo comercial y el presupuesto vinculado.";
  section(ctx, "Confirmación y firmas", paragraphHeight(ctx, confirmationIntro, 9.5) + 150);
  paragraph(ctx, confirmationIntro, { after: 20 });
  signatureBlocks(ctx, contract);

  paragraph(ctx, "La firma del Cliente se completará mediante código OTP enviado por correo electrónico, firma manuscrita en pantalla y confirmación presencial del agente. CRMVLC añadirá al PDF firmado el certificado técnico y conservará la evidencia de auditoría.", { size: 8.5, color: colors.muted, after: 0 });

  for (let index = 0; index < pdf.getPageCount(); index += 1) drawFooter(ctx, pdf.getPage(index), index + 1, pdf.getPageCount());
  pdf.setTitle(`Acuerdo comercial ${contract.quoteNumber}`);
  pdf.setAuthor("Canary 360 & Comunication S.L.");
  pdf.setSubject("Acuerdo comercial de publicidad");
  pdf.setProducer("CRMVLC");
  return pdf.save({ useObjectStreams: true });
}

function addPage(ctx) {
  ctx.page = ctx.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  ctx.pageNumber += 1;
  ctx.y = PAGE_HEIGHT - 52;
  ctx.page.drawText("VIVI LE CANARIE  |  ACUERDO COMERCIAL", { x: MARGIN, y: ctx.y, size: 7.5, font: ctx.bold, color: ctx.colors.muted });
  ctx.y -= 34;
}

function ensure(ctx, height) {
  if (ctx.y - height < 72) addPage(ctx);
}

function heading(ctx, text, size, color) {
  ensure(ctx, size + 10);
  ctx.page.drawText(latin(text), { x: MARGIN, y: ctx.y, size, font: ctx.bold, color });
  ctx.y -= size + 13;
}

function section(ctx, text, guardHeight = 0) {
  // guardHeight reserves room for the content that will follow this heading (capped at
  // one page's worth), so the heading is never stranded alone at the bottom of a page
  // with its content pushed entirely onto the next one.
  if (ctx.contract) {
    ctx.contract.__debug = ctx.contract.__debug || [];
    ctx.contract.__debug.push(`${text} | y=${ctx.y.toFixed(1)} guard=${guardHeight.toFixed ? guardHeight.toFixed(1) : guardHeight} page=${ctx.pageNumber}`);
  }
  ensure(ctx, 35 + Math.min(guardHeight, 560));
  if (ctx.contract) {
    ctx.contract.__debug.push(`${text} | after-ensure y=${ctx.y.toFixed(1)} page=${ctx.pageNumber}`);
  }
  ctx.y -= 6;
  ctx.page.drawText(latin(text), { x: MARGIN, y: ctx.y, size: 16, font: ctx.bold, color: ctx.colors.teal });
  ctx.y -= 24;
}

function paragraph(ctx, text, options = {}) {
  const size = options.size ?? 9.5;
  const lineHeight = size + 3.2;
  const rows = wrap(latin(text), ctx.font, size, options.width ?? CONTENT_WIDTH);
  ensure(ctx, rows.length * lineHeight + (options.after ?? 9));
  for (const row of rows) {
    ctx.page.drawText(row, { x: options.x ?? MARGIN, y: ctx.y, size, font: options.font ?? ctx.font, color: options.color ?? ctx.colors.dark });
    ctx.y -= lineHeight;
  }
  ctx.y -= options.after ?? 9;
}

function callout(ctx, title, text) {
  const rows = wrap(latin(text), ctx.font, 9.3, CONTENT_WIDTH - 24);
  const height = 28 + rows.length * 12;
  ensure(ctx, height + 15);
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - height, width: CONTENT_WIDTH, height, color: ctx.colors.pale, borderColor: ctx.colors.teal, borderWidth: 1 });
  ctx.page.drawText(latin(title), { x: MARGIN + 12, y: ctx.y - 18, size: 9.5, font: ctx.bold, color: ctx.colors.teal });
  let lineY = ctx.y - 34;
  for (const row of rows) {
    ctx.page.drawText(row, { x: MARGIN + 12, y: lineY, size: 9.3, font: ctx.font, color: ctx.colors.dark });
    lineY -= 12;
  }
  ctx.y -= height + 15;
}

function keyValuesRows(ctx, rows) {
  return rows.map(([label, value]) => {
    const valueRows = wrap(latin(value), ctx.font, 8.7, CONTENT_WIDTH - 165);
    return { label, valueRows, height: Math.max(24, valueRows.length * 11 + 9) };
  });
}

function keyValuesHeight(ctx, rows) {
  return keyValuesRows(ctx, rows).reduce((sum, row) => sum + row.height, 0) + 12;
}

function firstListItemHeight(ctx, items, size = 9.2, indent = 32) {
  if (!items.length) return 0;
  const rows = wrap(latin(items[0]), ctx.font, size, CONTENT_WIDTH - indent);
  return rows.length * 12 + 7;
}

function paragraphHeight(ctx, text, size = 9.5) {
  const lineHeight = size + 3.2;
  const rows = wrap(latin(text), ctx.font, size, CONTENT_WIDTH);
  return rows.length * lineHeight + 9;
}

function legalParagraphHeight(ctx, title, text) {
  const rows = wrap(latin(`${title} ${text}`), ctx.font, 9.2, CONTENT_WIDTH);
  return rows.length * 12 + 9;
}

function keyValues(ctx, rows) {
  const prepared = keyValuesRows(ctx, rows);
  const totalHeight = prepared.reduce((sum, row) => sum + row.height, 0) + 12;
  if (totalHeight < 560) ensure(ctx, totalHeight);
  for (const { label, valueRows, height } of prepared) {
    ensure(ctx, height);
    ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - height, width: 155, height, color: ctx.colors.soft, borderColor: ctx.colors.line, borderWidth: 0.5 });
    ctx.page.drawRectangle({ x: MARGIN + 155, y: ctx.y - height, width: CONTENT_WIDTH - 155, height, borderColor: ctx.colors.line, borderWidth: 0.5 });
    ctx.page.drawText(latin(label), { x: MARGIN + 8, y: ctx.y - 15, size: 8.4, font: ctx.bold, color: ctx.colors.teal });
    let valueY = ctx.y - 15;
    for (const line of valueRows) {
      ctx.page.drawText(line, { x: MARGIN + 163, y: valueY, size: 8.7, font: ctx.font, color: ctx.colors.dark });
      valueY -= 11;
    }
    ctx.y -= height;
  }
  ctx.y -= 12;
}

function productTable(ctx, items) {
  tableHeader(ctx);
  for (const item of items) {
    const description = `${item.name} · ${item.dimensions}`;
    const lines = wrap(latin(description), ctx.font, 8.2, 247);
    const height = Math.max(29, lines.length * 10 + 9);
    ensure(ctx, height + 20);
    if (ctx.y > PAGE_HEIGHT - 100) tableHeader(ctx);
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y - height }, end: { x: PAGE_WIDTH - MARGIN, y: ctx.y - height }, thickness: 0.5, color: ctx.colors.line });
    let lineY = ctx.y - 14;
    for (const line of lines) {
      ctx.page.drawText(line, { x: MARGIN + 7, y: lineY, size: 8.2, font: ctx.font, color: ctx.colors.dark });
      lineY -= 10;
    }
    centerText(ctx, String(item.quantity), 333, 365, ctx.y - 17, 8.2);
    centerText(ctx, String(item.months), 365, 402, ctx.y - 17, 8.2);
    rightText(ctx, money(item.monthlyPriceCents), 470, ctx.y - 17, 8.2, ctx.font);
    rightText(ctx, money(item.lineSubtotalCents), PAGE_WIDTH - MARGIN - 7, ctx.y - 17, 8.2, ctx.bold);
    ctx.y -= height;
  }
  ctx.y -= 10;
}

function tableHeader(ctx) {
  ensure(ctx, 28);
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 24, width: CONTENT_WIDTH, height: 24, color: ctx.colors.soft });
  const labels = [["DESCRIPCIÓN", MARGIN + 7], ["CANT.", 334], ["MESES", 368], ["PRECIO/MES", 411], ["TOTAL", 511]];
  for (const [label, x] of labels) ctx.page.drawText(label, { x, y: ctx.y - 15, size: 7, font: ctx.bold, color: ctx.colors.muted });
  ctx.y -= 24;
}

function totals(ctx, data) {
  const rows = [["Subtotal", data.subtotalCents]];
  if (data.discountCents > 0) rows.push([`Descuento ${formatPercent(data.discountBps)}`, -data.discountCents]);
  rows.push(["Base imponible", data.netCents], [`${data.taxName} ${formatPercent(data.taxRateBps)}`, data.taxCents]);
  ensure(ctx, rows.length * 17 + 35);
  for (const [label, value] of rows) {
    ctx.page.drawText(latin(label), { x: 345, y: ctx.y, size: 8.5, font: ctx.font, color: ctx.colors.muted });
    rightText(ctx, `${value < 0 ? "-" : ""}${money(Math.abs(value))}`, PAGE_WIDTH - MARGIN, ctx.y, 8.5, ctx.font);
    ctx.y -= 17;
  }
  ctx.page.drawLine({ start: { x: 345, y: ctx.y + 7 }, end: { x: PAGE_WIDTH - MARGIN, y: ctx.y + 7 }, thickness: 1, color: ctx.colors.teal });
  ctx.page.drawText("TOTAL", { x: 345, y: ctx.y - 9, size: 10, font: ctx.bold, color: ctx.colors.dark });
  rightText(ctx, money(data.totalCents), PAGE_WIDTH - MARGIN, ctx.y - 9, 12, ctx.bold, ctx.colors.teal);
  ctx.y -= 35;
}

function numbered(ctx, items) {
  items.forEach((item, index) => listItem(ctx, `${index + 1}.`, item));
  ctx.y -= 3;
}

function bulletList(ctx, items) {
  items.forEach((item) => listItem(ctx, "•", item));
  ctx.y -= 3;
}

function listItem(ctx, marker, text) {
  const rows = wrap(latin(text), ctx.font, 9.2, CONTENT_WIDTH - 32);
  ensure(ctx, rows.length * 12 + 7);
  ctx.page.drawText(marker, { x: MARGIN + 4, y: ctx.y, size: 9.2, font: ctx.bold, color: ctx.colors.dark });
  let y = ctx.y;
  for (const row of rows) {
    ctx.page.drawText(row, { x: MARGIN + 30, y, size: 9.2, font: ctx.font, color: ctx.colors.dark });
    y -= 12;
  }
  ctx.y = y - 6;
}

function legalParagraph(ctx, title, text) {
  const combined = `${title} ${text}`;
  const rows = wrap(latin(combined), ctx.font, 9.2, CONTENT_WIDTH);
  ensure(ctx, rows.length * 12 + 9);
  let y = ctx.y;
  for (let index = 0; index < rows.length; index += 1) {
    ctx.page.drawText(rows[index], { x: MARGIN, y, size: 9.2, font: index === 0 ? ctx.bold : ctx.font, color: ctx.colors.dark });
    y -= 12;
  }
  ctx.y = y - 8;
}

function signatureBlocks(ctx, data) {
  ensure(ctx, 150);
  const gap = 24;
  const width = (CONTENT_WIDTH - gap) / 2;
  const blocks = [
    { x: MARGIN, title: "POR EL EDITOR", name: "Marco Notarbartolo", role: "Director Canarias", note: "Aceptación del Editor" },
    { x: MARGIN + width + gap, title: "POR EL CLIENTE", name: data.legalSignerName, role: data.legalSignerRole, note: "Firma OTP pendiente" },
  ];
  for (const block of blocks) {
    ctx.page.drawText(block.title, { x: block.x, y: ctx.y, size: 9.5, font: ctx.bold, color: ctx.colors.teal });
    ctx.page.drawText(latin(`Nombre: ${block.name}`), { x: block.x, y: ctx.y - 25, size: 8.7, font: ctx.font, color: ctx.colors.dark, maxWidth: width });
    ctx.page.drawText(latin(`Cargo: ${block.role}`), { x: block.x, y: ctx.y - 42, size: 8.7, font: ctx.font, color: ctx.colors.dark, maxWidth: width });
    ctx.page.drawText(`Fecha: ${formatDate(data.generatedAt)}`, { x: block.x, y: ctx.y - 59, size: 8.7, font: ctx.font, color: ctx.colors.dark });
    ctx.page.drawLine({ start: { x: block.x, y: ctx.y - 104 }, end: { x: block.x + width, y: ctx.y - 104 }, thickness: 0.7, color: ctx.colors.line });
    ctx.page.drawText(block.note, { x: block.x, y: ctx.y - 117, size: 7.5, font: ctx.font, color: ctx.colors.muted });
  }
  ctx.y -= 145;
}

function drawFooter(ctx, page, pageNumber, pageCount) {
  page.drawLine({ start: { x: MARGIN, y: 50 }, end: { x: PAGE_WIDTH - MARGIN, y: 50 }, thickness: 0.6, color: ctx.colors.line });
  page.drawText(`Presupuesto ${latin(ctx.contract.quoteNumber)} · Contrato en español`, { x: MARGIN, y: 35, size: 6.6, font: ctx.font, color: ctx.colors.muted });
  rightText({ ...ctx, page }, `Página ${pageNumber} de ${pageCount}`, PAGE_WIDTH - MARGIN, 35, 6.6, ctx.font, ctx.colors.muted);
  page.drawText("CRMVLC · Plataforma propiedad de Canary 360 & Comunication SL", { x: MARGIN, y: 23, size: 5.7, font: ctx.font, color: ctx.colors.muted });
}

function centerText(ctx, value, left, right, y, size) {
  const width = ctx.font.widthOfTextAtSize(value, size);
  ctx.page.drawText(value, { x: left + ((right - left) - width) / 2, y, size, font: ctx.font, color: ctx.colors.dark });
}

function rightText(ctx, value, right, y, size, font, color = ctx.colors.dark) {
  ctx.page.drawText(value, { x: right - font.widthOfTextAtSize(value, size), y, size, font, color });
}

function wrap(value, font, size, maxWidth) {
  const words = String(value).split(/\s+/).filter(Boolean);
  const rows = [];
  let row = "";
  for (const word of words) {
    const candidate = row ? `${row} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) row = candidate;
    else {
      if (row) rows.push(row);
      row = word;
    }
  }
  if (row) rows.push(row);
  return rows.length ? rows : [""];
}

function paymentPlan(months, netCents) {
  const n = Number(months);
  const net = Number(netCents) || 0;
  if (n === 6) {
    const first = Math.round(net / 2);
    const second = net - first;
    return {
      summaryLine: `Pago en 2 cuotas de 3 salidas cada una, ${money(first)} antes de la salida n.º 1 y ${money(second)} antes de la salida n.º 4, impuestos excluidos.`,
      schedule: [
        `Cuota 1: ${money(first)} (imponible) antes de la salida n.º 1.`,
        `Cuota 2: ${money(second)} (imponible) antes de la salida n.º 4.`,
      ],
    };
  }
  if (n === 12) {
    const base = Math.floor(net / 4);
    const amounts = [base, base, base, net - base * 3];
    const marks = [1, 4, 7, 10];
    return {
      summaryLine: `Pago en 4 cuotas de 3 salidas cada una (antes de las salidas n.º 1, 4, 7 y 10), impuestos excluidos.`,
      schedule: amounts.map((amount, index) => `Cuota ${index + 1}: ${money(amount)} (imponible) antes de la salida n.º ${marks[index]}.`),
    };
  }
  return {
    summaryLine: `Pago único: 100 % del importe (${money(net)}, imponible) antes de la primera publicación.`,
    schedule: [`Pago único: ${money(net)} (imponible) antes de la salida n.º 1.`],
  };
}

function money(cents) {
  return `${(Number(cents) / 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR`;
}

function formatPercent(bps) {
  return `${(Number(bps) / 100).toLocaleString("es-ES", { maximumFractionDigits: 2 })} %`;
}

function formatDate(value) {
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00Z` : value);
  return new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function latin(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}
