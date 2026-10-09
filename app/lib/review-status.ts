/** Short French reason for a blocked draft. */
export function humanReason(error: string) {
  if (/MODELARK|AccountOverdue|overdue/i.test(error)) return "image à générer, ModelArk bloqué";
  if (/LOW_CONFIDENCE_ASSET|PERSONA_ASSET_REQUIRED|ASSET_PREFLIGHT/i.test(error)) return "aucune image assez proche dans la banque";
  if (/no credits|429|insufficient_quota/i.test(error)) return "crédit OpenAI épuisé";
  if (/GENERATION_BLOCKED/i.test(error)) return "texte refusé par les contrôles";
  return error ? error.slice(0, 90) : "raison inconnue";
}
