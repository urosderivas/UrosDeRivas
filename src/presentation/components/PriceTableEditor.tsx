import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { MAX_TABLE_ROWS, PriceTable, parsePriceTable, tablePrice } from '../../domain/pricing';
import './PriceTableEditor.css';

/** Casilla vacía mientras el admin la rellena */
export type Cell = number | '';

export interface PriceTableDraft {
  byDays: boolean;
  rows: Cell[][];
  extra: Cell;
}

/** Ajusta cada fila al nº de columnas: añade casillas vacías o quita las de más. */
export function fitRows(rows: Cell[][], cols: number): Cell[][] {
  return rows.map(row => Array.from({ length: cols }, (_, i) => (i < row.length ? row[i] : '')));
}

/** La tabla lista para guardar, o null si falta alguna casilla. */
export function draftToTable(draft: PriceTableDraft, numDates: number): PriceTable | null {
  const cols = draft.byDays ? numDates : 1;
  const table = {
    byDays: draft.byDays,
    prices: fitRows(draft.rows, cols),
    extraAttendee: draft.extra,
  };
  return parsePriceTable(table, numDates);
}

interface Props {
  draft: PriceTableDraft;
  onChange: (draft: PriceTableDraft) => void;
  numDates: number;
  /** Otros eventos con tabla, para copiar sus precios */
  copySources: { id: string; title: string; table: PriceTable }[];
}

const parseCell = (value: string): Cell => (value === '' ? '' : Math.max(0, Number(value)));

/**
 * Editor de la tabla de precios: precio TOTAL por nº de asistentes (filas) y nº de días
 * (columnas), más una regla fija para cuando vienen más asistentes que filas tiene la tabla.
 */
export function PriceTableEditor({ draft, onChange, numDates, copySources }: Props) {
  const [quickPrice, setQuickPrice] = useState<Cell>('');
  const [testAttendees, setTestAttendees] = useState(3);
  const [testDays, setTestDays] = useState(1);
  // Lo que había en el otro modo, para recuperarlo si el admin vuelve a él
  const [otherMode, setOtherMode] = useState<PriceTableDraft | null>(null);

  const cols = draft.byDays ? numDates : 1;
  const rows = fitRows(draft.rows, cols);
  const set = (patch: Partial<PriceTableDraft>) => onChange({ ...draft, rows, ...patch });

  const setCell = (a: number, d: number, value: string) => {
    const next = rows.map(r => [...r]);
    next[a][d] = parseCell(value);
    set({ rows: next });
  };

  // Precio por asistente y día multiplicado: punto de partida para luego poner los descuentos a mano
  const quickFill = () => {
    if (quickPrice === '') return;
    const p = Number(quickPrice);
    set({
      rows: rows.map((_, a) => Array.from({ length: cols }, (_, d) => p * (a + 1) * (draft.byDays ? d + 1 : 1))),
      extra: p,
    });
  };

  // Los precios de un modo no valen en el otro (precio por días frente a evento
  // completo), así que se empieza con la tabla vacía y las mismas filas.
  const switchMode = (byDays: boolean) => {
    if (byDays === draft.byDays) return;
    setOtherMode(draft);
    onChange(otherMode && otherMode.byDays === byDays
      ? otherMode
      : { byDays, rows: draft.rows.map(() => []), extra: '' });
  };

  const copyFrom = (id: string) => {
    const source = copySources.find(s => s.id === id);
    if (!source) return;
    onChange({ byDays: source.table.byDays, rows: source.table.prices, extra: source.table.extraAttendee });
  };

  const table = draftToTable({ ...draft, rows }, numDates);
  const lastRow = rows.length;

  if (cols === 0) {
    return <p className="pte-hint">Añade primero las fechas: la tabla tiene una columna por cada día.</p>;
  }

  return (
    <div className="pte">
      <div className="pte-mode">
        <label>
          <input type="radio" checked={draft.byDays} onChange={() => switchMode(true)} />
          Precio según los días que elijan
        </label>
        <label>
          <input type="radio" checked={!draft.byDays} onChange={() => switchMode(false)} />
          Precio por evento completo (sin elegir días)
        </label>
      </div>

      <p className="pte-hint">
        Pon el precio <b>total</b> de cada combinación. Ejemplo: 2 asistentes y 3 días = 90 €.
      </p>

      <div className="pte-scroll">
        <table className="pte-table">
          <thead>
            <tr>
              <th>Asistentes</th>
              {draft.byDays
                ? Array.from({ length: cols }, (_, d) => <th key={d}>{d + 1} {d === 0 ? 'día' : 'días'}</th>)
                : <th>Evento completo</th>}
              <th aria-label="Quitar fila" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, a) => (
              <tr key={a}>
                <th>{a + 1}</th>
                {row.map((cell, d) => (
                  <td key={d}>
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={cell}
                      className={cell === '' ? 'pte-empty' : ''}
                      aria-label={`${a + 1} asistentes, ${draft.byDays ? `${d + 1} días` : 'evento completo'}`}
                      onChange={e => setCell(a, d, e.target.value)} />
                  </td>
                ))}
                <td>
                  {rows.length > 1 && a === rows.length - 1 && (
                    <button type="button" className="pte-remove" title="Quitar esta fila"
                      onClick={() => set({ rows: rows.slice(0, -1) })}><Trash2 size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length < MAX_TABLE_ROWS && (
        <button type="button" className="pte-add"
          onClick={() => set({ rows: [...rows, Array.from({ length: cols }, () => '' as Cell)] })}>
          + Añadir fila ({rows.length + 1} asistentes)
        </button>
      )}

      <div className="pte-extra">
        A partir de {lastRow + 1} asistentes: precio de {lastRow} {lastRow === 1 ? 'asistente' : 'asistentes'} +
        <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.extra}
          className={draft.extra === '' ? 'pte-empty' : ''}
          onChange={e => set({ extra: parseCell(e.target.value) })} />
        € por cada asistente más{draft.byDays ? ' y día' : ''}
      </div>

      <div className="pte-tools">
        <div className="pte-tool">
          <span>Rellenar rápido:</span>
          <input type="number" min="0" step="0.01" value={quickPrice} placeholder="20"
            onChange={e => setQuickPrice(parseCell(e.target.value))} />
          <span>€ por asistente{draft.byDays ? ' y día' : ''}</span>
          <button type="button" onClick={quickFill} disabled={quickPrice === ''}>Rellenar</button>
        </div>
        {copySources.length > 0 && (
          <div className="pte-tool">
            <span>Copiar precios de:</span>
            <select value="" onChange={e => copyFrom(e.target.value)}>
              <option value="">Elige un evento…</option>
              {copySources.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="pte-test">
        <span>Comprobar:</span>
        <input type="number" min="1" max="20" value={testAttendees}
          onChange={e => setTestAttendees(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
        <span>asistentes</span>
        {draft.byDays && (
          <>
            <input type="number" min="1" max={cols} value={Math.min(testDays, cols)}
              onChange={e => setTestDays(Math.min(cols, Math.max(1, Number(e.target.value) || 1)))} />
            <span>días</span>
          </>
        )}
        <b>= {table ? `${tablePrice(table, testAttendees, Math.min(testDays, cols))} €` : 'rellena todas las casillas'}</b>
      </div>
    </div>
  );
}
