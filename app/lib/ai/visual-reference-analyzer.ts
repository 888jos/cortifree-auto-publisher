import { z } from 'zod';
import { zodTextFormat } from 'openai/helpers/zod';
import { getOpenAIClient, withRetry } from './openai-client';
import type { TokenUsage } from './types';
import { visualReferenceCategories } from '../../../src/visual-references';

export const visualReferenceAnalysisSchema = z.object({
  category: z.enum(visualReferenceCategories),
  pose: z.string().max(180),
  framing: z.string().max(100),
  outfit: z.string().max(180),
  environment: z.string().max(180),
  lighting: z.string().max(140),
  mood: z.array(z.string().max(50)).max(8),
  orientation: z.enum(['portrait', 'landscape', 'square']),
  goodFor: z.array(z.string().max(60)).max(12),
});
export type VisualReferenceAnalysis = z.infer<typeof visualReferenceAnalysisSchema>;

export interface VisualReferenceAnalyzer {
  analyze(input: { imageUrl: string; currentCategory: string }): Promise<{ data: VisualReferenceAnalysis; usage: TokenUsage }>;
}

export class OpenAIVisualReferenceAnalyzer implements VisualReferenceAnalyzer {
  constructor(private readonly model: string, private readonly timeoutMs = 45_000) {}

  async analyze(input: { imageUrl: string; currentCategory: string }) {
    const client = getOpenAIClient();
    return withRetry(async () => {
      const response = await client.responses.parse({
        model: this.model,
        instructions: 'Analyze this image only as a reusable visual scene reference. Describe pose, framing, outfit, environment, lighting and mood. Do not identify the person, infer sensitive traits, or describe facial identity. Prefer the supplied category when plausible.',
        input: [{ role: 'user', content: [
          { type: 'input_text', text: `Current category: ${input.currentCategory}` },
          { type: 'input_image', image_url: input.imageUrl, detail: 'low' },
        ] }],
        store: false,
        max_output_tokens: 700,
        text: { format: zodTextFormat(visualReferenceAnalysisSchema, 'visual_reference_analysis') },
      }, { timeout: this.timeoutMs, maxRetries: 0 });
      if (!response.output_parsed) throw new Error('OpenAI returned no visual reference analysis');
      return {
        data: visualReferenceAnalysisSchema.parse(response.output_parsed),
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
      };
    });
  }
}
