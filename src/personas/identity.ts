export const PERSONA_ID_BY_FOLDER = {
  EMMA: 'P01',
  LILY: 'P02',
  MAYA: 'P03',
  NORA: 'P04',
  GRACE: 'P05',
  AVA: 'P06',
  CHLOE: 'P07',
  ISABELA: 'P08',
  CAMILA: 'P09',
  HANA: 'P10',
  ZOEY: 'P11',
  ELIANA: 'P12',
  JADE: 'P13',
  SOFIA: 'P14',
  MIA: 'P15',
  OLIVIA: 'P16',
} as const;

export type PersonaFolder = keyof typeof PERSONA_ID_BY_FOLDER;

export function personaIdFromFolder(folder: string): string {
  const id = PERSONA_ID_BY_FOLDER[folder.toUpperCase() as PersonaFolder];
  if (!id) throw new Error(`Unknown persona folder ${folder}`);
  return id;
}
