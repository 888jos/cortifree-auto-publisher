import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIClient, withRetry } from "./openai-client";
import type { TokenUsage } from "./types";

const token = z.string().trim().min(1).max(120);
const tokenList = z.array(token).max(16);

// This schema is intentionally about observable pixels. Existing filenames,
// folders, tags and categories are never sent to the model as context.
export const stockAssetVisionSchema = z.object({
  asset_name: z.string().trim().regex(/^[A-Z0-9_]{12,120}$/),
  visual_description: z.string().trim().min(35).max(700),
  visible_actions: tokenList,
  visible_objects: tokenList,
  setting: token,
  people_visibility: z.enum(["no_person", "hands_only", "legs_only", "partial_body", "full_person", "multiple_people", "shadow_only", "reflection"]),
  body_parts_visible: tokenList,
  framing: token,
  camera_angle: token,
  lighting: token,
  composition: tokenList.min(1),
  specific_details: tokenList,
  dominant_colors: tokenList.max(8),
  text_in_image: z.string().trim().min(1).max(240),
  mood: token,
  good_for: tokenList,
  avoid_for: tokenList,
});

export type StockAssetVision = z.infer<typeof stockAssetVisionSchema>;

export class OpenAIStockAssetAnalyzer {
  constructor(private readonly model: string, private readonly timeoutMs = 45_000) {}

  async analyze(imageUrl: string, retryHint?: string): Promise<{ data: StockAssetVision; usage: TokenUsage }> {
    const client = getOpenAIClient();
    return withRetry(async () => {
      const response = await client.responses.parse({
        model: this.model,
        instructions: [
          "Inspect the supplied image pixels directly. Do not infer facts from filenames, folders, tags, or any hidden metadata.",
          "Return only visibly observable details. Do not identify people or infer health, ethnicity, personality, identity, or off-camera context.",
          "asset_name must be an uppercase underscore-separated, descriptive name for THIS image. visual_description must be a specific 1-3 sentence account of subject, action, objects, setting, viewpoint, lighting and discriminating details.",
          "Use normalized concise snake_case values for arrays and fields where applicable. setting must be concrete (for example outdoor_sidewalk, commercial_gym, home_bedroom). text_in_image must be 'none' when no legible text or logo is visible.",
          "good_for and avoid_for are editorial retrieval labels grounded in what is visibly depicted; they must not introduce claims not shown in the image.",
          retryHint ?? "",
        ].filter(Boolean).join("\n"),
        input: [{ role: "user", content: [{ type: "input_image", image_url: imageUrl, detail: "low" }] }],
        store: false,
        max_output_tokens: 1_400,
        text: { format: zodTextFormat(stockAssetVisionSchema, "stock_asset_observable_v2") },
      }, { timeout: this.timeoutMs, maxRetries: 0 });
      if (!response.output_parsed) throw new Error("OpenAI returned no stock asset analysis");
      return {
        data: stockAssetVisionSchema.parse(response.output_parsed),
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
      };
    });
  }
}
