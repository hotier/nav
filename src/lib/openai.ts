import type OpenAI from "openai";

let _openai: OpenAI | null = null;

export async function getOpenAI(): Promise<OpenAI> {
  if (!_openai) {
    const { default: OpenAIClient } = await import("openai");
    _openai = new OpenAIClient({
      apiKey: process.env.OPENAI_API_KEY || "",
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    });
  }
  return _openai;
}
