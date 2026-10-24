import { GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";
import type { AiProvider, GenerateRequest, GenerateResult } from "../contracts";
import { AiError } from "../errors";
import { benchmarkImageLabel } from "../../benchmark";

export class GeminiProvider implements AiProvider {
  readonly id = "gemini" as const;
  private readonly client: GoogleGenAI;
  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 90_000, retryOptions: { attempts: 1 } },
    });
  }
  async generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const parts: Part[] = [{ text: request.prompt }];
    for (const image of request.images) {
      parts.push({
        text: benchmarkImageLabel(image),
      });
      parts.push({
        inlineData: { mimeType: image.mimeType, data: image.base64 },
      });
    }
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: request.system,
        maxOutputTokens: 16_000,
        ...(request.schema
          ? {
              responseMimeType: "application/json",
              responseJsonSchema: z.toJSONSchema(request.schema),
            }
          : {}),
      },
    });
    if (response.candidates?.[0]?.finishReason === "MAX_TOKENS")
      throw new AiError(
        "INCOMPLETE_OUTPUT",
        "The provider returned an incomplete reconstruction. Try fewer photographs in one lesson.",
      );
    const rawOutput = response.text || "";
    if (!rawOutput.trim())
      throw new AiError(
        "INVALID_OUTPUT",
        "The provider returned no usable text. Review the photographs and try again.",
      );
    if (!request.schema)
      return { rawOutput, model: response.modelVersion || this.model };
    try {
      return {
        rawOutput,
        structuredOutput: request.schema.parse(JSON.parse(rawOutput)),
        model: response.modelVersion || this.model,
      };
    } catch {
      throw new AiError(
        "INVALID_OUTPUT",
        "The provider returned invalid structured data. Review the photographs and try again.",
      );
    }
  }
}
