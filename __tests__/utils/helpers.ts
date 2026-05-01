/**
 * Test Helper Functions
 *
 * Utility functions for testing the pipeline system.
 */

import { PipelinePhase, PipelineStatus, PhaseStatus, PhaseResult } from '../../lib/pipeline/types';

describe('Test Helpers', () => {
  it('should provide helper utilities', () => {
    expect(PipelinePhase.INPUT_ANALYSIS).toBe('INPUT_ANALYSIS');
    expect(PipelineStatus.PENDING).toBe('PENDING');
    expect(PhaseStatus.PENDING).toBe('PENDING');
  });
});

/**
 * Create a delay promise (alias for wait)
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for a specified time (alias for delay)
 */
export function wait(ms: number): Promise<void> {
  return delay(ms);
}

/**
 * Generate random string
 */
export function randomString(length: number = 10): string {
  return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * Create mock file content
 */
export function createMockFileContent(lines: number = 100): string {
  return Array.from({ length: lines }, (_, i) => `Line ${i + 1}`).join('\n');
}

/**
 * Assert that a phase result is successful
 */
export function assertPhaseSuccess<T>(result: PhaseResult<T>): asserts result is PhaseResult<T> & { success: true; data: T } {
  expect(result.success).toBe(true);
  expect(result.status).toBe(PhaseStatus.COMPLETED);
  expect(result.data).toBeDefined();
}

/**
 * Assert that a phase result is a failure
 */
export function assertPhaseFailure<T>(result: PhaseResult<T>): asserts result is PhaseResult<T> & { success: false } {
  expect(result.success).toBe(false);
  expect(result.status).not.toBe(PhaseStatus.COMPLETED);
  expect(result.error).toBeDefined();
}

/**
 * Validate that required fields are present in an object
 */
export function validateRequiredFields(obj: any, fields: string[]): void {
  for (const field of fields) {
    expect(obj).toHaveProperty(field);
    expect(obj[field]).toBeDefined();
  }
}

// Made with Bob
