import { SubstanceType } from '../core/Substance';

export type SubstanceBag = Record<SubstanceType, number>;

export function emptyBag(): SubstanceBag {
  return {
    [SubstanceType.SOLID]: 0,
    [SubstanceType.LIQUID]: 0,
    [SubstanceType.GAS]: 0,
    [SubstanceType.DATA]: 0,
  };
}

export function bagSum(bag: SubstanceBag): number {
  return Object.values(bag).reduce((a, b) => a + b, 0);
}

export function addBag(a: SubstanceBag, b: SubstanceBag) {
  for (const k in a) {
    a[k as SubstanceType] += b[k as SubstanceType];
  }
}

export function scaleBag(src: SubstanceBag, k: number): SubstanceBag {
  const out = emptyBag();
  for (const s in src) {
    out[s as SubstanceType] = src[s as SubstanceType] * k;
  }
  return out;
}

export function takeFromBag(
  bag: SubstanceBag,
  amount: number
): SubstanceBag {
  const total = bagSum(bag);
  if (total <= 0) return emptyBag();

  const ratio = Math.min(1, amount / total);
  const taken = scaleBag(bag, ratio);

  for (const s in bag) {
    bag[s as SubstanceType] -= taken[s as SubstanceType];
  }

  return taken;
}
