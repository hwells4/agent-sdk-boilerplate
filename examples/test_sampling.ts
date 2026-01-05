/**
 * Test sampling functionality
 */

import * as dotenv from 'dotenv'
import { runPythonAgent } from './lib/agent'

// Load environment variables
dotenv.config()

async function testSampling() {
  console.log('🧪 Testing Phase 3 Sampling Implementation\n')

  // Test 1: Per-call override (force trace even with 0% global rate)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Test 1: Per-call override (sample: 1.0)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  process.env.BRAINTRUST_SAMPLE_RATE = '0.0'  // Global: 0%

  const result1 = await runPythonAgent({
    prompt: 'What is 1+1?',
    verbose: true,
    observability: {
      sample: 1.0  // Override: always trace
    }
  })
  console.log(`✅ Result: ${result1}\n`)

  // Test 2: Deterministic sampling (same prompt should always sample the same way)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Test 2: Deterministic sampling')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Set sample rate to 50%
  process.env.BRAINTRUST_SAMPLE_RATE = '0.5'

  // Test same prompt twice - should get same sampling decision both times
  const testPrompt = 'What is the capital of France?'

  console.log('First execution:')
  await runPythonAgent({
    prompt: testPrompt,
    verbose: true,
  })

  console.log('\nSecond execution (same prompt):')
  await runPythonAgent({
    prompt: testPrompt,
    verbose: true,
  })

  console.log('\n✅ Both executions should show the same sampling decision')
  console.log('   (Either both traced or both sampled out)\n')

  // Test 3: Different prompts with 50% sampling
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Test 3: Different prompts (50% rate)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  const prompts = [
    'What is 2+2?',
    'What is 3+3?',
    'What is 4+4?',
    'What is 5+5?',
  ]

  let tracedCount = 0
  let sampledOutCount = 0

  for (const prompt of prompts) {
    console.log(`Testing: "${prompt}"`)
    // Capture output to detect sampling
    const originalLog = console.log
    let wasTraced = true
    console.log = (...args) => {
      if (args[0]?.includes('Trace sampled out')) {
        wasTraced = false
        sampledOutCount++
      }
      originalLog(...args)
    }

    await runPythonAgent({
      prompt,
      verbose: true,
    })

    console.log = originalLog

    if (wasTraced && !args[0]?.includes('Trace sampled out')) {
      tracedCount++
    }
  }

  console.log(`\n📊 Results: ${tracedCount} traced, ${sampledOutCount} sampled out`)
  console.log(`   Expected: ~50% traced with deterministic hashing\n`)

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ Sampling tests complete!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

testSampling().catch(console.error)
