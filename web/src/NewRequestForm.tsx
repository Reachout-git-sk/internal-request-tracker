import { useState } from "react";

import { api, ApiError, CATEGORIES, CATEGORY_LABELS, PRIORITIES, type RequestRow, type Triage } from "./api";

interface Props {
  requester: string;
  onCreated: (row: RequestRow) => void;
}

/**
 * Two steps on purpose: "Suggest" asks the model for a summary and category,
 * then the person reviews and edits them. Only "Save request" writes anything.
 */
export function NewRequestForm({ requester, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [suggestion, setSuggestion] = useState<Triage | null>(null);
  const [summary, setSummary] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState<"triage" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canTriage = title.trim() && description.trim() && !busy;
  const canSave = canTriage && category && requester;

  async function runTriage() {
    setBusy("triage");
    setError(null);
    try {
      const t = await api.triage(title, description);
      setSuggestion(t);
      setSummary(t.summary);
      setCategory(t.ai_available ? t.suggested_category : "");
      if (!t.ai_available) setError("AI suggestion unavailable. Pick a category yourself.");
    } catch {
      setError("Could not reach the triage service. Pick a category yourself.");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const row = await api.create({
        title,
        description,
        requester,
        priority,
        category,
        summary: summary.trim() || undefined,
        ai: suggestion?.ai_available
          ? { summary: suggestion.summary, category: suggestion.suggested_category, model: suggestion.model }
          : undefined,
      });
      setTitle("");
      setDescription("");
      setSuggestion(null);
      setSummary("");
      setCategory("");
      onCreated(row);
    } catch (e) {
      setError(e instanceof ApiError ? `Save failed (${e.status}). Check the fields and try again.` : "Save failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form className="card" onSubmit={(e) => e.preventDefault()} aria-label="New request">
      <h2>New request</h2>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={5000} required />
      </label>
      <label>
        Priority
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          {PRIORITIES.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>

      <button type="button" onClick={runTriage} disabled={!canTriage}>
        {busy === "triage" ? "Thinking..." : "Suggest summary and category"}
      </button>

      {suggestion && (
        <div className="suggestion" role="region" aria-label="Review suggestion">
          <p className="hint">
            {suggestion.ai_available ? "Suggested by AI. Review and edit before saving." : "No suggestion available."}
          </p>
          <label>
            Summary
            <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} maxLength={1000} />
          </label>
        </div>
      )}

      <label>
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value)} required>
          <option value="">Choose...</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
              {suggestion?.ai_available && suggestion.suggested_category === c ? " (suggested)" : ""}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="error" role="alert">{error}</p>}

      <button type="button" className="primary" onClick={save} disabled={!canSave}>
        {busy === "save" ? "Saving..." : "Save request"}
      </button>
    </form>
  );
}
