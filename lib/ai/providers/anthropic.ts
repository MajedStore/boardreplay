import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AiProvider, GenerateRequest, GenerateResult } from "../contracts";
import { AiError } from "../errors";
import { benchmarkImageLabel } from "../../benchmark";
import { parseStructuredOutput } from "../parse-output";

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;
  private readonly client: Anthropic;
  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 0 });
  }
  async generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const content: Anthropic.Messages.ContentBlockParam[] = [
      { type: "text", text: request.prompt },
    ];
    for (const image of request.images) {
      if (
        !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
          image.mimeType,
        )
      )
        throw new AiError(
          "INVALID_INPUT",
          "The provider does not support this image format.",
        );
      content.push({
        type: "text",
        text: benchmarkImageLabel(image),
      });
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: image.mimeType as
            "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: image.base64,
        },
      });
    }
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16_000,
      system: request.system,
      messages: [{ role: "user", content }],
      ...(request.schema
        ? { output_config: { format: zodOutputFormat(request.schema) } }
        : {}),
    });
    if (response.stop_reason === "max_tokens")
      throw new AiError(
        "INCOMPLETE_OUTPUT",
        "The provider returned an incomplete reconstruction. Try fewer photographs in one lesson.",
      );
    const rawOutput = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    if (!rawOutput.trim() || response.stop_reason === "refusal")
      throw new AiError(
        "INVALID_OUTPUT",
        "The AI provider returned no usable content. Your photos are saved; retry reconstruction or choose another model.",
      );
    if (!request.schema) return { rawOutput, model: response.model };
    try {
      return {
        rawOutput,
        structuredOutput: parseStructuredOutput(request, rawOutput),
        model: response.model,
      };
    } catch {
      throw new AiError(
        "INVALID_OUTPUT",
        "The AI provider returned malformed structured content. Your photos and completed analysis are saved; retry reconstruction.",
      );
    }
  }
}
