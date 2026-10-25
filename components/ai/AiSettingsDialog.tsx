"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/layout/Dialog";
import { request } from "@/lib/client";
import type { ProviderId, ProviderInfo } from "@/lib/types";
import "./ai-settings.css";

const choices: { id: ProviderId; name: string }[] = [
  { id: "openai", name: "OpenAI" },
  { id: "gemini", name: "Google Gemini" },
  { id: "anthropic", name: "Anthropic Claude" },
];

export function AiSettingsDialog({ providers, initialProvider, onSave, onClose }: {
  providers: ProviderInfo[];
  initialProvider: ProviderId | "";
  onSave: (providers: ProviderInfo[], selected: ProviderId) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const initial = initialProvider || "openai";
  const [provider, setProvider] = useState<ProviderId>(initial);
  const [model, setModel] = useState(providers.find((item) => item.id === initial)?.model || "");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const configured = providers.some((item) => item.id === provider && item.configured);
  const hasConnection = providers.some((item) => item.configured);

  function changeProvider(value: ProviderId) {
    setProvider(value);
    setModel(providers.find((item) => item.id === value)?.model || "");
    setApiKey("");
    setError("");
  }

  async function save() {
    if (busy || (!configured && !apiKey.trim())) return;
    setBusy(true);
    setError("");
    try {
      const updated = await request<ProviderInfo[]>("/api/providers/configure", {
        method: "POST",
        body: JSON.stringify({ provider, ...(model.trim() ? { model: model.trim() } : {}), ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }),
      });
      setApiKey("");
      onSave(updated, provider);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your AI settings.");
    } finally { setBusy(false); }
  }

  async function openDemo() {
    setBusy(true);
    setError("");
    try {
      const demo = await request<{ id: string }>("/api/demo", { method: "POST" });
      setApiKey("");
      onClose();
      router.push(`/lessons/${demo.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the synthetic demo.");
      setBusy(false);
    }
  }

  return <Dialog title={hasConnection ? "Change AI" : "Connect AI"} className="ai-settings-dialog" busy={busy} onClose={onClose}>
    <p>Choose the AI used to organize lecture photos and write contextual explanations.</p>
    {error && <p className="ai-settings-error" role="alert">{error}</p>}
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="field"><span className="label">Provider</span><select className="input" aria-label="Provider" value={provider} disabled={busy} onChange={(event) => changeProvider(event.target.value as ProviderId)}>{choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>
      <label className="field"><span className="label">Model</span><input className="input" value={model} maxLength={180} required={configured} disabled={busy} onChange={(event) => setModel(event.target.value)} placeholder="Use the server default" /></label>
      <p className="ai-settings-hint">Enter a vision model identifier available in your provider account. Model settings apply to future runs across this app.</p>
      <label className="field"><span className="label">API key</span><input className="input" type="password" autoComplete="new-password" required={!configured} value={apiKey} disabled={busy} onChange={(event) => setApiKey(event.target.value)} placeholder={configured ? "Leave blank to keep the saved key" : "Enter this provider's API key"} /></label>
      <p className="ai-settings-hint">{configured ? "Connected. You can change the model without entering your key again." : "This provider needs an API key before it can process photos."} Keys stay on this server.</p>
      <p className="ai-settings-hint">Saving does not start processing. Organize the lecture to use your choice; the provider may charge for that run.</p>
      <button className="btn btn-primary" type="submit" disabled={busy || (configured ? !model.trim() : !apiKey.trim())}>{busy ? "Saving…" : configured ? "Save changes" : "Save connection"}</button>
    </form>
    {!hasConnection && <div className="ai-settings-demo"><button type="button" className="text-link" disabled={busy} onClick={() => void openDemo()}>Open synthetic demo</button><p className="ai-settings-hint">This opens sample photos with authored explanations. Your uploaded photos remain saved in this lesson.</p></div>}
  </Dialog>;
}
