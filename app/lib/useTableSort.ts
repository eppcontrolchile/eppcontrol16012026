//app/lib/useTableSort.ts

import { useMemo, useState } from "react";

type Dir = "asc" | "desc";

export function useTableSort<T extends Record<string, any>>(rows: T[]) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<Dir>("asc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;

    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];

      // números
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }

      // fechas ISO / parseables
      const ad = new Date(String(av));
      const bd = new Date(String(bv));
      const adOk = !Number.isNaN(ad.getTime());
      const bdOk = !Number.isNaN(bd.getTime());
      if (adOk && bdOk) {
        return sortDir === "asc" ? ad.getTime() - bd.getTime() : bd.getTime() - ad.getTime();
      }

      // strings
      return sortDir === "asc"
        ? String(av ?? "").localeCompare(String(bv ?? ""))
        : String(bv ?? "").localeCompare(String(av ?? ""));
    });

    return arr;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: keyof T) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const indicator = (key: keyof T) =>
    sortKey === key ? (sortDir === "asc" ? "▲" : "▼") : "";

  return { sorted, sortKey, sortDir, toggleSort, indicator };
}
