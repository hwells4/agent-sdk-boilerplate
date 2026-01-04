/**
 * Basic TypeScript Example
 *
 * This demonstrates how to use TypeScript to orchestrate Python-based
 * Claude agents running in E2B sandboxes.
 *
 * Run this example:
 *   npm install
 *   npm run ts:example
 *
 * Or directly:
 *   npx tsx examples/basic_typescript.ts
 */

import 'dotenv/config'
import { runPythonAgent, runPythonAgentDetailed } from './lib/agent'

/**
 * Example 1: Simple agent execution
 */
async function simpleExample() {
  console.log('='.repeat(60))
  console.log('Example 1: Simple Agent Execution')
  console.log('='.repeat(60))

  try {
    const result = await runPythonAgent({
      prompt: 'What is 2 + 2? Just give me the number.',
      timeout: 60,
      verbose: true,
    })

    console.log('\nAgent Result:')
    console.log(result)
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error)
  }
}

/**
 * Example 2: Detailed execution with error handling
 */
async function detailedExample() {
  console.log('\n' + '='.repeat(60))
  console.log('Example 2: Detailed Execution')
  console.log('='.repeat(60))

  try {
    const execution = await runPythonAgentDetailed({
      prompt: 'List the first 5 prime numbers.',
      timeout: 90,
      verbose: true,
    })

    console.log('\nExecution Details:')
    console.log('Exit Code:', execution.exitCode)
    console.log('STDOUT:', execution.stdout)

    if (execution.stderr) {
      console.log('STDERR:', execution.stderr)
    }

    if (execution.exitCode === 0) {
      console.log('\n✅ Agent completed successfully')
    } else {
      console.log('\n❌ Agent failed')
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error)
  }
}

/**
 * Example 3: File operations in the sandbox
 */
async function fileOperationsExample() {
  console.log('\n' + '='.repeat(60))
  console.log('Example 3: File Operations')
  console.log('='.repeat(60))

  try {
    const result = await runPythonAgent({
      prompt: `
Create a file called hello.txt with the content "Hello from Claude Agent!"
Then read the file and tell me what it says.
      `.trim(),
      timeout: 120,
      verbose: true,
    })

    console.log('\nAgent Result:')
    console.log(result)
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error)
  }
}

/**
 * Example 4: Code generation
 */
async function codeGenerationExample() {
  console.log('\n' + '='.repeat(60))
  console.log('Example 4: Code Generation')
  console.log('='.repeat(60))

  try {
    const result = await runPythonAgent({
      prompt: `
Write a Python function to calculate fibonacci numbers recursively.
Just show me the code, no explanation needed.
      `.trim(),
      timeout: 90,
      verbose: true,
    })

    console.log('\nGenerated Code:')
    console.log(result)
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error)
  }
}

/**
 * Example 5: Multiple sequential tasks
 */
async function sequentialTasksExample() {
  console.log('\n' + '='.repeat(60))
  console.log('Example 5: Sequential Tasks')
  console.log('='.repeat(60))

  const tasks = [
    'What is the capital of France?',
    'What is 15 * 23?',
    'List 3 programming languages.',
  ]

  for (const [index, task] of tasks.entries()) {
    console.log(`\nTask ${index + 1}: ${task}`)

    try {
      const result = await runPythonAgent({
        prompt: task,
        timeout: 60,
        verbose: false, // Less verbose for multiple tasks
      })

      console.log('Result:', result)
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error)
    }
  }
}

/**
 * Example 6: Configuration validation
 */
async function validateConfiguration() {
  console.log('\n' + '='.repeat(60))
  console.log('Configuration Check')
  console.log('='.repeat(60))

  const templateId = process.env.E2B_TEMPLATE_ID
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN

  console.log('\nEnvironment Variables:')
  console.log('E2B_TEMPLATE_ID:', templateId ? '✅ Set' : '❌ Missing')
  console.log('CLAUDE_CODE_OAUTH_TOKEN:', oauthToken ? '✅ Set' : '❌ Missing')

  if (!templateId || !oauthToken) {
    console.log('\n⚠️  Configuration incomplete!')
    console.log('Run: ./setup.sh')
    return false
  }

  console.log('\n✅ Configuration complete!')
  return true
}

/**
 * Main function - run all examples
 */
async function main() {
  console.log('\n🚀 Claude Agent SDK - TypeScript Examples\n')

  // Check configuration first
  const isConfigured = await validateConfiguration()

  if (!isConfigured) {
    console.log('\nSkipping examples due to missing configuration.')
    process.exit(1)
  }

  // Uncomment the examples you want to run:

  await simpleExample()
  // await detailedExample()
  // await fileOperationsExample()
  // await codeGenerationExample()
  // await sequentialTasksExample()

  console.log('\n' + '='.repeat(60))
  console.log('✅ Examples completed!')
  console.log('='.repeat(60))
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

// Export for use as a module
export {
  simpleExample,
  detailedExample,
  fileOperationsExample,
  codeGenerationExample,
  sequentialTasksExample,
  validateConfiguration,
}
