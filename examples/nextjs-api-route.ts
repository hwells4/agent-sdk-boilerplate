/**
 * Next.js API Route Example
 *
 * This shows how to integrate Python-based Claude agents into a Next.js app.
 * The API route handles HTTP requests and triggers agents in E2B sandboxes.
 *
 * Usage in Next.js 13+ (App Router):
 *   Copy this to: app/api/agent/route.ts
 *
 * Usage in Next.js Pages Router:
 *   Adapt this to: pages/api/agent.ts
 */

import { runPythonAgent, runPythonAgentDetailed } from '../src/agent'

// ============================================================================
// App Router (Next.js 13+)
// ============================================================================
// File: app/api/agent/route.ts

/**
 * POST /api/agent
 * Run a Claude agent and return the result.
 *
 * Request body:
 * {
 *   "prompt": "Your task for the agent",
 *   "timeout": 120,  // Optional, defaults to 120s
 *   "verbose": false // Optional, defaults to false
 * }
 *
 * Response:
 * {
 *   "result": "Agent's response"
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { prompt, timeout, verbose } = body

    if (!prompt || typeof prompt !== 'string') {
      return Response.json(
        { error: 'Invalid prompt. Must be a non-empty string.' },
        { status: 400 }
      )
    }

    // Run the Python agent in E2B sandbox
    const result = await runPythonAgent({
      prompt,
      timeout: timeout || 120,
      verbose: verbose || false,
    })

    return Response.json({ result })
  } catch (error) {
    console.error('Agent execution failed:', error)

    return Response.json(
      {
        error: 'Agent execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/agent/status
 * Check if the agent system is configured correctly.
 */
export async function GET() {
  const isConfigured = !!(
    process.env.E2B_TEMPLATE_ID && process.env.CLAUDE_CODE_OAUTH_TOKEN
  )

  return Response.json({
    configured: isConfigured,
    templateId: process.env.E2B_TEMPLATE_ID ? 'Set' : 'Missing',
    oauthToken: process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'Set' : 'Missing',
  })
}

// ============================================================================
// Pages Router (Next.js 12 and earlier)
// ============================================================================
// File: pages/api/agent.ts
//
// Uncomment this section if using Pages Router:

/*
import type { NextApiRequest, NextApiResponse } from 'next'
import { runPythonAgent } from '../../src/agent'

type ResponseData = {
  result?: string
  error?: string
  message?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { prompt, timeout, verbose } = req.body

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({
        error: 'Invalid prompt. Must be a non-empty string.'
      })
    }

    const result = await runPythonAgent({
      prompt,
      timeout: timeout || 120,
      verbose: verbose || false,
    })

    res.status(200).json({ result })
  } catch (error) {
    console.error('Agent execution failed:', error)

    res.status(500).json({
      error: 'Agent execution failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
*/

// ============================================================================
// Example: Streaming Response
// ============================================================================
// For long-running agents, you might want to stream results:
//
// export async function POST(req: Request) {
//   const { prompt } = await req.json()
//
//   const encoder = new TextEncoder()
//   const stream = new TransformStream()
//   const writer = stream.writable.getWriter()
//
//   // Run agent and stream updates
//   runPythonAgentDetailed({ prompt, verbose: true })
//     .then(result => {
//       writer.write(encoder.encode(JSON.stringify(result)))
//       writer.close()
//     })
//     .catch(error => {
//       writer.write(encoder.encode(JSON.stringify({ error: error.message })))
//       writer.close()
//     })
//
//   return new Response(stream.readable, {
//     headers: {
//       'Content-Type': 'text/event-stream',
//       'Cache-Control': 'no-cache',
//     },
//   })
// }

// ============================================================================
// Client-Side Usage Example
// ============================================================================
//
// In your React component:
//
// 'use client'
//
// import { useState } from 'react'
//
// export default function AgentDemo() {
//   const [prompt, setPrompt] = useState('')
//   const [result, setResult] = useState('')
//   const [loading, setLoading] = useState(false)
//
//   const runAgent = async () => {
//     setLoading(true)
//     try {
//       const response = await fetch('/api/agent', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ prompt, timeout: 180 }),
//       })
//
//       const data = await response.json()
//       setResult(data.result || data.error)
//     } catch (error) {
//       setResult('Request failed: ' + error.message)
//     } finally {
//       setLoading(false)
//     }
//   }
//
//   return (
//     <div>
//       <textarea
//         value={prompt}
//         onChange={(e) => setPrompt(e.target.value)}
//         placeholder="Enter your prompt..."
//       />
//       <button onClick={runAgent} disabled={loading}>
//         {loading ? 'Running...' : 'Run Agent'}
//       </button>
//       {result && <pre>{result}</pre>}
//     </div>
//   )
// }
