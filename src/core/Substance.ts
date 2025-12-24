export enum SubstanceType {
  SOLID = 'solid',
  LIQUID = 'liquid',
  GAS = 'gas',
  DATA = 'data',
}

export const SubstanceColor: Record<SubstanceType, number> = {
  [SubstanceType.SOLID]: 0x8b5a2b,
  [SubstanceType.LIQUID]: 0x3b82f6,
  [SubstanceType.GAS]: 0x22c55e,
  [SubstanceType.DATA]: 0xa855f7,
};
