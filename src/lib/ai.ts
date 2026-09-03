import Anthropic from "@anthropic-ai/sdk";

let cached: Anthropic | null | undefined;

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5";

/** Claude client, or null when no ANTHROPIC_API_KEY is configured (demo mode). */
export function getClaude(): Anthropic | null {
  if (cached !== undefined) return cached;
  cached = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  return cached;
}

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Turns an Anthropic SDK error into a short, user-safe description. */
export function describeAiError(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError) return "Claude API key was rejected";
  if (error instanceof Anthropic.RateLimitError) return "Claude rate limit reached – try again shortly";
  if (error instanceof Anthropic.APIError) return `Claude API error ${error.status}: ${error.message}`;
  return error instanceof Error ? error.message : "Unknown AI error";
}
