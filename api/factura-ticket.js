// api/factura-ticket.js
const { query } = require('./_utils/db'); // Importar la utilidad de DB

// Función para escapar HTML básico (VERSIÓN CORRECTA con entidades HTML)
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
         .toString()
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, """)
         .replace(/'/g, "'");
}


module.exports = async (req, res) => {
    // --- SOLO GET ---
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).send('Method Not Allowed');
    }

    // --- OBTENER ID DE VENTA ---
    const { id } = req.query;
    if (!id) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(400).send('Error: Falta el parámetro "id" (ID de Venta) en la URL.');
    }
    const saleId = id;
    console.log(`Generando factura ticket (nuevo formato) para Venta ID: ${saleId}`);

    try {
        // --- OBTENER DATOS ---
        // 1. Datos de la Empresa
        const companySql = "SELECT `NOMBRE EMPRESA`, `DIRECCION`, `RTN`, `TELEFONO`, `CORREO`, `PAGINA WEB` FROM `DATOS DE FACTURA` LIMIT 1";
        const companyResults = await query(companySql);
        if (companyResults.length === 0) throw new Error("No se encontraron datos de la empresa en DATOS DE FACTURA.");
        const companyData = companyResults[0];

        // 2. Datos de la Venta y Cliente
        const saleSql = `
            SELECT v.*, v.DESCUENTO as DESCUENTO_GLOBAL, c.CLIENTE, c.DIRECCION as DIRECCION_CLIENTE, c.TELEFONO as TELEFONO_CLIENTE
            FROM VENTA v
            LEFT JOIN CLIENTES c ON v.\`ID CLIENTE\` = c.\`ID CLIENTE\`
            WHERE v.\`ID VENTA\` = ?`;
        const saleResults = await query(saleSql, [saleId]);
        if (saleResults.length === 0) throw new Error(`Venta con ID ${saleId} no encontrada.`);
        const saleData = saleResults[0];
        const descuentoGlobalVenta = parseFloat(saleData.DESCUENTO_GLOBAL || 0);


        // 3. Detalles de la Venta y Productos
        const detailsSql = `
            SELECT d.*, p.\`NOMBRE PRODUCTO\`
            FROM \`DETALLE VENTA\` d
            LEFT JOIN PRODUCTO p ON d.ID_PRODUCTO = p.\`ID PRODUCTO\`
            WHERE d.\`ID VENTA\` = ?`;
        const detailsResults = await query(detailsSql, [saleId]);
        const detailsData = detailsResults;

        // --- PROCESAR Y CALCULAR ---
        let subTotalNetoCalculado = 0;     // Equivale a AppSheet SUB TOTAL
        let descuentoItemsCalculado = 0;    // Equivale a AppSheet TOTAL DESCUENTO
        let filasHtml = '';

        detailsData.forEach(item => {
            const cantidad = parseFloat(item.CANTIDAD || 0);
            const precioUnitario = parseFloat(item['PRECIO UNITARIO'] || 0);
            const descuentoItem = parseFloat(item.DESCUENTO || 0);
            const subtotalItemNeto = (cantidad * precioUnitario) - descuentoItem;

            descuentoItemsCalculado += descuentoItem;
            subTotalNetoCalculado += subtotalItemNeto;

            filasHtml += `
                <tr class="item">
                    <td>${escapeHtml(item['NOMBRE PRODUCTO'] || item.ID_PRODUCTO)}</td>
                    <td style="text-align: center;">${cantidad}</td>
                    <td style="text-align: right;">${precioUnitario.toFixed(2)}</td>
                    <td style="text-align: right;">${descuentoItem.toFixed(2)}</td>
                    <td style="text-align: right;">${subtotalItemNeto.toFixed(2)}</td>
                </tr>
            `;
        });

        // Calcular el Total Venta final (como en AppSheet)
        const totalVentaFinal = subTotalNetoCalculado - descuentoGlobalVenta;


        const fechaVenta = saleData['FECHA DE VENTA'] ? new Date(saleData['FECHA DE VENTA']).toLocaleDateString('es-ES') : 'N/A';
        const horaVenta = saleData['HORA VENTA'] || '';

        // --- CONSTRUIR HTML FINAL (SIN LOS COMENTARIOS INCRUSTADOS) ---
        const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factura ${escapeHtml(saleId)}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:0;background:#fff;color:#000;}
    .invoice-box{width:58mm;margin:0 auto;padding:5px;font-size:9.5px;line-height:1.2;color:#000;word-wrap:break-word;}
    .invoice-box table{width:100%;text-align:left;border-collapse:collapse;table-layout:fixed;}
    .invoice-box table td{padding:2px 0;vertical-align:top;word-wrap:break-word;}
    .invoice-box table tr.heading td{font-weight:bold;border-top:1px dashed #000;border-bottom:1px dashed #000;}
    .invoice-box table tr.item td{border-bottom:1px dashed #ddd; padding-top: 3px; padding-bottom: 3px;}
    .invoice-box table tr.total td:last-child{font-weight:bold;}
    .invoice-box table tr.total td, .invoice-box table tr.desc td {border-top:1px dashed #000; padding-top: 3px;}
    .centered-info, .message{text-align:center;margin:4px 0;}
    td:nth-child(1) { width: 35%; } /* Descrip */
    td:nth-child(2) { width: 15%; text-align: center; } /* Cant */
    td:nth-child(3) { width: 15%; text-align: right; } /* Prec */
    td:nth-child(4) { width: 15%; text-align: right; } /* Desc */
    td:nth-child(5) { width: 20%; text-align: right; } /* Total */
    tfoot td { padding-top: 3px; }

    @media print{
      @page {size: 58mm auto; margin: 0;}
      body{width:58mm;margin:0;padding:0;-webkit-print-color-adjust: exact;}
      .invoice-box{padding: 0;border:none;font-size:9.5px; box-shadow: none;}
      button { display: none; }
    }
  </style>
</head>
<body>
  <div class="invoice-box">
    <div class="centered-info">
      <strong id="empresa">${escapeHtml(companyData['NOMBRE EMPRESA'])}</strong><br>
      <span id="factdireccion">${escapeHtml(companyData['DIRECCION'])}</span><br>
      RTN: <span id="factrtn">${escapeHtml(companyData['RTN'])}</span><br>
      Tel: <span id="facttelefono">${escapeHtml(companyData['TELEFONO'])}</span><br>
      Correo: <span id="factcorreo">${escapeHtml(companyData['CORREO'])}</span><br>
      Web: <span id="factweb">${escapeHtml(companyData['PAGINA WEB'])}</span>
    </div>

    <div class="centered-info" id="codigo">RECIBO #${escapeHtml(saleId)}<br>${fechaVenta} ${horaVenta}</div>

    <div class="centered-info">
      Cliente: <span id="nomcliente">${escapeHtml(saleData['CLIENTE'] || 'N/A')}</span><br>
      <span id="direccioncliente">${escapeHtml(saleData['DIRECCION_CLIENTE'] || '')}</span><br>
      Tel: <span id="clietelefono">${escapeHtml(saleData['TELEFONO_CLIENTE'] || '')}</span>
    </div>

    {/* <!-- LOS COMENTARIOS STRAY SE HAN ELIMINADO DE AQUÍ --> */}

    <table>
      <thead>
        <tr class="heading">
          <td>Descrip</td>
          <td>Cant</td>
          <td>Prec</td>
          <td>Desc</td>
          <td>Total</td>
        </tr>
      </thead>
      <tbody id="filas">
        ${filasHtml}
      </tbody>
      <tfoot>
        <tr class="desc">
          <td colspan="4" style="text-align:right;">Sub-Total</td>
          <td id="subtotal" style="text-align: right;">${subTotalNetoCalculado.toFixed(2)}</td>
        </tr>
        <tr class="desc">
          <td colspan="4" style="text-align:right;">Descuento</td>
          <td id="impto" style="text-align: right;">${descuentoItemsCalculado.toFixed(2)}</td>
        </tr>
        ${descuentoGlobalVenta > 0 ? `
        <tr class="desc">
          <td colspan="4" style="text-align:right;">Desc. Global</td>
          <td style="text-align: right;">${descuentoGlobalVenta.toFixed(2)}</td>
        </tr>
        ` : ''}
        <tr class="total">
          <td colspan="4" style="text-align:right;">Total Venta</td>
          <td id="totalventa" style="text-align: right;">${totalVentaFinal.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>

    <div class="message">
      ¡Gracias por su compra!
    </div>
  </div>

  <script>
    // Script para imprimir (sin cambios)
    window.onload = function () {
      try {
          console.log('Intentando imprimir...');
          window.print();
      } catch(e) {
          console.error("Error al intentar imprimir:", e);
          document.body.innerHTML += '<p style="text-align:center; margin-top: 20px;">Error al iniciar impresión automática. Por favor, use la función de impresión de su navegador (Ctrl+P / Cmd+P).</p><button onclick="window.print()">Imprimir Manualmente</button>';
      }
    };
  </script>
</body>
</html>`;

        // --- ENVIAR RESPUESTA HTML ---
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(htmlContent);

    } catch (error) {
        // Captura de errores (sin cambios)
        console.error(`Error generando factura para ID ${saleId}:`, error);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(500).send(`
            <html><head><title>Error</title></head>
            <body style="font-family: sans-serif;">
                <h1>Error al generar la factura</h1>
                <p>No se pudo generar la factura para la venta ID: ${escapeHtml(saleId)}</p>
                <p><strong>Detalle del error:</strong> ${escapeHtml(error.message)}</p>
                <p>Por favor, contacte al soporte o verifique el ID de venta.</p>
            </body></html>
        `);
    }
};