import { Sandbox } from "@e2b/code-interpreter";

/**
 * Safely kill an E2B sandbox, handling cases where it may already be terminated.
 * @param sandboxId - The E2B sandbox ID (or undefined if sandbox was never created)
 * @returns true if sandbox was killed, false if sandboxId was undefined
 */
export async function killSandboxSafely(sandboxId: string | undefined): Promise<boolean> {
  if (!sandboxId) {
    return false;
  }

  try {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.kill();
    return true;
  } catch (error) {
    // Sandbox may already be terminated - this is fine
    console.log(`Sandbox ${sandboxId} may already be terminated: ${error}`);
    return false;
  }
}
