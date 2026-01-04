/**
 * Console Streaming Example
 *
 * Demonstrates real-time Claude agent execution with colored terminal output
 * showing different message types (tool calls, text, thinking, errors).
 *
 * Run: npm run ts:console-streaming
 */

import 'dotenv/config'
import { runPythonAgentStreaming } from './lib/agent'
import chalk from 'chalk'

async function example1_BasicStreaming() {
  console.log('\n' + '='.repeat(60))
  console.log(chalk.bold.cyan('Example 1: Basic Streaming'))
  console.log('='.repeat(60) + '\n')

  console.log(chalk.gray('Task: List the first 5 prime numbers\n'))

  await runPythonAgentStreaming({
    prompt: 'List the first 5 prime numbers with a brief explanation of what makes them prime.',
    verbose: true,
  })
}

async function example2_ToolUsageStreaming() {
  console.log('\n' + '='.repeat(60))
  console.log(chalk.bold.cyan('Example 2: Tool Usage with Streaming'))
  console.log('='.repeat(60) + '\n')

  console.log(chalk.gray('Task: Create and read a file (watch for 🔧 yellow tool calls)\n'))

  let toolCount = 0

  await runPythonAgentStreaming({
    prompt: 'Create a file called test.txt with the text "Hello from streaming!" and then read it back to verify it was created correctly.',
    verbose: true,
    onStream: {
      onToolUse: (id, name, input) => {
        toolCount++
        console.log(chalk.gray(`  [Debug] Tool #${toolCount}: ${name} (ID: ${id.substring(0, 8)}...)`))
      },
      onToolResult: (toolUseId, content, isError) => {
        if (isError) {
          console.log(chalk.red(`  [Debug] Tool ${toolUseId.substring(0, 8)} failed`))
        } else {
          console.log(chalk.gray(`  [Debug] Tool ${toolUseId.substring(0, 8)} succeeded`))
        }
      },
    },
  })

  console.log(chalk.gray(`\nTotal tools used: ${toolCount}`))
}

async function example3_CustomCallbacks() {
  console.log('\n' + '='.repeat(60))
  console.log(chalk.bold.cyan('Example 3: Custom Stream Callbacks with Statistics'))
  console.log('='.repeat(60) + '\n')

  console.log(chalk.gray('Task: Directory listing (collecting statistics)\n'))

  const stats = {
    textChunks: 0,
    toolsUsed: 0,
    thinkingBlocks: 0,
    totalCost: 0,
    durationMs: 0,
  }

  await runPythonAgentStreaming({
    prompt: 'What is the current directory? List its contents and tell me how many files are there.',
    onStream: {
      onText: (text) => {
        stats.textChunks++
      },
      onToolUse: (id, name, input) => {
        stats.toolsUsed++
      },
      onThinking: (thinking, signature) => {
        stats.thinkingBlocks++
      },
      onResult: (result, durationMs, cost) => {
        stats.totalCost = cost
        stats.durationMs = durationMs
      },
      onComplete: (status) => {
        console.log('\n' + chalk.bold('📊 Execution Statistics:'))
        console.log(chalk.gray(`  • Text chunks: ${stats.textChunks}`))
        console.log(chalk.gray(`  • Tools used: ${stats.toolsUsed}`))
        console.log(chalk.gray(`  • Thinking blocks: ${stats.thinkingBlocks}`))
        console.log(chalk.gray(`  • Duration: ${(stats.durationMs / 1000).toFixed(2)}s`))
        console.log(chalk.gray(`  • Cost: $${stats.totalCost.toFixed(4)}`))
        console.log(chalk.gray(`  • Status: ${status}`))
      },
    },
  })
}

async function example4_ErrorHandling() {
  console.log('\n' + '='.repeat(60))
  console.log(chalk.bold.cyan('Example 4: Error Handling'))
  console.log('='.repeat(60) + '\n')

  console.log(chalk.gray('Task: Attempt to read a non-existent file (watch for ❌ errors)\n'))

  let errorCaught = false

  await runPythonAgentStreaming({
    prompt: 'Read the contents of /nonexistent/file.txt and show me what it contains.',
    onStream: {
      onError: (error, message) => {
        errorCaught = true
        console.log(chalk.yellow(`\n[Error Handler] Caught error: ${error}`))
      },
      onToolResult: (toolUseId, content, isError) => {
        if (isError) {
          console.log(chalk.yellow(`[Error Handler] Tool failed: ${content.substring(0, 100)}`))
        }
      },
    },
  })

  if (errorCaught) {
    console.log(chalk.yellow('\n⚠️  Errors were handled gracefully'))
  }
}

async function example5_LongRunningTask() {
  console.log('\n' + '='.repeat(60))
  console.log(chalk.bold.cyan('Example 5: Long-Running Task with Progress'))
  console.log('='.repeat(60) + '\n')

  console.log(chalk.gray('Task: Multiple operations (see real-time progress)\n'))

  let startTime = Date.now()
  let lastUpdate = Date.now()

  await runPythonAgentStreaming({
    prompt: 'Create three files: alpha.txt with "AAA", beta.txt with "BBB", and gamma.txt with "CCC". Then list all .txt files in the directory.',
    verbose: true,
    onStream: {
      onToolUse: (id, name, input) => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(chalk.gray(`  [${elapsed}s] Tool started: ${name}`))
      },
      onText: (text) => {
        const now = Date.now()
        if (now - lastUpdate > 500) {  // Throttle updates
          const elapsed = ((now - startTime) / 1000).toFixed(1)
          console.log(chalk.gray(`  [${elapsed}s] Agent responding...`))
          lastUpdate = now
        }
      },
    },
  })

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log(chalk.gray(`\nTotal wall clock time: ${totalTime}s`))
}

async function main() {
  console.log('\n' + '='.repeat(60))
  console.log(chalk.bold.green('🎨 Claude Agent Console Streaming Examples'))
  console.log(chalk.gray('Demonstrating real-time streaming with colored output'))
  console.log('='.repeat(60))

  console.log(chalk.bold('\nColor Scheme:'))
  console.log(chalk.yellow.bold('  🔧 Yellow = Tool calls (Bash, Read, Write)'))
  console.log(chalk.white('  💬 White = Agent text responses'))
  console.log(chalk.magenta.dim('  🤔 Magenta = Extended thinking'))
  console.log(chalk.blue('  📦 Blue = Tool results'))
  console.log(chalk.red.bold('  ❌ Red = Errors'))
  console.log(chalk.green.bold('  ✅ Green = Success/completion'))

  try {
    await example1_BasicStreaming()
    await example2_ToolUsageStreaming()
    await example3_CustomCallbacks()
    await example4_ErrorHandling()
    await example5_LongRunningTask()

    console.log('\n' + '='.repeat(60))
    console.log(chalk.bold.green('✅ All examples completed successfully!'))
    console.log('='.repeat(60) + '\n')
  } catch (error) {
    console.error(chalk.red('\n💥 Fatal Error:'), error)
    if (error instanceof Error) {
      console.error(chalk.red(error.stack))
    }
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  main()
}

// Export examples for programmatic use
export {
  example1_BasicStreaming,
  example2_ToolUsageStreaming,
  example3_CustomCallbacks,
  example4_ErrorHandling,
  example5_LongRunningTask,
}
