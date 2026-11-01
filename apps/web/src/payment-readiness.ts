export type PaymentApiState = 'checking' | 'ready' | 'unavailable'

/** Never enable a checkout action before its API and method are confirmed live. */
export function paymentActionEnabled(
  apiState: PaymentApiState,
  methodConfigured: boolean,
  busy: boolean,
): boolean {
  return apiState === 'ready' && methodConfigured && !busy
}
