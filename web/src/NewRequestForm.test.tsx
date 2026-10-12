import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewRequestForm } from "./NewRequestForm";

type Handler = (url: string, init?: RequestInit) => { status?: number; body: unknown };

let calls: { url: string; method: string; body: unknown }[] = [];

function mockFetch(handler: Handler) {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const { status = 200, body } = handler(url, init);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
}

const triageOk = { summary: "Needs VPN certificate renewed.", suggested_category: "it_access", model: "m", ai_available: true };

async function fillBasics() {
  await userEvent.type(screen.getByLabelText("Title"), "VPN broken");
  await userEvent.type(screen.getByLabelText("Description"), "Certificate expired this morning.");
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("NewRequestForm", () => {
  it("shows the AI suggestion for review without saving anything", async () => {
    mockFetch(() => ({ body: triageOk }));
    render(<NewRequestForm requester="dana@example.com" onCreated={() => {}} />);
    await fillBasics();

    await userEvent.click(screen.getByRole("button", { name: /suggest/i }));

    expect(await screen.findByDisplayValue("Needs VPN certificate renewed.")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toHaveValue("it_access");
    expect(calls.map((c) => c.url)).toEqual([expect.stringContaining("/api/triage")]);
  });

  it("saves only after the person confirms, with their edits and the AI provenance", async () => {
    mockFetch((url) => (url.endsWith("/api/triage") ? { body: triageOk } : { status: 201, body: { id: 7 } }));
    const onCreated = vi.fn();
    render(<NewRequestForm requester="dana@example.com" onCreated={onCreated} />);
    await fillBasics();
    await userEvent.click(screen.getByRole("button", { name: /suggest/i }));

    const summary = await screen.findByDisplayValue("Needs VPN certificate renewed.");
    await userEvent.clear(summary);
    await userEvent.type(summary, "Renew VPN cert for Dana.");
    await userEvent.selectOptions(screen.getByLabelText("Category"), "software");
    await userEvent.click(screen.getByRole("button", { name: "Save request" }));

    const save = calls.find((c) => c.url.endsWith("/api/requests"));
    expect(save?.method).toBe("POST");
    expect(save?.body).toMatchObject({
      category: "software",
      summary: "Renew VPN cert for Dana.",
      ai: { category: "it_access", summary: "Needs VPN certificate renewed.", model: "m" },
    });
    expect(onCreated).toHaveBeenCalledWith({ id: 7 });
  });

  it("asks for a manual category when the AI is unavailable", async () => {
    mockFetch(() => ({ body: { ...triageOk, ai_available: false, suggested_category: "other" } }));
    render(<NewRequestForm requester="dana@example.com" onCreated={() => {}} />);
    await fillBasics();
    await userEvent.click(screen.getByRole("button", { name: /suggest/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/pick a category/i);
    expect(screen.getByLabelText("Category")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save request" })).toBeDisabled();
  });

  it("cannot save without a category or before typing a title", async () => {
    mockFetch(() => ({ body: {} }));
    render(<NewRequestForm requester="dana@example.com" onCreated={() => {}} />);
    expect(screen.getByRole("button", { name: "Save request" })).toBeDisabled();
    await fillBasics();
    expect(screen.getByRole("button", { name: "Save request" })).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText("Category"), "hardware");
    expect(screen.getByRole("button", { name: "Save request" })).toBeEnabled();
  });
});
