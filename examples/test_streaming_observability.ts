/**
 * Test streaming observability with Braintrust integration.
 *
 * This example demonstrates batch mode observability where events
 * are buffered and uploaded to Braintrust at completion.
 */

import 'dotenv/config'
import { runPythonAgentStreaming } from '../src/agent'

async function main() {
  console.log('Testing Streaming Observability\n')

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Test: Batch Mode Observability')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  try {
    const result = await runPythonAgentStreaming({
      prompt: 'Create a file called test.txt with the text "Hello from Braintrust observability test!" and then read it back to verify',
      verbose: true,
      timeout: 600, // 10 minutes - real agent processes can take time
      onStream: {
        onToolUse: (id, name, input) => {
          console.log(`  [Tool] ${name}`)
        },
        onResult: (result, durationMs, cost) => {
          console.log(`  [Result] Duration: ${durationMs}ms, Cost: $${cost.toFixed(4)}`)
        },
      },
    })

    console.log(`\nResult: ${result.substring(0, 100)}...\n`)
  } catch (error: any) {
    console.error('Test failed:', error.message)
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  console.log('Streaming test completed')
  console.log('View traces in Braintrust dashboard:')
  const projectName = process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk'
  console.log(`   https://braintrust.dev/app/${projectName}\n`)
}

main().catch(console.error)
