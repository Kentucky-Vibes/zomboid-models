import { validateBytes } from 'gltf-validator';

/**
 * Runs the Khronos glTF validator on a GLB and returns the error and warning messages.
 * External images are not resolved, so their absence is not reported.
 */
export async function validateGlb(glb: Uint8Array): Promise<string[]> {
  const report = await validateBytes(glb, {
    format: 'glb',
    maxIssues: 50,
    ignoredIssues: ['UNSUPPORTED_EXTENSION'],
    externalResourceFunction: () =>
      Promise.reject(new Error('external resources are not loaded in tests')),
  });
  return report.issues.messages
    .filter((issue) => issue.severity <= 1 && issue.code !== 'IO_ERROR')
    .map((issue) => `${issue.code} ${issue.pointer ?? ''}: ${issue.message}`);
}
