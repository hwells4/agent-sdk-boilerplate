/**
 * Multi-turn conversation example with Braintrust session tracing.
 *
 * Demonstrates:
 * - Creating conversation sessions
 * - Executing multiple turns with context
 * - Session-level tracing in Braintrust
 * - Hierarchical trace visualization (conversation → turns)
 */

import 'dotenv/config'
import { createSession, executeTurn, endSession } from './lib/sessions'

async function main() {
  console.log('🗣️  Starting multi-turn conversation with context...\n')

  // Create conversation session (creates persistent sandbox)
  const session = await createSession()
  console.log(`📝 Session ID: ${session.sessionId}`)
  console.log(`🔧 Sandbox created: ${session.sandbox?.id}\n`)

  try {
    // Turn 1: Initial question
    console.log('👤 Turn 1: What is the capital of France?')
    const response1 = await executeTurn(
      session.sessionId,
      'What is the capital of France?'
    )
    console.log(`🤖 Agent: ${response1}\n`)

    // Turn 2: Follow-up question (tests context)
    console.log('👤 Turn 2: What is the population of that city?')
    const response2 = await executeTurn(
      session.sessionId,
      'What is the population of that city?'
    )
    console.log(`🤖 Agent: ${response2}\n`)

    // Turn 3: Another follow-up
    console.log('👤 Turn 3: What are the top 3 tourist attractions there?')
    const response3 = await executeTurn(
      session.sessionId,
      'What are the top 3 tourist attractions there?'
    )
    console.log(`🤖 Agent: ${response3}\n`)

    console.log(`✅ Conversation complete (${session.turnCount} turns)`)

  } finally {
    // End session and finalize trace (kills sandbox)
    await endSession(session.sessionId)
    console.log(`\n🔧 Sandbox terminated`)
    console.log(`📊 View conversation in Braintrust dashboard`)

    const projectName = process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk'
    console.log(`   https://braintrust.dev/app/${projectName}`)
  }
}

main().catch(console.error)
