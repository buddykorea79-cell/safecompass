import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  chatCreate: vi.fn(),
  embeddingCreate: vi.fn(),
  transcriptionCreate: vi.fn(),
  clientOptions: [] as unknown[],
}));

vi.mock("openai", () => ({
  default: class OpenAIMock {
    chat = { completions: { create: mocks.chatCreate } };
    embeddings = { create: mocks.embeddingCreate };
    audio = { transcriptions: { create: mocks.transcriptionCreate } };

    constructor(options: unknown) {
      mocks.clientOptions.push(options);
    }
  },
}));

const ORIGINAL_ENV = {
  baseUrl: process.env.BIZROUTER_BASE_URL,
  apiKey: process.env.BIZROUTER_API_KEY,
  chatModel: process.env.BIZROUTER_CHAT_MODEL,
  embeddingModel: process.env.BIZROUTER_EMBEDDING_MODEL,
};

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  delete process.env.BIZROUTER_BASE_URL;
  process.env.BIZROUTER_API_KEY = "sk-br-v1-test";
  delete process.env.BIZROUTER_CHAT_MODEL;
  delete process.env.BIZROUTER_EMBEDDING_MODEL;
  mocks.chatCreate.mockReset();
  mocks.embeddingCreate.mockReset();
  mocks.transcriptionCreate.mockReset();
  mocks.clientOptions.length = 0;
  vi.resetModules();
});

afterEach(() => {
  restore("BIZROUTER_BASE_URL", ORIGINAL_ENV.baseUrl);
  restore("BIZROUTER_API_KEY", ORIGINAL_ENV.apiKey);
  restore("BIZROUTER_CHAT_MODEL", ORIGINAL_ENV.chatModel);
  restore("BIZROUTER_EMBEDDING_MODEL", ORIGINAL_ENV.embeddingModel);
});

describe("BizRouter 채팅 계약", () => {
  it("공식 기본 주소와 provider/model ID로 메시지 text를 보내고 응답을 반환한다", async () => {
    process.env.BIZROUTER_CHAT_MODEL = "gpt-4o-mini";
    mocks.chatCreate.mockResolvedValue({
      choices: [{ message: { content: "안전한 곳으로 이동하세요." } }],
    });

    const { chatComplete } = await import("./bizrouter");
    const result = await chatComplete("안전 안내 시스템", "현재 행동요령을 알려주세요.");

    expect(mocks.clientOptions[0]).toMatchObject({
      baseURL: "https://api.bizrouter.ai/v1",
      apiKey: "sk-br-v1-test",
    });
    expect(mocks.chatCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: "안전 안내 시스템" },
          { role: "user", content: "현재 행동요령을 알려주세요." },
        ],
      })
    );
    expect(result).toEqual({ text: "안전한 곳으로 이동하세요.", fallback: false });
  });

  it("텍스트 블록 및 Responses 호환 output_text도 정규화한다", async () => {
    const { extractBizrouterText } = await import("./bizrouter");

    expect(
      extractBizrouterText({
        choices: [{ message: { content: [{ type: "text", text: "첫 문장" }, { type: "text", text: "둘째 문장" }] } }],
      })
    ).toBe("첫 문장\n둘째 문장");
    expect(extractBizrouterText({ output_text: "Responses 응답" })).toBe("Responses 응답");
  });

  it("텍스트가 없거나 호출이 실패하면 관리자에게 원인을 제공한다", async () => {
    mocks.chatCreate.mockResolvedValueOnce({ choices: [{ message: { content: null } }] });

    const { chatComplete } = await import("./bizrouter");
    await expect(chatComplete("system", "user")).resolves.toMatchObject({
      text: "",
      fallback: true,
      message: expect.stringContaining("텍스트 없는 응답"),
    });

    mocks.chatCreate.mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { status: 401 }));
    await expect(chatComplete("system", "user")).resolves.toMatchObject({
      text: "",
      fallback: true,
      message: expect.stringContaining("HTTP 401"),
    });
  });

  it("API 키가 없으면 빈 text의 원인을 명시한다", async () => {
    delete process.env.BIZROUTER_API_KEY;
    vi.resetModules();

    const { chatComplete } = await import("./bizrouter");

    await expect(chatComplete("system", "user")).resolves.toMatchObject({
      text: "",
      fallback: true,
      message: expect.stringContaining("BIZROUTER_API_KEY"),
    });
    expect(mocks.chatCreate).not.toHaveBeenCalled();
  });
});
