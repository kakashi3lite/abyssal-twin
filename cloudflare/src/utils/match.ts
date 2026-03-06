/**
 * Exhaustive Pattern Matching with Compile-Time Completeness Checking
 * 
 * These utilities ensure all cases are handled at compile time,
 * preventing runtime failures from unhandled cases.
 */

/**
 * Exhaustive pattern matching with compile-time completeness checking.
 * Prevents runtime failures from unhandled cases.
 * 
 * @example
 * ```typescript
 * type Status = 'idle' | 'loading' | 'success' | 'error';
 * 
 * const result = match(status, {
 *   idle: () => 'Waiting...',
 *   loading: () => 'Loading...',
 *   success: () => 'Done!',
 *   error: () => 'Failed!'
 * });
 * ```
 */
export function match<T extends string | number | symbol, R>(
  value: T,
  cases: { [K in T]: (v: T) => R }
): R {
  const handler = cases[value];
  if (!handler) {
    throw new Error(`Non-exhaustive match for value: ${String(value)}`);
  }
  return handler(value);
}

/**
 * Async variant for promise-returning handlers
 * 
 * @example
 * ```typescript
 * const result = await matchAsync(status, {
 *   idle: async () => await fetchIdleState(),
 *   loading: async () => await fetchLoadingState(),
 *   success: async () => await fetchSuccessState(),
 *   error: async () => await fetchErrorState()
 * });
 * ```
 */
export async function matchAsync<T extends string | number | symbol, R>(
  value: T,
  cases: { [K in T]: (v: T) => Promise<R> | R }
): Promise<R> {
  const handler = cases[value];
  if (!handler) {
    throw new Error(`Non-exhaustive async match for value: ${String(value)}`);
  }
  return await handler(value);
}

/**
 * Optional match - returns undefined if no case matches instead of throwing
 * 
 * @example
 * ```typescript
 * const result = matchOptional(status, {
 *   idle: () => 'Waiting...',
 *   loading: () => 'Loading...'
 * });
 * // result is string | undefined
 * ```
 */
export function matchOptional<T extends string | number | symbol, R>(
  value: T,
  cases: { [K in T]?: (v: T) => R }
): R | undefined {
  const handler = cases[value];
  return handler ? handler(value) : undefined;
}

/**
 * Match with default case - always returns a value
 * 
 * @example
 * ```typescript
 * const result = matchWithDefault(status, {
 *   idle: () => 'Waiting...',
 *   loading: () => 'Loading...'
 * }, () => 'Unknown state');
 * ```
 */
export function matchWithDefault<T extends string | number | symbol, R>(
  value: T,
  cases: { [K in T]?: (v: T) => R },
  defaultCase: (v: T) => R
): R {
  const handler = cases[value];
  return handler ? handler(value) : defaultCase(value);
}

/**
 * Type guard helper for narrowing discriminated unions
 * 
 * @example
 * ```typescript
 * type Message = 
 *   | { type: 'state'; data: AUVState }
 *   | { type: 'alert'; data: AnomalyAlert };
 * 
 * if (isMessageOfType(message, 'state')) {
 *   // message.data is AUVState
 * }
 * ```
 */
export function isMessageOfType<T extends { type: string }, K extends T['type']>(
  message: T,
  type: K
): message is Extract<T, { type: K }> {
  return message.type === type;
}

/**
 * Assert that a value is never (for exhaustive checks)
 * 
 * @example
 * ```typescript
 * switch (status) {
 *   case 'idle': return 'idle';
 *   case 'loading': return 'loading';
 *   default: assertNever(status); // Compile error if new status added
 * }
 * ```
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
