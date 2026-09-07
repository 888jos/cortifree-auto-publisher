# Audit initial du Drive CortiFree — 2026-09-05

Source inspectée : `/Users/jos/Library/CloudStorage/GoogleDrive-jossel1.biot1@gmail.com/Mon Drive/CORTIFREE_CONTENT`.

## Structure détectée

Présents : `01_STOCK_ASSETS ` (espace final), `02_PERSONAS ` (espace final), `03_TEMPLATES`, `04_IN_PROGRESS`, `05_READY_TO_POST`, `06_POSTED`, `07_WINNERS`, `08_ARCHIVE`, `10_PERSONA_CONFIG`.

Absent : `09_VISUAL_REFERENCES`.

Le scanner normalise uniquement la comparaison des noms (`trim`) et conserve le chemin exact. Aucun renommage n’a été effectué.

## Personas et assets

- 16 dossiers persona détectés : AVA, CAMILA, CHLOE, ELIANA, EMMA, GRACE, HANA, ISABELLA, JADE, LILY, MAYA, MIA, NORA, OLIVIA, SOFIA, ZOEY.
- 16 configs `P01_*.json` à `P16_*.json` + `ALL_PERSONAS.json` présents.
- 15 MASTER image files accessibles : AVA, CAMILA, CHLOE, ELIANA, GRACE, HANA, ISABELLA, JADE, LILY, MAYA, MIA, NORA, OLIVIA, SOFIA, ZOEY.
- `EMMA/00_MASTER` est vide : MASTER manquant.
- Les dossiers lifestyle et références persona sont vides au niveau inspecté.
- Les catégories stock détectées sont `fitness`, `food`, `morning`, `night`, `outdoors`, `self_care`, `stress_reset`, `work_study`.
- Le total global de fichiers stock est **UNVERIFIED** : Google Drive File Provider expose des répertoires avec environ 65 535 entrées et certaines traversées ont expiré/incohéré (`fts_read: Operation timed out`). Il faut resynchroniser ou utiliser l’API Drive avant de communiquer un total définitif.

## Templates déjà présents

`03_TEMPLATES` contient `routine`, `fullscreen_hook`, `listicle`, `photo_text`, `checklist`. Les golden templates du moteur sont codés et extensibles dans `src/templates/registry.ts`; aucun fichier Drive n’a été modifié.

## Cocorise

Le repo Cocorise et une intégration Upload-Post exploitable n’ont pas été localisés dans les chemins de travail inspectés. Upload-Post, Supabase, scheduler, Telegram et cron sont donc **UNVERIFIED** côté Cocorise. Le projet CortiFree n’ajoute aucune dépendance runtime vers Cocorise.

## Blockers réels

1. Restaurer/synchroniser le contenu des dossiers stock pour obtenir le compte réel et sélectionner des assets lifestyle utilisables.
2. Ajouter le MASTER EMMA ou choisir explicitement une autre persona pour les premiers tests.
3. Créer séparément le projet Supabase/Vercel et fournir les credentials quand le Milestone Publisher sera autorisé.
