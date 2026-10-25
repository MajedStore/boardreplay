import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parse as parseDotEnv } from "dotenv";
import { ApiError } from "../api";
import { providerIdSchema } from "../validation/schemas";
import { getProviders } from "./config";

const inputSchema = z.object({
  provider: providerIdSchema,
  apiKey: z.string().refine((value) => !/[\p{Cc}\u2028\u2029]/u.test(value), "API keys cannot contain line breaks or control characters.").transform((value) => value.trim()).pipe(z.string().max(2000).refine((value) => !value || value.length >= 8, "Enter your provider API key.")).optional(),
  model: z.string().refine((value) => !/[\p{Cc}\u2028\u2029]/u.test(value), "Model identifiers cannot contain line breaks or control characters.").transform((value) => value.trim()).pipe(z.string().max(180)).optional(),
});
const names = {
  openai: ["OPENAI_API_KEY", "OPENAI_MODEL"],
  gemini: ["GOOGLE_API_KEY", "GEMINI_MODEL"],
  anthropic: ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"],
} as const;
let pending: Promise<unknown> = Promise.resolve();

function dotenvSetting(name: string, value: string) {
  // dotenv does not apply general JSON string escapes. Verify an exact round trip
  // instead of changing an otherwise valid credential after the next restart.
  for (const candidate of [JSON.stringify(value), `'${value}'`, `\`${value}\``, value]) {
    const line = `${name}=${candidate}`;
    if (parseDotEnv(line)[name] === value) return line;
  }
  throw new ApiError("This value cannot be safely stored in the local environment file. Check its quotation characters.");
}

/** Serialize local credential writes; never return, log or persist a key in browser storage. */
export async function configureProvider(value: unknown, envFile = path.resolve(process.cwd(), ".env")) {
  const input = inputSchema.parse(value);
  const operation = pending.catch(() => {}).then(async () => {
    // A blank replacement key means keep the server's existing credential. Check
    // availability inside the queue so a preceding connection save is visible.
    if (!input.apiKey) {
      if (!getProviders().some((provider) => provider.id === input.provider && provider.configured))
        throw new ApiError("Enter an API key to connect this AI provider.");
      if (!input.model)
        throw new ApiError("Enter a model identifier to update this AI provider.");
    }
    let existing = "";
    try { existing = await fs.readFile(/*turbopackIgnore: true*/ envFile, "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new ApiError("The server could not read its configuration file. Check local file permissions.", 500); }
    const [keyName, modelName] = names[input.provider];
    const replacements: Record<string, string> = {};
    if (input.apiKey) replacements[keyName] = input.apiKey;
    if (input.model) replacements[modelName] = input.model;
    const rows = existing.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
    for (const [name, setting] of Object.entries(replacements)) {
      const line = dotenvSetting(name, setting);
      const match = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=`);
      let written = false;
      for (let index = 0; index < rows.length; index++) {
        if (!match.test(rows[index])) continue;
        rows[index] = written ? "" : line;
        written = true;
      }
      if (!written) rows.push(line);
    }
    const temporary = `${envFile}.boardreplay-${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, rows.join("\n").replace(/\n*$/, "\n"), { mode: 0o600, flag: "wx" });
      await fs.rename(temporary, envFile);
    } catch {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw new ApiError("The server could not save its configuration. Check local file permissions and try again.", 500);
    }
    for (const [name, setting] of Object.entries(replacements)) process.env[name] = setting;
    return getProviders();
  });
  pending = operation;
  return operation;
}
