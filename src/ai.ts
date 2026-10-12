export const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Single call to Llama 3.3; throws on empty output so callers can retry.
export async function runModel(
  ai: Ai,
  messages: ChatMessage[],
  maxTokens = 1024,
): Promise<string> {
  const result = (await ai.run(MODEL, {
    messages,
    max_tokens: maxTokens,
    temperature: 0.2,
  })) as {
    response?: string;
  };
  const text = result.response?.trim();
  if (!text) throw new Error("Empty response from model");
  return text;
}

export function numberedCodeBlock(code: string, language: string | null): string {
  const numbered = code
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(3, " ")} | ${line}`)
    .join("\n");
  return "```" + (language ?? "") + "\n" + numbered + "\n```";
}
