/**
 * useColaAcciones — override de clasificación, confirmar/descartar y
 * aprobación de patrones para items de ClasificacionCola.
 *
 * Extraído de Clasificador.tsx (movido tal cual, sin cambios de
 * comportamiento) para reusarse también en el detalle de un ticket de
 * MOVI (pages/TicketsMovi.tsx) sin duplicar la lógica.
 */
import { useState } from 'react';
import type { ItemCola } from '../../lib/types';
import {
  confirmarItemCola, aprobarPatronesCola, descartarItemCola,
  getRamos, getSubramos,
} from '../../lib/api';
import type { OverrideState, PatronesSeleccion } from './ColaItemRow';

export function useColaAcciones(setItems: (updater: (prev: ItemCola[]) => ItemCola[]) => void) {
  const [overrides, setOverrides] = useState<Record<number, OverrideState>>({});
  const [overrideActivo, setOverrideActivo] = useState<number | null>(null);
  const [patronesAbiertos, setPatronesAbiertos] = useState<Set<number>>(new Set());
  const [patronesSeleccionados, setPatronesSeleccionados] = useState<Record<number, PatronesSeleccion>>({});
  const [guardandoPatrones, setGuardandoPatrones] = useState<number | null>(null);

  const abrirOverride = async (item: ItemCola) => {
    if (overrideActivo === item.id) { setOverrideActivo(null); return; }
    setOverrideActivo(item.id);
    if (overrides[item.id]) return;

    const compId = String(item.compania_id_prop ?? '');
    let ramos: { id: number; nombre: string }[] = [];
    let subramos: { id: number; nombre: string }[] = [];
    if (item.compania_id_prop) {
      ramos = await getRamos(item.compania_id_prop);
      if (item.ramo_id_prop) subramos = await getSubramos(item.ramo_id_prop);
    }
    setOverrides((prev) => ({
      ...prev,
      [item.id]: {
        companiaId: compId,
        ramoId: String(item.ramo_id_prop ?? ''),
        subramoId: String(item.subramo_id_prop ?? ''),
        ramos,
        subramos,
      },
    }));
  };

  const onCompaniaChange = async (itemId: number, cid: string) => {
    setOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], companiaId: cid, ramoId: '', subramoId: '', ramos: [], subramos: [] } }));
    if (!cid) return;
    const ramos = await getRamos(Number(cid));
    setOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ramos } }));
  };

  const onRamoChange = async (itemId: number, rid: string) => {
    setOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ramoId: rid, subramoId: '', subramos: [] } }));
    if (!rid) return;
    const subramos = await getSubramos(Number(rid));
    setOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], subramos } }));
  };

  const onSubramoChange = (itemId: number, sid: string) => {
    setOverrides((prev) => ({ ...prev, [itemId]: { ...prev[itemId], subramoId: sid } }));
  };

  const confirmarItem = async (item: ItemCola) => {
    const ov = overrides[item.id];
    const override = ov && ov.subramoId
      ? { compania_id: Number(ov.companiaId) || undefined, ramo_id: Number(ov.ramoId) || undefined, subramo_id: Number(ov.subramoId) }
      : undefined;
    try {
      const updated = await confirmarItemCola(item.id, override);
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      setOverrideActivo(null);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al confirmar');
    }
  };

  const descartar = async (id: number) => {
    if (!confirm('¿Descartar este PDF de la cola?')) return;
    await descartarItemCola(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const togglePatrones = (id: number, item: ItemCola) => {
    setPatronesAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
    // Inicializar selección con todos los patrones marcados
    if (!patronesSeleccionados[id] && item.patrones_generados) {
      setPatronesSeleccionados((prev) => ({
        ...prev,
        [id]: {
          compania: new Set(item.patrones_generados!.compania),
          ramo:     new Set(item.patrones_generados!.ramo),
          subramo:  new Set(item.patrones_generados!.subramo),
        },
      }));
    }
  };

  const togglePatron = (itemId: number, nivel: 'compania' | 'ramo' | 'subramo', patron: string) => {
    setPatronesSeleccionados((prev) => {
      const current = prev[itemId] ?? { compania: new Set(), ramo: new Set(), subramo: new Set() };
      const set = new Set(current[nivel]);
      if (set.has(patron)) set.delete(patron); else set.add(patron);
      return { ...prev, [itemId]: { ...current, [nivel]: set } };
    });
  };

  const guardarPatrones = async (item: ItemCola) => {
    const sel = patronesSeleccionados[item.id];
    if (!sel) return;
    setGuardandoPatrones(item.id);
    try {
      await aprobarPatronesCola(item.id, {
        compania: [...sel.compania],
        ramo:     [...sel.ramo],
        subramo:  [...sel.subramo],
      });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, patrones_guardados: true } : i)));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Error al guardar patrones');
    } finally {
      setGuardandoPatrones(null);
    }
  };

  return {
    overrides, overrideActivo, patronesAbiertos, patronesSeleccionados, guardandoPatrones,
    abrirOverride, onCompaniaChange, onRamoChange, onSubramoChange,
    confirmarItem, descartar, togglePatrones, togglePatron, guardarPatrones,
  };
}
