import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse as parseDotEnv } from "dotenv";
import { configureProvider } from "../lib/ai/configure";
import { getProviders } from "../lib/ai/config";
import { POST } from "../app/api/providers/configure/route";

let directory = "";
const variables = ["OPENAI_API_KEY", "OPENAI_MODEL", "GOOGLE_API_KEY", "GEMINI_MODEL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"] as const;

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(tmpdir(), "boardreplay-provider-config-"));
  for (const variable of variables) vi.stubEnv(variable, "");
});

describe("real-provider smoke CLI cost boundary", () => {
  async function check(configured: boolean, lesson: boolean) {
    const seen: string[] = [];
    const server = createServer((request, response) => {
      seen.push(`${request.method} ${request.url}`);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify([{ id: "openai", model: "mock-public-model", configured }]));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture server address.");
    try {
      const result = await promisify(execFile)(process.execPath, ["scripts/smoke-provider.mjs", "--base-url", `http://127.0.0.1:${address.port}`, ...(lesson ? ["--lesson", "explicit-fixture-id"] : [])], { timeout: 10000, windowsHide: true });
      expect(seen).toEqual(["GET /api/providers"]);
      expect(result.stdout).toContain('"paidRequestsStarted":0');
      return result.stdout;
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  }
  it("skips without credentials, even with an explicit lesson, without requesting photos or starting processing", async () => {
    expect(await check(false, true)).toContain('"status":"SKIPPED"');
  });
  it("requires an explicit lesson before using a configured provider", async () => {
    expect(await check(true, false)).toContain('"status":"CONFIGURATION_ONLY"');
  });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(path.resolve(tmpdir()) + path.sep) || !path.basename(resolved).startsWith("boardreplay-provider-config-")) throw new Error("Refusing to remove an unexpected configuration fixture path.");
  await fs.rm(resolved, { recursive: true, force: true });
});

describe("explicit local provider configuration", () => {
  it("writes only to the explicit fixture file, preserves unrelated settings, and returns public metadata", async () => {
    const file = path.join(directory, ".env");
    const workspaceEnv = await fs.readFile(path.resolve(".env"), "utf8").catch(() => null);
    await fs.writeFile(file, '# Keep this comment\nDATABASE_URL="file:./somewhere.db"\nOTHER_SETTING="untouched # value"\nexport OPENAI_API_KEY="old-key-one"\nOPENAI_API_KEY="old-key-two"\nOPENAI_MODEL="old-model"\n');
    const result = await configureProvider({ provider: "openai", apiKey: "fake-openai-secret-value", model: "test-vision-model" }, file);
    const saved = await fs.readFile(file, "utf8");
    const settings = parseDotEnv(saved);
    expect(settings).toMatchObject({ OPENAI_API_KEY: "fake-openai-secret-value", OPENAI_MODEL: "test-vision-model", DATABASE_URL: "file:./somewhere.db", OTHER_SETTING: "untouched # value" });
    expect(saved).toContain("# Keep this comment");
    expect(saved.match(/^OPENAI_API_KEY=/gm)).toHaveLength(1);
    expect(result.find((provider) => provider.id === "openai")).toEqual({ id: "openai", name: "OpenAI", model: "test-vision-model", configured: true });
    expect(JSON.stringify(result)).not.toContain("fake-openai-secret-value");
    expect(Object.keys(result[0]).sort()).toEqual(["configured", "id", "model", "name"]);
    expect((await fs.readFile(path.resolve(".env"), "utf8").catch(() => null))).toBe(workspaceEnv);
  });

  it("updates provider availability immediately without restarting or changing an unspecified model", async () => {
    const file = path.join(directory, ".env");
    vi.stubEnv("GEMINI_MODEL", "existing-custom-model");
    expect(getProviders().find((provider) => provider.id === "gemini")?.configured).toBe(false);
    await configureProvider({ provider: "gemini", apiKey: "fake-google-secret" }, file);
    expect(getProviders().find((provider) => provider.id === "gemini")).toMatchObject({ configured: true, model: "existing-custom-model" });
    expect(parseDotEnv(await fs.readFile(file, "utf8"))).toEqual({ GOOGLE_API_KEY: "fake-google-secret" });
  });

  it.each([undefined, "", "   "])("changes a configured model while preserving its existing key (%s)", async (apiKey) => {
    const file = path.join(directory, ".env");
    vi.stubEnv("OPENAI_API_KEY", "fake-preserved-secret");
    vi.stubEnv("OPENAI_MODEL", "previous-model");
    const keyLine = 'export OPENAI_API_KEY="fake-preserved-secret"';
    await fs.writeFile(file, `# Keep existing credentials\n${keyLine}\nOPENAI_MODEL="previous-model"\nOTHER_SETTING="untouched"\n`);
    const result = await configureProvider({ provider: "openai", model: "replacement-vision-model", ...(apiKey === undefined ? {} : { apiKey }) }, file);
    const saved = await fs.readFile(file, "utf8");
    expect(saved).toContain(keyLine);
    expect(parseDotEnv(saved)).toEqual({ OPENAI_API_KEY: "fake-preserved-secret", OPENAI_MODEL: "replacement-vision-model", OTHER_SETTING: "untouched" });
    expect(process.env.OPENAI_API_KEY).toBe("fake-preserved-secret");
    expect(process.env.OPENAI_MODEL).toBe("replacement-vision-model");
    expect(result.find((provider) => provider.id === "openai")).toMatchObject({ configured: true, model: "replacement-vision-model" });
    expect(JSON.stringify(result)).not.toContain("fake-preserved-secret");
  });

  it("does not copy an environment-only credential into the file when changing its model", async () => {
    const file = path.join(directory, ".env");
    vi.stubEnv("GOOGLE_API_KEY", "fake-process-only-secret");
    await fs.writeFile(file, 'OTHER_SETTING="untouched"\n');
    const result = await configureProvider({ provider: "gemini", model: "custom-vision-model" }, file);
    expect(parseDotEnv(await fs.readFile(file, "utf8"))).toEqual({ OTHER_SETTING: "untouched", GEMINI_MODEL: "custom-vision-model" });
    expect(process.env.GOOGLE_API_KEY).toBe("fake-process-only-secret");
    expect(result.find((provider) => provider.id === "gemini")).toMatchObject({ configured: true, model: "custom-vision-model" });
  });

  it.each([undefined, "", "   "])("requires credentials before allowing an unconfigured provider model update (%s)", async (apiKey) => {
    const file = path.join(directory, ".env");
    const before = 'OTHER_SETTING="untouched"\n';
    await fs.writeFile(file, before);
    await expect(configureProvider({ provider: "anthropic", model: "custom-model", ...(apiKey === undefined ? {} : { apiKey }) }, file)).rejects.toThrow("Enter an API key to connect");
    expect(await fs.readFile(file, "utf8")).toBe(before);
    expect(process.env.ANTHROPIC_API_KEY).toBe("");
    expect(process.env.ANTHROPIC_MODEL).toBe("");
  });

  it.each([undefined, "", "   "])("rejects a configured provider update without a model or replacement key (%s)", async (model) => {
    const file = path.join(directory, ".env");
    vi.stubEnv("OPENAI_API_KEY", "fake-existing-secret");
    await expect(configureProvider({ provider: "openai", ...(model === undefined ? {} : { model }) }, file)).rejects.toThrow("Enter a model identifier");
    await expect(fs.stat(file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(process.env.OPENAI_API_KEY).toBe("fake-existing-secret");
  });

  it("allows reselecting the current model without requiring its existing key", async () => {
    const file = path.join(directory, ".env");
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-existing-secret");
    vi.stubEnv("ANTHROPIC_MODEL", "current-vision-model");
    const result = await configureProvider({ provider: "anthropic", model: "current-vision-model" }, file);
    expect(result.find((provider) => provider.id === "anthropic")).toMatchObject({ configured: true, model: "current-vision-model" });
    expect(process.env.ANTHROPIC_API_KEY).toBe("fake-existing-secret");
    expect(parseDotEnv(await fs.readFile(file, "utf8"))).toEqual({ ANTHROPIC_MODEL: "current-vision-model" });
  });

  it("applies a queued model change after a new provider connection", async () => {
    const file = path.join(directory, ".env");
    await Promise.all([
      configureProvider({ provider: "openai", apiKey: "fake-queued-secret", model: "initial-model" }, file),
      configureProvider({ provider: "openai", model: "queued-vision-model" }, file),
    ]);
    expect(parseDotEnv(await fs.readFile(file, "utf8"))).toEqual({ OPENAI_API_KEY: "fake-queued-secret", OPENAI_MODEL: "queued-vision-model" });
    expect(process.env.OPENAI_API_KEY).toBe("fake-queued-secret");
    expect(process.env.OPENAI_MODEL).toBe("queued-vision-model");
  });

  it.each([
    "fake-credential-with-#-and-=",
    String.raw`fake-credential-with-\-and-"`,
    "fake-credential-with-'single'-and-#",
    'fake-credential-with-`backticks`-and-"double"',
  ])("round trips literal credential punctuation through dotenv: %s", async (apiKey) => {
    const file = path.join(directory, ".env");
    await configureProvider({ provider: "anthropic", apiKey, model: "test-model#branch=one" }, file);
    const parsed = parseDotEnv(await fs.readFile(file, "utf8"));
    expect(parsed.ANTHROPIC_API_KEY).toBe(apiKey);
    expect(parsed.ANTHROPIC_MODEL).toBe("test-model#branch=one");
    expect(process.env.ANTHROPIC_API_KEY).toBe(apiKey);
  });

  it.each(["\nfake-secret-value", "fake-secret-value\r", "fake\tsecret-value", "fake-secret\u0000value", "fake-secret\u007fvalue", "fake-secret\u2028value"])("rejects raw key line breaks and controls before trimming", async (apiKey) => {
    const file = path.join(directory, ".env");
    await expect(configureProvider({ provider: "openai", apiKey }, file)).rejects.toThrow(/line breaks or control/);
    await expect(fs.stat(file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(process.env.OPENAI_API_KEY).toBe("");
  });

  it("rejects model line breaks and controls before trimming without changing existing data", async () => {
    const file = path.join(directory, ".env");
    const before = 'EXISTING="keep"\n';
    await fs.writeFile(file, before);
    await expect(configureProvider({ provider: "openai", apiKey: "fake-secret-value", model: "model-name\n" }, file)).rejects.toThrow(/line breaks or control/);
    expect(await fs.readFile(file, "utf8")).toBe(before);
    expect(process.env.OPENAI_API_KEY).toBe("");
  });

  it("serializes simultaneous provider writes without losing either configuration", async () => {
    const file = path.join(directory, ".env");
    await Promise.all([
      configureProvider({ provider: "openai", apiKey: "fake-openai-secret" }, file),
      configureProvider({ provider: "gemini", apiKey: "fake-google-secret" }, file),
    ]);
    expect(parseDotEnv(await fs.readFile(file, "utf8"))).toMatchObject({ OPENAI_API_KEY: "fake-openai-secret", GOOGLE_API_KEY: "fake-google-secret" });
    expect((await fs.readdir(directory)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("rejects cross-origin configuration POSTs before writing workspace settings", async () => {
    const before = await fs.readFile(path.resolve(".env"), "utf8").catch(() => null);
    const response = await POST(new Request("http://127.0.0.1:3000/api/providers/configure", { method: "POST", headers: { origin: "https://other.example", "content-type": "application/json" }, body: JSON.stringify({ provider: "openai", apiKey: "fake-cross-origin-secret" }) }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Cross-origin changes are not allowed." });
    expect(await fs.readFile(path.resolve(".env"), "utf8").catch(() => null)).toBe(before);
    expect(process.env.OPENAI_API_KEY).toBe("");
  });
});
