// api/factura-ticket.js
const { query } = require('./_utils/db');

function escapeHtml(unsafe) {
    // (Función escapeHtml correcta con entidades &, <, etc.)
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
         .toString()
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/"/g, "")
         .replace(/'/g, "'");
}

module.exports = async (req, res) => {
    // ... (Manejo GET y obtención de saleId sin cambios) ...
    if (req.method !== 'GET') { /* ... */ }
    const { id } = req.query;
    if (!id) { /* ... */ }
    const saleId = id;
    console.log(`Generando factura ticket (Lógica AppSheet Final) para Venta ID: ${saleId}`);


    try {
        // --- OBTENER DATOS ---
        // 1. Datos Empresa (sin cambios)
        const companySql = "SELECT `NOMBRE EMPRESA`, `DIRECCION`, `RTN`, `TELEFONO`, `CORREO`, `PAGINA WEB` FROM `DATOS DE FACTURA` LIMIT 1";
        const companyResults = await query(companySql);
        if (companyResults.length === 0) throw new Error("No se encontraron datos de la empresa.");
        const companyData = companyResults[0];

        // 2. Datos Venta/Cliente (Incluyendo DESCUENTO global)
        const saleSql = `
            SELECT
                v.*,
                v.DESCUENTO as DESCUENTO_GLOBAL, {/* Obtener descuento de VENTA */}
                c.CLIENTE,
                c.DIRECCION as DIRECCION_CLIENTE,
                c.TELEFONO as TELEFONO_CLIENTE
            FROM VENTA v
            LEFT JOIN CLIENTES c ON v.\`ID CLIENTE\` = c.\`ID CLIENTE\`
            WHERE v.\`ID VENTA\` = ?`;
        const saleResults = await query(saleSql, [saleId]);
        if (saleResults.length === 0) throw new Error(`Venta con ID ${saleId} no encontrada.`);
        const saleData = saleResults[0];
        const descuentoGlobalVenta = parseFloat(saleData.DESCUENTO_GLOBAL || 0);

        // 3. Detalles Venta/Productos (sin cambios)
        const detailsSql = `
            SELECT d.*, p.\`NOMBRE PRODUCTO\`
            FROM \`DETALLE VENTA\` d
            LEFT JOIN PRODUCTO p ON d.ID_PRODUCTO = p.\`ID PRODUCTO\`
            WHERE d.\`ID VENTA\` = ?`;
        const detailsResults = await query(detailsSql, [saleId]);
        const detailsData = detailsResults;

        // --- PROCESAR Y CALCULAR (Alineado con AppSheet) ---
        let subTotalNetoCalculado = 0;     // Suma de totales de línea netos (AppSheet SUB TOTAL)
        let descuentoItemsCalculado = 0;    // Suma de descuentos de items (AppSheet TOTAL DESCUENTO)
        let filasHtml = '';

        detailsData.forEach(item => {
            const cantidad = parseFloat(item.CANTIDAD || 0);
            const precioUnitario = parseFloat(item['PRECIO UNITARIO'] || 0);
            const descuentoItem = parseFloat(item.DESCUENTO || 0);
            const subtotalItemNeto = (cantidad * precioUnitario) - descuentoItem;

            descuentoItemsCalculado += descuentoItem;
            subTotalNetoCalculado += subtotalItemNeto;

            // Crear fila HTML (5 columnas)
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

        // --- CONSTRUIR HTML FINAL (CON PIE DE PÁGINA CORREGIDO) ---
        const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
    {/* ... (head y style sin cambios) ... */}
     <style>
        /* ... (COPIA LOS ESTILOS COMPLETOS DE TU VERSIÓN ANTERIOR AQUÍ) ... */
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
    {/* ... (Info empresa, recibo, cliente sin cambios) ... */}
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
        {/* --- PIE DE PÁGINA CORREGIDO --- */}
        <tr class="desc">
          <td colspan="4" style="text-align:right;">Sub-Total:</td>
          {/* Muestra la suma de los totales NETOS por línea */}
          <td id="subtotal" style="text-align: right;">${subTotalNetoCalculado.toFixed(2)}</td>
        </tr>
        <tr class="desc">
          <td colspan="4" style="text-align:right;">Descuento Items:</td>
          {/* Muestra la suma de los descuentos aplicados a cada ITEM */}
          <td id="impto" style="text-align: right;">${descuentoItemsCalculado.toFixed(2)}</td>
        </tr>
        {/* YA NO MOSTRAMOS LA LÍNEA DE DESCUENTO GLOBAL EXPLÍCITAMENTE */}
        <tr class="total">
          <td colspan="4" style="text-align:right;">Total Venta:</td>
          {/* Muestra el total FINAL (SubTotalNeto - DescuentoGlobal) */}
          <td id="totalventa" style="text-align: right;">${totalVentaFinal.toFixed(2)}</td>
        </tr>
         {/* --- FIN PIE DE PÁGINA CORREGIDO --- */}
      </tfoot>
    </table>

    <div class="message">
      ¡Gracias por su compra!
    </div>
  </div>

  <script>
    {/* ... (script de impresión sin cambios) ... */}
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
        // ... (manejo de errores sin cambios) ...
         console.error(`Error generando factura para ID ${saleId}:`, error);
        res.status(500).send(`... HTML de error ...`);
    }
};