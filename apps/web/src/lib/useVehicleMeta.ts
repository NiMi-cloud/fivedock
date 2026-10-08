import { XmlEditError, analyzeVehiclePack, readHandlings, readSirenSettings, readVariation, readVehicle } from '@toolkit/forge-core';
import type { PackFiles } from '@toolkit/forge-core';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type MetaSlot = 'vehicles' | 'handling' | 'variations' | 'carcols';

export interface MetaDoc {
  path: string;
  original: string;
  text: string;
}

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder();

interface Located {
  path: string;
  text: string;
}

/** Sucht in den Dateien die vier Meta-Dateien, die zu diesem Fahrzeug gehören. */
function locate(files: PackFiles | null, model: string | null): Record<MetaSlot, Located | null> {
  const none: Record<MetaSlot, Located | null> = { vehicles: null, handling: null, variations: null, carcols: null };
  if (!files || !model) return none;
  const metas = analyzeVehiclePack(files).metas.map((m) => ({ kind: m.kind, path: m.path, text: decoder.decode(m.bytes) }));
  const safe = <T,>(fn: () => T): T | null => {
    try {
      return fn();
    } catch {
      return null;
    }
  };

  const vehicles = metas.find((m) => m.kind === 'vehicles' && safe(() => readVehicle(m.text, model)));
  const vehicle = vehicles ? safe(() => readVehicle(vehicles.text, model)) : null;
  const handlingId = vehicle?.texts['handlingId'] ?? '';
  const handling = metas.find((m) => m.kind === 'handling' && safe(() => readHandlings(m.text).some((h) => h.name.toLowerCase() === handlingId.toLowerCase())));
  const variations = metas.find((m) => m.kind === 'variations' && safe(() => readVariation(m.text, model)));
  const sirenId = variations ? (safe(() => readVariation(variations.text, model))?.sirenSettings ?? 0) : 0;
  const carcols =
    metas.find((m) => m.kind === 'carcols' && sirenId !== 0 && safe(() => readSirenSettings(m.text).some((s) => s.id === sirenId))) ??
    metas.find((m) => m.kind === 'carcols');

  const pick = (m: { path: string; text: string } | undefined): Located | null => (m ? { path: m.path, text: m.text } : null);
  return { vehicles: pick(vehicles), handling: pick(handling), variations: pick(variations), carcols: pick(carcols) };
}

/**
 * Die Meta-Dateien eines Fahrzeugs (vehicles, handling, carvariations, carcols) zum Bearbeiten. Änderungen laufen über `apply`,
 * das eine Funktion `(Text) → neuer Text` bekommt. Wirft sie einen Fehler, bleibt der Text unverändert und `apply` gibt die Meldung zurück.
 */
export function useVehicleMeta(files: PackFiles | null, model: string | null) {
  const [edited, setEdited] = useState<Record<string, string>>({});
  /** Dateien, die es im Paket nicht gab und die neu angelegt wurden (zum Beispiel eine carcols.meta). */
  const [created, setCreated] = useState<Partial<Record<MetaSlot, Located>>>({});
  const located = useMemo(() => locate(files, model), [files, model]);
  const found = useMemo(() => ({ ...located, ...Object.fromEntries(Object.entries(created).filter(([slot]) => !located[slot as MetaSlot])) }) as Record<MetaSlot, Located | null>, [located, created]);

  // Neue Dateien oder ein anderes Fahrzeug: Änderungen verwerfen.
  useEffect(() => {
    setEdited({});
    setCreated({});
  }, [files, model]);

  const docs = useMemo(() => {
    const out = {} as Record<MetaSlot, MetaDoc | null>;
    for (const slot of ['vehicles', 'handling', 'variations', 'carcols'] as const) {
      const f = found[slot];
      out[slot] = f ? { path: f.path, original: created[slot] && !located[slot] ? '' : f.text, text: edited[f.path] ?? f.text } : null;
    }
    return out;
  }, [found, edited, created, located]);

  const apply = useCallback(
    (slot: MetaSlot, change: (text: string) => string): string | null => {
      const doc = docs[slot];
      if (!doc) return 'Datei nicht gefunden.';
      try {
        const next = change(doc.text);
        setEdited((prev) => ({ ...prev, [doc.path]: next }));
        return null;
      } catch (e) {
        return e instanceof XmlEditError || e instanceof Error ? e.message : String(e);
      }
    },
    [docs],
  );

  /** Legt eine Datei an, die es im Paket nicht gab. */
  const create = useCallback((slot: MetaSlot, path: string, text: string) => {
    setCreated((prev) => ({ ...prev, [slot]: { path, text } }));
  }, []);

  const reset = useCallback(
    (slot: MetaSlot) => {
      const doc = docs[slot];
      if (!doc) return;
      setEdited((prev) => {
        const next = { ...prev };
        delete next[doc.path];
        return next;
      });
    },
    [docs],
  );

  /** Geänderte Dateien als Bytes, Pfad → Inhalt. */
  const changedFiles = useMemo(() => {
    const out: Record<string, Uint8Array> = {};
    for (const slot of ['vehicles', 'handling', 'variations', 'carcols'] as const) {
      const d = docs[slot];
      if (d && d.text !== d.original) out[d.path] = encoder.encode(d.text);
    }
    return out;
  }, [docs]);

  const changed = useMemo(() => {
    const out = {} as Record<MetaSlot, boolean>;
    for (const slot of ['vehicles', 'handling', 'variations', 'carcols'] as const) out[slot] = !!docs[slot] && docs[slot]!.text !== docs[slot]!.original;
    return out;
  }, [docs]);

  return { docs, apply, reset, create, changedFiles, changed };
}
