import { afterEach, describe, expect, it, vi } from "vitest";

import { API_BASE_URL, setAccessToken } from "@/services/api";

/**
 * The assistant endpoints. The important behaviour is that the answer always
 * says where it came from, so the interface can be honest with the visitor.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(handler);
}

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe("the assistant endpoints", () => {
  it("reports that no live model is configured", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () =>
        jsonResponse({
          provider: null,
          model: null,
          live_model_enabled: false,
          mode: "knowledge_base",
        }),
      ),
    );

    const { api } = await import("@/services/api");
    const status = await api.assistantStatus();
    expect(status.live_model_enabled).toBe(false);
    expect(status.mode).toBe("knowledge_base");
  });

  it("asks a question and returns the answer with its mode and sources", async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse({
        answer: "Complete beginners are welcome.",
        mode: "knowledge_base",
        sources: [{ id: 2, question: "Do I need experience?", category: "Visiting" }],
        provider: null,
        model: null,
        created_at: "2026-10-20T10:00:00Z",
        disclaimer: "Answers are based on approved ARCH information only.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { api } = await import("@/services/api");
    const answer = await api.askAssistant("Do I need experience?");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/assistant/chat`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ question: "Do I need experience?" });
    expect(answer.mode).toBe("knowledge_base");
    expect(answer.sources).toHaveLength(1);
  });

  it("keeps the 'not covered' mode so the interface can say so", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () =>
        jsonResponse({
          answer: "I don't have approved information about that yet.",
          mode: "not_covered",
          sources: [],
          provider: null,
          model: null,
          created_at: "2026-10-20T10:00:00Z",
          disclaimer: "Answers are based on approved ARCH information only.",
        }),
      ),
    );

    const { api } = await import("@/services/api");
    const answer = await api.askAssistant("What is the wifi password in Tokyo?");
    expect(answer.mode).toBe("not_covered");
    expect(answer.sources).toEqual([]);
  });

  it("reports an unreachable assistant as a distinct error", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(async () => {
        throw new TypeError("network down");
      }),
    );

    const { api, ApiUnavailableError } = await import("@/services/api");
    await expect(api.askAssistant("Anything")).rejects.toBeInstanceOf(ApiUnavailableError);
  });
});
