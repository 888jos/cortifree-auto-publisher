"use client";

import { useEffect, useState } from "react";
import "./image-studio.css";
import type { ProductVersion, View } from "./_home/data";
import { AssetLibraryPanel, AssetLibraryStats } from "./_home/panels/asset-library";
import { CalendarPanel } from "./_home/panels/calendar";
import { CarouselReviewModal } from "./_home/panels/carousel-review-modal";
import { CarouselsPanel } from "./_home/panels/carousels";
import { ContentStudioPanel } from "./_home/panels/content-studio";
import { EditPanel } from "./_home/panels/edit";
import { FormatsPanel } from "./_home/panels/formats";
import { HookLibraryPanel } from "./_home/panels/hook-library";
import { ImageBatchModal, ImageGeneratorModal } from "./_home/panels/image-modals";
import { NextVersionPanel } from "./_home/panels/next-version";
import { OverviewPanel } from "./_home/panels/overview";
import { SettingsPanel } from "./_home/panels/settings";
import { Sidebar } from "./_home/panels/sidebar";
import { useAssetLibrary } from "./_home/use-asset-library";
import { useCarouselLibrary } from "./_home/use-carousel-library";
import { useHealth } from "./_home/use-health";
import { useHookLibrary } from "./_home/use-hook-library";
import { useImageGeneration } from "./_home/use-image-generation";
import { useAiSettings, useCalendar, useOpsOverview } from "./_home/use-operations";
import { useStudio } from "./_home/use-studio";

// Studio home. Each tab's state lives in a hook owned here (so it survives tab
// switches) and is rendered by its panel in ./_home/panels.
export default function Home() {
  const [active, setActive] = useState<View>("Carrousels");
  const [productVersion, setProductVersion] = useState<ProductVersion>("current");
  const [notice, setNotice] = useState("Vérification de l’infrastructure CortiFree…");

  useEffect(() => {
    const saved = window.localStorage.getItem("cortifree-product-version");
    if (saved === "next") setProductVersion("next");
  }, []);

  const studio = useStudio(setActive, setNotice);
  const hooks = useHookLibrary(studio, setNotice);
  const { dryRun, healthStatus } = useHealth(setNotice);
  const library = useCarouselLibrary(active, productVersion, setNotice);
  const calendar = useCalendar(active, setNotice);
  const { opsOverview, opsLoading } = useOpsOverview(active, setNotice);
  const { aiStatus, aiUsage } = useAiSettings(active, setNotice);
  const assets = useAssetLibrary(active, setNotice);
  const images = useImageGeneration(assets, setNotice);

  function changeProductVersion(version: ProductVersion) {
    setProductVersion(version);
    window.localStorage.setItem("cortifree-product-version", version);
    if (version === "current") setActive("Carrousels");
  }

  return (
    <main className="shell">
      <Sidebar active={active} changeProductVersion={changeProductVersion} productVersion={productVersion} setActive={setActive} />

      <section className="content">
        {productVersion === "next" ? (
          <NextVersionPanel changeProductVersion={changeProductVersion} />
        ) : <>
        <header>
          <div>
            <p className="eyebrow">CONTENT OPERATIONS</p>
            <h1>{active === "Overview" ? "Pilotage" : active}</h1>
            <p className="muted">{active === "Carrousels" ? "Retrouve tous les carrousels générés et leurs slides finales." : active === "Formats" ? "Les 8 formats canoniques réellement utilisés par le renderer et le Studio." : "Choisis un concept éditorial, puis le format F01–F08 qui le sert le mieux."}</p>
          </div>
          <button
            className="primary"
            disabled={studio.isCreating}
            onClick={active === "Content studio" ? studio.create : () => setActive("Content studio")}
            type="button"
          >
            {active === "Content studio" ? (studio.isCreating ? "Création..." : "Créer ce brouillon") : "Créer un carrousel"}
          </button>
        </header>

        <div className={`notice ${healthStatus?.productionReady ? "ready" : healthStatus ? "blocked" : "checking"}`}>
          <span className="pulse" />
          {notice}
          <span className="dry">{dryRun === null ? "VERIFICATION" : dryRun ? "DRY RUN" : "MODE REEL"}</span>
        </div>

        {studio.lastDraftId && <div className="draftBadge">Dernier brouillon cree : {studio.lastDraftId}</div>}

        {active === "Carrousels" && <CarouselsPanel library={library} />}
        {active === "Content studio" && <ContentStudioPanel images={images} setActive={setActive} studio={studio} />}
        {active === "Edit" && <EditPanel library={library} />}
        {active === "Overview" && <OverviewPanel openType={studio.openType} opsLoading={opsLoading} opsOverview={opsOverview} />}
        {active === "Formats" && <FormatsPanel pickModel={studio.pickModel} />}
        {active === "Hook library" && <HookLibraryPanel hooks={hooks} studio={studio} />}
        {active === "Asset library" && <AssetLibraryStats library={assets} />}

        <div className="grid">
          {active === "Asset library" && <AssetLibraryPanel images={images} library={assets} />}
          {active === "Calendar" && <CalendarPanel {...calendar} />}
          {active === "Settings" && <SettingsPanel aiStatus={aiStatus} aiUsage={aiUsage} dryRun={dryRun} healthStatus={healthStatus} />}
        </div>
        {library.openedCarousel && <CarouselReviewModal library={library} />}
        {images.imageModalOpen && <ImageGeneratorModal images={images} library={assets} />}
        {images.batchModalOpen && <ImageBatchModal images={images} library={assets} />}
        </>}
      </section>
    </main>
  );
}
