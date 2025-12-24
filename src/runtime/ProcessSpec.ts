import { SubstanceType } from '../core/Substance';
import { SubstanceBag } from './SubstanceBag';

export interface ProcessSpec {
  // 输入 → 输出的产率矩阵
  // 例如：LIQUID → GAS = 0.8
  yield: Partial<Record<SubstanceType, Partial<Record<SubstanceType, number>>>>;
}

export function applyProcess(
  input: SubstanceBag,
  spec: ProcessSpec
): SubstanceBag {
  const out: SubstanceBag = {
    solid: 0,
    liquid: 0,
    gas: 0,
    data: 0,
  };

  for (const inType in input) {
    const amount = input[inType as SubstanceType];
    if (amount <= 0) continue;

    const map = spec.yield[inType as SubstanceType];
    if (!map) continue;

    for (const outType in map) {
      out[outType as SubstanceType] += amount * map[outType as SubstanceType]!;
    }
  }

  return out;
}
