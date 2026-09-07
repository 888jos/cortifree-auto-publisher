import type { AssetAnalysisMetadata } from "./types";

export interface AssetAnalyzer {
  analyze(input: { assetId: string; imageUrl: string }): Promise<AssetAnalysisMetadata>;
}

// Intentionally not activated yet. This boundary allows one-time Luna vision tagging later.
export class AssetAnalysisNotEnabled implements AssetAnalyzer {
  async analyze(): Promise<AssetAnalysisMetadata> {
    throw new Error("Asset analysis is not enabled");
  }
}
