import { useMemo, useState } from "react";
import type { ProductVersion, View } from "./data";
import type { StoredCarousel } from "./types";
import { getJsonOk, postJson, useApi } from "./use-api";

// Stored carousels for the Carrousels and Edit tabs, plus the human review modal.
export function useCarouselLibrary(active: View, productVersion: ProductVersion, setNotice: (notice: string) => void) {
  const [storedCarousels, setStoredCarousels] = useState<StoredCarousel[]>([]);
  const [carouselQuery, setCarouselQuery] = useState("");
  const [carouselStatus, setCarouselStatus] = useState("ALL");
  const [carouselFormat, setCarouselFormat] = useState("ALL");
  const [openedCarousel, setOpenedCarousel] = useState<StoredCarousel | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  const filteredCarousels = useMemo(() => {
    const query = carouselQuery.trim().toLowerCase();
    return storedCarousels.filter((carousel) =>
      carousel.status !== "ARCHIVED"
      && (carouselStatus === "ALL" || carousel.status === carouselStatus)
      && (carouselFormat === "ALL" || carousel.content_type === carouselFormat || carousel.spec?.model_id === carouselFormat)
      && (!query || `${carousel.id} ${carousel.topic} ${carousel.angle} ${carousel.spec?.hook ?? ""}`.toLowerCase().includes(query)),
    );
  }, [carouselQuery, carouselStatus, carouselFormat, storedCarousels]);

  const carouselsLoading = useApi(
    (active === "Carrousels" || active === "Edit") && productVersion === "current",
    [active, productVersion],
    async () => {
      const data = await getJsonOk("/api/carousels");
      setStoredCarousels(Array.isArray(data.carousels) ? data.carousels : []);
    },
    () => setNotice("Impossible de charger les carrousels CortiFree."),
  );

  async function refreshCarousels() {
    const data = await getJsonOk("/api/carousels");
    const list = Array.isArray(data.carousels) ? data.carousels : [];
    setStoredCarousels(list);
    if (openedCarousel) setOpenedCarousel(list.find((item: StoredCarousel) => item.id === openedCarousel.id) ?? null);
  }

  async function submitReviewAction(action: "approve" | "reject" | "request-changes") {
    if (!openedCarousel || reviewBusy) return;
    if (action !== "approve" && !reviewFeedback.trim()) {
      setNotice("Ajoute une instruction avant d’envoyer la correction.");
      return;
    }
    setReviewBusy(true);
    try {
      const endpoint = action === "approve" ? "/api/review/approve" : action === "reject" ? "/api/review/reject" : "/api/review/request-changes";
      const body = action === "approve"
        ? { carouselId: openedCarousel.id, actor: "jos" }
        : action === "reject"
          ? { carouselId: openedCarousel.id, reason: reviewFeedback.trim(), actor: "jos" }
          : { carouselId: openedCarousel.id, feedback: reviewFeedback.trim(), actor: "jos" };
      const response = await postJson(endpoint, body);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `API ${response.status}`);
      setNotice(action === "approve"
        ? `${openedCarousel.id} approuvé · ajouté au backlog Planning.`
        : action === "reject"
          ? `${openedCarousel.id} rejeté.`
          : `${openedCarousel.id} · correction ciblée envoyée au worker Railway.`);
      if (action !== "request-changes") setReviewFeedback("");
      await refreshCarousels();
    } catch (error) {
      setNotice(`Review impossible : ${error instanceof Error ? error.message : "erreur inconnue"}.`);
    } finally {
      setReviewBusy(false);
    }
  }

  return {
    storedCarousels, filteredCarousels, carouselsLoading,
    carouselQuery, setCarouselQuery, carouselStatus, setCarouselStatus, carouselFormat, setCarouselFormat,
    openedCarousel, setOpenedCarousel, reviewFeedback, setReviewFeedback, reviewBusy, submitReviewAction,
  };
}

export type CarouselLibrary = ReturnType<typeof useCarouselLibrary>;
