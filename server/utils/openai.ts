import type OpenAI from "openai";

let _openai: OpenAI | null = null;

export async function getOpenAI(): Promise<OpenAI> {
  if (!_openai) {
    const { default: OpenAIClient } = await import("openai");
    const config = useRuntimeConfig();
    _openai = new OpenAIClient({
      apiKey: (config.openaiApiKey as string | undefined) || process.env.OPENAI_API_KEY || "",
      baseURL:
        (config.openaiBaseUrl as string | undefined) ||
        process.env.OPENAI_BASE_URL ||
        "https://api.openai.com/v1",
    });
  }
  return _openai;
}
