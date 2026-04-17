/**
 * Tool Orchestration — US-005
 *
 * Partitions tool calls into parallel and serial batches based on
 * each tool's `isConcurrencySafe` flag, then executes them in order.
 *
 * Consecutive safe tools are grouped into a single parallel batch
 * (Promise.all). The first unsafe tool breaks the group and runs
 * as its own serial batch.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolCall {
  id: string
  name: string
  args: unknown
  metadata: { isConcurrencySafe: boolean }
}

export interface ToolResult {
  id: string
  name: string
  result: unknown
}

export interface Batch {
  calls: ToolCall[]
  /** true = run all calls in parallel, false = run single call serially */
  parallel: boolean
}

// ---------------------------------------------------------------------------
// partitionToolCalls
// ---------------------------------------------------------------------------

/**
 * Groups consecutive concurrency-safe tool calls into parallel batches.
 * Non-safe (serial) tools each become their own single-call batch.
 *
 * @example
 * ```
 * Input:  [list_instances(safe), search_web(safe), create_agent(unsafe)]
 * Output:
 *   Batch 1 (parallel): [list_instances, search_web]
 *   Batch 2 (serial):   [create_agent]
 * ```
 */
export function partitionToolCalls(toolCalls: ToolCall[]): Batch[] {
  const batches: Batch[] = []

  let currentParallelCalls: ToolCall[] = []

  const flushParallel = (): void => {
    if (currentParallelCalls.length > 0) {
      batches.push({ calls: currentParallelCalls, parallel: true })
      currentParallelCalls = []
    }
  }

  for (const call of toolCalls) {
    if (call.metadata.isConcurrencySafe) {
      currentParallelCalls.push(call)
    } else {
      // Flush any accumulated safe calls first
      flushParallel()
      // Unsafe call gets its own serial batch
      batches.push({ calls: [call], parallel: false })
    }
  }

  // Flush remaining safe calls
  flushParallel()

  return batches
}

// ---------------------------------------------------------------------------
// executeBatches
// ---------------------------------------------------------------------------

/**
 * Executes batches sequentially. Within each batch:
 * - parallel=true  → all calls run concurrently via Promise.all
 * - parallel=false → single call runs serially (awaited individually)
 *
 * Results are returned in the same order as the original tool calls
 * appeared across all batches.
 */
export async function executeBatches(
  batches: Batch[],
  executor: (call: ToolCall) => Promise<ToolResult>,
): Promise<ToolResult[]> {
  const results: ToolResult[] = []

  for (const batch of batches) {
    if (batch.parallel) {
      const batchResults = await Promise.all(batch.calls.map(executor))
      results.push(...batchResults)
    } else {
      // Serial batch — execute each call one at a time
      for (const call of batch.calls) {
        const result = await executor(call)
        results.push(result)
      }
    }
  }

  return results
}
