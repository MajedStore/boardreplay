import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { AiProvider, GenerateRequest, GenerateResult } from "../contracts";
import { AiError } from "../errors";
import { benchmarkImageLabel } from "../../benchmark";
import { parseStructuredOutput } from "../parse-output";

export class OpenAiProvider implements AiProvider {
  readonly id = "openai" as const;
  private readonly client: OpenAI;
  constructor(
    apiKey: string,
    readonly model: string,
  ) {
    this.client = new OpenAI({ apiKey, timeout: 90_000, maxRetries: 0 });
  }
  async generate<T>(request: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const content: OpenAI.Responses.ResponseInputContent[] = [
      { type: "input_text", text: request.prompt },
    ];
    for (const image of request.images) {
      content.push({
        type: "input_text",
        text: benchmarkImageLabel(image),
      });
      content.push({
        type: "input_image",
        image_url: `data:${image.mimeType};base64,${image.base64}`,
        detail: "high",
      });
    }
    const input = [{ role: "user" as const, content }];
    if (request.schema) {
      const response = await this.client.responses.create({
        model: this.model,
        instructions: request.system,
        input,
        store: false,
        max_output_tokens: 16_000,
        text: {
          format: zodTextFormat(
            request.schema,
            request.schemaName || "boardreplay_result",
          ),
        },
      });
      if (response.status === "incomplete")
        throw new AiError(
          "INCOMPLETE_OUTPUT",
          "The provider returned an incomplete reconstruction. Try fewer photographs in one lesson.",
        );
      if (!response.output_text?.trim())
        throw new AiError(
          "INVALID_OUTPUT",
          "The AI provider returned no usable structured content. Your photos are saved; retry reconstruction or choose another model.",
        );
      try {
        return {
          rawOutput: response.output_text,
          structuredOutput: parseStructuredOutput(request, response.output_text),
          model: response.model,
        };
      } catch {
        throw new AiError("INVALID_OUTPUT", "The AI provider returned malformed structured content. Your photos and completed analysis are saved; retry reconstruction.");
      }
    }
    const response = await this.client.responses.create({
      model: this.model,
      instructions: request.system,
      input,
      store: false,
      max_output_tokens: 16_000,
    });
    if (response.status === "incomplete")
      throw new AiError(
        "INCOMPLETE_OUTPUT",
        "The provider response was incomplete. Try a smaller image set.",
      );
    if (!response.output_text.trim())
      throw new AiError(
        "INVALID_OUTPUT",
        "The provider returned no usable text.",
      );
    return { rawOutput: response.output_text, model: response.model };
  }
}
