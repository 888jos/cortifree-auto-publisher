import { googleFetch } from "./auth";

export const CORTIFREE_SHEET_ID = process.env.GOOGLE_SHEETS_CONTENT_DB_ID || "1XqgyMRj_jUU3FkKg4HzEORMz3Jl8pHpKuBrXkmfw4Qw";

export type SheetRow = Record<string, unknown>;

export async function readSheetRange(sheetName: string, range: string): Promise<unknown[][]> {
  const a1 = `${sheetName}!${range}`;
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${CORTIFREE_SHEET_ID}/values/${encodeURIComponent(a1)}`);
  url.searchParams.set("majorDimension", "ROWS");
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  const response = await googleFetch(url.toString());
  const body = await response.json() as { values?: unknown[][] };
  return body.values ?? [];
}

export async function readSheetObjects(sheetName: string, range = "A1:ZZ2000"): Promise<SheetRow[]> {
  const values = await readSheetRange(sheetName, range);
  if (!values.length) return [];
  const headers = values[0].map((value) => String(value ?? "").trim());
  return values.slice(1)
    .filter((row) => row.some((value) => value !== "" && value !== null && value !== undefined))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? null])));
}
