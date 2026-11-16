import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import { PDFParse } from 'pdf-parse';
import leerExcel from 'read-excel-file/node';

const esperados = JSON.parse(await readFile('.tmp/a14-esperados.json', 'utf8'));
const campos = [
  ['ventasNetas', 'Ventas netas', 'ventaNeta'],
  ['dineroRecibido', 'Dinero recibido', 'cobrado'],
  ['gastosComerciales', 'Gastos comerciales', 'gasto'],
  ['perdidasInventario', 'Pérdidas de inventario', 'perdida'],
];

function diaComercial(iso) {
  const fecha = new Date(iso);
  const dia = new Date(fecha.getTime() - 5 * 3_600_000)
    .toISOString()
    .slice(0, 10);
  assert.equal(fecha.getTime(), Date.parse(`${dia}T00:00:00-05:00`));
  return dia;
}

function criterios(tenantId, tamano = 'tipico') {
  assert(['tipico', 'grande'].includes(tamano));
  const registro = esperados.find((entrada) => entrada.tenantId === tenantId);
  const periodo = registro?.periodos[tamano === 'tipico' ? 0 : 1];
  assert(periodo, `Faltan los importes esperados del tenant ${tenantId}`);
  const desde = diaComercial(periodo.desde);
  const hasta = diaComercial(periodo.hasta);
  return {
    periodo,
    desde,
    hasta,
    query: new URLSearchParams({ desde, hasta }),
  };
}

function conciliar(actual, esperado, campo) {
  assert(actual !== undefined, `Falta ${campo}`);
  assert(
    new Prisma.Decimal(actual).eq(esperado),
    `${campo}: ${actual} ≠ ${esperado}`,
  );
}

export default {
  finanzas: (tenantId) => `/finanzas/resumen?${criterios(tenantId).query}`,
  excel: (tenantId, tamano) =>
    `/exportaciones/finanzas/xlsx?${criterios(tenantId, tamano).query}`,
  pdf: (tenantId, tamano) =>
    `/exportaciones/finanzas/pdf?${criterios(tenantId, tamano).query}`,

  validarReporte({ tenantId, json }) {
    const { periodo } = criterios(tenantId);
    for (const [campo, , esperado] of campos)
      conciliar(json[campo], periodo[esperado], campo);
  },

  async validarArchivo({ tenantId, modo, tamano, bytes }) {
    const { periodo, desde, hasta } = criterios(tenantId, tamano);
    if (modo === 'excel') {
      const hojas = await leerExcel(bytes);
      const filtros = new Map(
        hojas.find(({ sheet }) => sheet === 'Filtros')?.data,
      );
      const finanzas = new Map(
        hojas.find(({ sheet }) => sheet === 'Finanzas')?.data,
      );
      assert.equal(filtros.get('Desde'), desde);
      assert.equal(filtros.get('Hasta (exclusivo)'), hasta);
      for (const [, etiqueta, esperado] of campos) {
        conciliar(finanzas.get(etiqueta), periodo[esperado], etiqueta);
      }
      return;
    }
    assert.equal(modo, 'pdf');
    const lector = new PDFParse({ data: bytes });
    try {
      const { text } = await lector.getText();
      assert(text.includes(desde) && text.includes(hasta));
      for (const [, etiqueta, esperado] of campos) {
        const dato = text.match(
          new RegExp(
            `${etiqueta}\\s*\\|\\s*Importe\\s*·\\s*(-?\\d+(?:\\.\\d+)?)`,
          ),
        );
        conciliar(dato?.[1], periodo[esperado], etiqueta);
      }
    } finally {
      await lector.destroy();
    }
  },
};
