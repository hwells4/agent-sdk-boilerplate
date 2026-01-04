/**
 * Streaming Example - Real-time Agent Communication
 *
 * This example demonstrates various streaming patterns for Python→TypeScript
 * communication using E2B sandboxes.
 *
 * Run this example:
 *   npm install
 *   npx tsx examples/streaming_example.ts
 */

import 'dotenv/config'
import { Sandbox } from '@e2b/code-interpreter'

/**
 * Example 1: Basic stdout/stderr streaming
 */
async function basicStreamingExample() {
  console.log('\n' + '='.repeat(60))
  console.log('Example 1: Basic Streaming')
  console.log('='.repeat(60))

  const sandbox = await Sandbox.create()

  console.log('\nRunning command with streaming output...\n')

  await sandbox.commands.run(
    'for i in {1..5}; do echo "Line $i"; sleep 1; done',
    {
      onStdout: (data) => {
        // Data streams in real-time as the command executes
        process.stdout.write(`[STDOUT] ${data}`)
      },
      onStderr: (data) => {
        process.stderr.write(`[STDERR] ${data}`)
      },
    }
  )

  await sandbox.kill()
  console.log('\n✅ Streaming complete')
}

/**
 * Example 2: Python code execution with streaming
 */
async function pythonStreamingExample() {
  console.log('\n' + '='.repeat(60))
  console.log('Example 2: Python Code Streaming')
  console.log('='.repeat(60))

  const sandbox = await Sandbox.create()

  const pythonCode = `
import time
import sys

print("Starting long computation...")
time.sleep(1)

for i in range(5):
    print(f"Processing item {i+1}/5", flush=True)
    time.sleep(0.5)

print("Computation complete!", flush=True)
`

  console.log('\nExecuting Python code with streaming...\n')

  await sandbox.runCode(pythonCode, {
    onStdout: (data) => {
      console.log(`📊 ${data.trim()}`)
    },
    onStderr: (data) => {
      console.error(`❌ Error: ${data}`)
    },
    onError: (error) => {
      console.error('💥 Execution Error:', error)
    },
  })

  await sandbox.kill()
  console.log('\n✅ Python execution complete')
}

/**
 * Example 3: Structured JSON streaming
 */
async function structuredStreamingExample() {
  console.log('\n' + '='.repeat(60))
  console.log('Example 3: Structured JSON Streaming')
  console.log('='.repeat(60))

  const sandbox = await Sandbox.create()

  const pythonCode = `
import json
import time

def emit(event_type: str, data: dict):
    """Emit structured JSON events"""
    event = {
        "type": event_type,
        "data": data
    }
    print(json.dumps(event), flush=True)

# Emit various event types
emit("start", {"message": "Task initiated"})
time.sleep(0.5)

emit("progress", {"percent": 25, "status": "Loading data"})
time.sleep(0.5)

emit("progress", {"percent": 50, "status": "Processing"})
time.sleep(0.5)

emit("progress", {"percent": 75, "status": "Analyzing"})
time.sleep(0.5)

emit("result", {"value": 42, "confidence": 0.95})
time.sleep(0.5)

emit("complete", {"duration": 2.5})
`

  console.log('\nStreaming structured events...\n')

  await sandbox.runCode(pythonCode, {
    onStdout: (data) => {
      try {
        const event = JSON.parse(data.trim())

        switch (event.type) {
          case 'start':
            console.log(`🚀 ${event.data.message}`)
            break
          case 'progress':
            console.log(
              `⏳ Progress: ${event.data.percent}% - ${event.data.status}`
            )
            break
          case 'result':
            console.log(
              `📈 Result: ${event.data.value} (confidence: ${event.data.confidence})`
            )
            break
          case 'complete':
            console.log(`✅ Completed in ${event.data.duration}s`)
            break
          default:
            console.log(`📦 Unknown event:`, event)
        }
      } catch (e) {
        // Handle non-JSON output
        console.log(`📄 Raw output: ${data}`)
      }
    },
  })

  await sandbox.kill()
  console.log('\n✅ Structured streaming complete')
}

/**
 * Example 4: Background process streaming
 */
async function backgroundStreamingExample() {
  console.log('\n' + '='.repeat(60))
  console.log('Example 4: Background Process Streaming')
  console.log('='.repeat(60))

  const sandbox = await Sandbox.create()

  const backgroundScript = `
import time

print("Background task started", flush=True)

for i in range(10):
    print(f"Background: Step {i+1}/10", flush=True)
    time.sleep(0.5)

print("Background task complete", flush=True)
`

  await sandbox.files.write('/home/user/background_task.py', backgroundScript)

  console.log('\nStarting background process...\n')

  // Start background process
  const handle = await sandbox.commands.run(
    'python3 /home/user/background_task.py',
    {
      background: true,
      timeout: 0, // No timeout for long-running tasks
      onStdout: (data) => {
        console.log(`🔄 ${data.trim()}`)
      },
      onStderr: (data) => {
        console.error(`❌ ${data}`)
      },
    }
  )

  console.log(`📍 Process started with PID: ${handle.pid}`)
  console.log('💡 Doing other work while background process runs...\n')

  // Simulate doing other work
  await new Promise((resolve) => setTimeout(resolve, 2000))
  console.log('💡 Other work complete, waiting for background process...\n')

  // Wait for background process to complete
  const result = await handle.wait()
  console.log(
    `\n✅ Background process completed with exit code: ${result.exitCode}`
  )

  await sandbox.kill()
}

/**
 * Example 5: Enhanced Claude Agent with streaming
 */
async function streamingAgentExample() {
  console.log('\n' + '='.repeat(60))
  console.log('Example 5: Streaming Claude Agent')
  console.log('='.repeat(60))

  const templateId = process.env.E2B_TEMPLATE_ID
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN

  if (!templateId || !oauthToken) {
    console.log('⚠️  E2B_TEMPLATE_ID or CLAUDE_CODE_OAUTH_TOKEN not set')
    console.log('Skipping agent example')
    return
  }

  const sandbox = await Sandbox.create({
    template: templateId,
    timeoutMs: 120000,
  })

  await sandbox.commands.run(`export CLAUDE_CODE_OAUTH_TOKEN="${oauthToken}"`)

  const prompt = 'List the first 5 prime numbers with a brief explanation.'

  // Enhanced Python agent code with streaming
  const pythonAgentCode = `
import asyncio
import json
import sys
from claude_agent_sdk import query

async def main():
    prompt = json.loads(${JSON.stringify(JSON.stringify(prompt))})

    print(json.dumps({"type": "start", "data": "Querying Claude agent..."}), flush=True)

    result = None
    async for msg in query(prompt=prompt):
        # Stream any intermediate content
        if hasattr(msg, "content") and msg.content:
            print(json.dumps({"type": "chunk", "data": msg.content}), flush=True)

        if hasattr(msg, "result"):
            result = msg.result

    if result:
        print(json.dumps({"type": "complete", "data": result}), flush=True)

asyncio.run(main())
`

  await sandbox.files.write('/home/user/streaming_agent.py', pythonAgentCode)

  console.log('\nStreaming agent output...\n')

  let fullOutput = ''

  await sandbox.commands.run('python3 /home/user/streaming_agent.py', {
    timeoutMs: 120000,
    onStdout: (data) => {
      try {
        const event = JSON.parse(data.trim())

        switch (event.type) {
          case 'start':
            console.log(`🤖 ${event.data}`)
            break
          case 'chunk':
            process.stdout.write(event.data)
            fullOutput += event.data
            break
          case 'complete':
            console.log(`\n\n✅ Agent complete`)
            console.log(`\nFinal result:\n${event.data}`)
            break
        }
      } catch (e) {
        // Handle non-JSON output
        console.log(data)
      }
    },
    onStderr: (data) => {
      console.error(`⚠️  ${data}`)
    },
  })

  await sandbox.kill()
}

/**
 * Example 6: Multiple parallel streaming tasks
 */
async function parallelStreamingExample() {
  console.log('\n' + '='.repeat(60))
  console.log('Example 6: Parallel Streaming Tasks')
  console.log('='.repeat(60))

  const sandbox = await Sandbox.create()

  const tasks = [
    { id: 1, command: 'echo "Task 1 started"; sleep 2; echo "Task 1 done"' },
    { id: 2, command: 'echo "Task 2 started"; sleep 1; echo "Task 2 done"' },
    { id: 3, command: 'echo "Task 3 started"; sleep 3; echo "Task 3 done"' },
  ]

  console.log('\nRunning tasks in parallel...\n')

  const handles = await Promise.all(
    tasks.map((task) =>
      sandbox.commands.run(task.command, {
        background: true,
        onStdout: (data) => {
          console.log(`📦 Task ${task.id}: ${data.trim()}`)
        },
      })
    )
  )

  console.log(
    `\n🚀 Started ${handles.length} tasks: ${handles.map((h) => h.pid).join(', ')}`
  )
  console.log('⏳ Waiting for all tasks to complete...\n')

  // Wait for all tasks to complete
  const results = await Promise.all(handles.map((h) => h.wait()))

  console.log(
    `\n✅ All tasks completed with exit codes: ${results.map((r) => r.exitCode).join(', ')}`
  )

  await sandbox.kill()
}

/**
 * Example 7: Error handling in streaming
 */
async function errorHandlingExample() {
  console.log('\n' + '='.repeat(60))
  console.log('Example 7: Error Handling in Streaming')
  console.log('='.repeat(60))

  const sandbox = await Sandbox.create()

  const faultyPythonCode = `
import sys
import time

print("Starting task...", flush=True)
time.sleep(1)

print("This goes to stdout", flush=True)
print("This goes to stderr", file=sys.stderr, flush=True)
time.sleep(1)

# This will cause an error
raise ValueError("Intentional error for demonstration")
`

  console.log('\nExecuting code with intentional error...\n')

  try {
    await sandbox.runCode(faultyPythonCode, {
      onStdout: (data) => {
        console.log(`✅ STDOUT: ${data.trim()}`)
      },
      onStderr: (data) => {
        console.log(`⚠️  STDERR: ${data.trim()}`)
      },
      onError: (error) => {
        console.log(`❌ EXECUTION ERROR:`)
        console.log(error)
      },
    })
  } catch (error) {
    console.log('\n💥 Caught exception:', error instanceof Error ? error.message : error)
  }

  await sandbox.kill()
  console.log('\n✅ Error handling example complete')
}

/**
 * Main function
 */
async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 E2B Streaming Examples')
  console.log('='.repeat(60))

  try {
    // Run all examples
    await basicStreamingExample()
    await pythonStreamingExample()
    await structuredStreamingExample()
    await backgroundStreamingExample()
    await parallelStreamingExample()
    await errorHandlingExample()
    await streamingAgentExample()

    console.log('\n' + '='.repeat(60))
    console.log('✅ All examples completed successfully!')
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n💥 Fatal error:', error)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  main()
}

// Export for use as a module
export {
  basicStreamingExample,
  pythonStreamingExample,
  structuredStreamingExample,
  backgroundStreamingExample,
  streamingAgentExample,
  parallelStreamingExample,
  errorHandlingExample,
}
