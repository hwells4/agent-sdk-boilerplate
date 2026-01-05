/**
 * Test streaming observability with batch and real-time modes.
 *
 * This example demonstrates:
 * - Batch mode (default): Events buffered and uploaded at completion
 * - Real-time mode: Events uploaded to Braintrust as they occur
 */

import 'dotenv/config'
import { runPythonAgentStreaming } from './lib/agent'

async function main() {
  console.log('🔍 Testing Streaming Observability\n')

  // Test 1: Batch mode (default)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Test 1: Batch Mode (default)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  try {
    const result1 = await runPythonAgentStreaming({
      prompt: 'Create a file called test.txt with the text "Hello from Braintrust observability test!" and then read it back to verify',
      verbose: true,
      timeout: 600, // 10 minutes - real agent processes can take time
      // Default is batch mode
      onStream: {
        onToolUse: (id, name, input) => {
          console.log(`  [Batch] Tool: ${name}`)
        },
        onResult: (result, durationMs, cost) => {
          console.log(`  [Batch] Duration: ${durationMs}ms, Cost: $${cost.toFixed(4)}`)
        },
      },
    })

    console.log(`\n✅ Batch mode result: ${result1.substring(0, 100)}...\n\n`)
  } catch (error: any) {
    console.error('❌ Batch mode failed:', error.message)
  }

  // Test 2: Real-time mode
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Test 2: Real-time Mode')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  try {
    const result2 = await runPythonAgentStreaming({
      prompt: 'Create 3 files named file1.txt, file2.txt, and file3.txt with different content, then list all .txt files in the current directory and count them',
      verbose: true,
      timeout: 600, // 10 minutes - real agent processes can take time
      observability: {
        mode: 'realtime', // Events logged to Braintrust as they occur
      },
      onStream: {
        onToolUse: (id, name, input) => {
          console.log(`  [Realtime] Tool: ${name}`)
        },
        onResult: (result, durationMs, cost) => {
          console.log(`  [Realtime] Duration: ${durationMs}ms, Cost: $${cost.toFixed(4)}`)
        },
      },
    })

    console.log(`\n✅ Real-time mode result: ${result2.substring(0, 100)}...\n\n`)
  } catch (error: any) {
    console.error('❌ Real-time mode failed:', error.message)
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Summary')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  console.log('✅ All streaming tests completed')
  console.log('📊 View traces in Braintrust dashboard:')
  const projectName = process.env.BRAINTRUST_PROJECT_NAME || 'claude-agent-sdk'
  console.log(`   https://braintrust.dev/app/${projectName}\n`)
}

main().catch(console.error)
