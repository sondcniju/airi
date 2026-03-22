/**
 * Helper to retry an async function multiple times with optional backoff.
 */
export async function withRetry(fn, retries = 3, delay = 1000) {
  try {
    return await fn()
  }
  catch (error) {
    if (retries <= 0)
      throw error
    console.warn(`[Retry] Action failed, retrying in ${delay}ms... (${retries} retries left)`)
    await new Promise(resolve => setTimeout(resolve, delay))
    return withRetry(fn, retries - 1, delay * 2)
  }
}

/**
 * Wraps a Vite plugin's configResolved hook to make it resilient to failures.
 * If the hook fails (e.g. download error), it will retry and ultimately let the build proceed.
 */
export function resilient(plugin) {
  const originalHook = plugin.configResolved
  if (!originalHook)
    return plugin

  plugin.configResolved = async (config) => {
    try {
      await withRetry(() => originalHook.call(plugin, config), 3, 2000)
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`[ResilientPlugin] ${plugin.name} failed after all retries:`, message)
      console.warn(`[ResilientPlugin] Proceeding without ${plugin.name} assets.`)
    }
  }
  return plugin
}
