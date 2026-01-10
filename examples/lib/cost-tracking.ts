/**
 * Cost tracking for Claude API and E2B sandbox usage.
 *
 * Provides comprehensive cost breakdown including:
 * - Claude API costs (prompt, completion, cached tokens)
 * - E2B sandbox compute costs
 * - Total execution cost
 */

// Claude pricing (per 1M tokens) as of January 2025
const CLAUDE_PRICING: Record<string, {
  promptTokens: number
  completionTokens: number
  cachedTokens: number
}> = {
  'claude-sonnet-4-5-20250929': {
    promptTokens: 3.0,      // $3 per 1M
    completionTokens: 15.0,  // $15 per 1M
    cachedTokens: 0.30,     // $0.30 per 1M (90% discount)
  },
  'claude-opus-4-5-20251101': {
    promptTokens: 15.0,     // $15 per 1M
    completionTokens: 75.0,  // $75 per 1M
    cachedTokens: 1.50,     // $1.50 per 1M (90% discount)
  },
}

// E2B pricing
const E2B_VCPU_PRICE_PER_SECOND = 0.000014 // $0.000014 per vCPU per second

/**
 * Unified token usage interface (camelCase).
 * This is the canonical format used throughout the SDK.
 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  cachedTokens?: number
}

/**
 * Token usage as returned by Python/Claude API (snake_case).
 * Used for parsing JSON output from sandbox.
 */
export interface RawTokenUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
}

/**
 * Convert Python snake_case token usage to TypeScript camelCase.
 */
export function convertTokenUsage(raw: RawTokenUsage): TokenUsage {
  return {
    promptTokens: raw.input_tokens,
    completionTokens: raw.output_tokens,
    cachedTokens: raw.cache_read_input_tokens,
  }
}

export interface E2BUsage {
  durationSeconds: number
  cpuCount: number
}

export interface CostBreakdown {
  claude: {
    promptTokens: number
    completionTokens: number
    cachedTokens: number
    promptCost: number
    completionCost: number
    cachedCost: number
    totalCost: number
  }
  e2b: {
    durationSeconds: number
    cpuCount: number
    cost: number
  }
  total: number
}

/**
 * Calculate comprehensive cost for agent execution.
 *
 * @param model - Claude model ID (e.g., 'claude-sonnet-4-5-20250929')
 * @param tokenUsage - Token usage from Claude API
 * @param e2bUsage - E2B sandbox compute usage (optional)
 * @returns Detailed cost breakdown
 */
export function calculateCost(
  model: string,
  tokenUsage: TokenUsage,
  e2bUsage?: E2BUsage
): CostBreakdown {
  // Use Sonnet pricing as default if model not found
  const pricing = CLAUDE_PRICING[model] || CLAUDE_PRICING['claude-sonnet-4-5-20250929']

  // Calculate Claude API costs
  const promptCost = (tokenUsage.promptTokens / 1_000_000) * pricing.promptTokens
  const completionCost = (tokenUsage.completionTokens / 1_000_000) * pricing.completionTokens
  const cachedCost = ((tokenUsage.cachedTokens || 0) / 1_000_000) * pricing.cachedTokens

  const claudeTotalCost = promptCost + completionCost + cachedCost

  // Calculate E2B costs
  let e2bCost = 0
  if (e2bUsage) {
    e2bCost = e2bUsage.durationSeconds * e2bUsage.cpuCount * E2B_VCPU_PRICE_PER_SECOND
  }

  return {
    claude: {
      promptTokens: tokenUsage.promptTokens,
      completionTokens: tokenUsage.completionTokens,
      cachedTokens: tokenUsage.cachedTokens || 0,
      promptCost,
      completionCost,
      cachedCost,
      totalCost: claudeTotalCost,
    },
    e2b: {
      durationSeconds: e2bUsage?.durationSeconds || 0,
      cpuCount: e2bUsage?.cpuCount || 0,
      cost: e2bCost,
    },
    total: claudeTotalCost + e2bCost,
  }
}

/**
 * Format cost breakdown for console output.
 *
 * @param cost - Cost breakdown
 * @returns Formatted string with visual breakdown
 */
export function formatCost(cost: CostBreakdown): string {
  const lines = [
    `💰 Cost Breakdown:`,
    `   Claude API:`,
    `   • Prompt tokens: ${cost.claude.promptTokens.toLocaleString()} ($${cost.claude.promptCost.toFixed(4)})`,
    `   • Completion tokens: ${cost.claude.completionTokens.toLocaleString()} ($${cost.claude.completionCost.toFixed(4)})`,
  ]

  if (cost.claude.cachedTokens > 0) {
    lines.push(`   • Cached tokens: ${cost.claude.cachedTokens.toLocaleString()} ($${cost.claude.cachedCost.toFixed(4)})`)
  }

  lines.push(`   • Claude total: $${cost.claude.totalCost.toFixed(4)}`)

  if (cost.e2b.durationSeconds > 0) {
    lines.push(`   E2B Sandbox:`)
    lines.push(`   • Duration: ${cost.e2b.durationSeconds.toFixed(1)}s`)
    lines.push(`   • CPUs: ${cost.e2b.cpuCount}`)
    lines.push(`   • Sandbox total: $${cost.e2b.cost.toFixed(4)}`)
  }

  lines.push(`   ━━━━━━━━━━━━━━━━━━━━━━━━`)
  lines.push(`   Total: $${cost.total.toFixed(4)}`)

  return lines.join('\n')
}

/**
 * Parse token usage from Claude Agent SDK output.
 *
 * NOTE: As of the latest implementation (2025-01), this function is primarily
 * used as a fallback. The Python agent now outputs structured JSON with usage
 * information, which is parsed directly in agent.ts.
 *
 * IMPORTANT: Token usage is available with both OAuth tokens and API keys.
 * The Claude Agent SDK tracks token usage internally regardless of auth method.
 * If you're seeing zeros, it's likely a parsing issue, not an OAuth limitation.
 *
 * @param stdout - Standard output from Python agent
 * @returns Parsed token usage or zeros if not found
 */
export function parseTokenUsage(stdout: string): TokenUsage {
  try {
    // Look for usage information in the output
    // Format: {"usage": {"input_tokens": 150, "output_tokens": 50, "cache_read_input_tokens": 100}}
    const usageMatch = stdout.match(/"usage":\s*\{[^}]+\}/)
    if (usageMatch) {
      const usage = JSON.parse(`{${usageMatch[0]}}`)
      return {
        promptTokens: usage.usage.input_tokens || 0,
        completionTokens: usage.usage.output_tokens || 0,
        cachedTokens: usage.usage.cache_read_input_tokens || 0,
      }
    }
  } catch (error) {
    // Silently fall back to defaults
  }

  return { promptTokens: 0, completionTokens: 0, cachedTokens: 0 }
}
