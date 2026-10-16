// Classify by controlled provenance/status, never by provider message text.
// In particular, a parsing TypeError is not evidence of a network outage.
const programErrors = new Set(['TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError'])
const networkCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
  'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'])
const providers = new Set(['spotify', 'netease'])

export function providerFailure(source, error) {
  if (!providers.has(source)) throw new TypeError('Unknown music provider')
  const network = networkCodes.has(error?.code) || networkCodes.has(error?.cause?.code) ||
    ['AbortError', 'TimeoutError'].includes(error?.name)
  // Do not turn a library/programming exception into a retryable provider error.
  if (programErrors.has(error?.name) && !network) return error
  const status = Number(error?.status ?? error?.response?.status ?? error?.body?.code)
  return Object.assign(new Error(`${source} request failed`), {
    source,
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}),
    ...(network ? { transient: true, code: 'network-error' } : {}),
    ...(source === 'netease' && status === 301 ? { code: 'authorization-required' } : {}),
  })
}

export function classifySyncError(error) {
  if (error?.source === 'github-state') return 'state-storage'
  if (error?.pauseReason && Number.isFinite(error?.retryAt)) {
    return error.pauseReason === 'provider-cooldown' ? 'provider-cooldown' : 'safety-pause'
  }
  if (programErrors.has(error?.name)) return 'program-error'
  if (providers.has(error?.source)) {
    if (error.code === 'authorization-required' || [401, 403].includes(error.status)) return 'authorization-required'
    if (error.transient === true || error.status === 408 || (error.status >= 500 && error.status <= 599)) return 'provider-transient'
    return 'provider-failure'
  }
  return 'unexpected-error'
}

export function safeFailureDetails(error) {
  return {
    failureKind: classifySyncError(error),
    source: providers.has(error?.source) || error?.source === 'github-state' ? error.source : 'application',
    errorType: programErrors.has(error?.name) ? error.name : 'Error',
  }
}
