import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local.",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
