CREATE INDEX IF NOT EXISTS carousel_ideas_carousel_id_idx
ON public.carousel_ideas (carousel_id)
WHERE carousel_id IS NOT NULL;
