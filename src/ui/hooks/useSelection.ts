import { useState } from "react";

export type Selection =
  | { kind: "none" }
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string };

export function useSelection() {
  const [sel, setSel] = useState<Selection>({ kind: "none" });
  return { sel, setSel };
}
