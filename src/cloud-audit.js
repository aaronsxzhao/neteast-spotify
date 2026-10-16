// Only explicitly selected, bounded diagnostic values reach public Actions logs.
// Never pass provider errors, account state, request URLs, or song metadata here.
const textFields = new Set(['phase', 'result', 'reason', 'retryAt', 'date', 'lastSyncedDate', 'timezone'])
const numberFields = new Set(['sourceCount', 'matchedCount', 'unmatchedCount', 'completedSongs', 'localHour', 'status', 'requests', 'cacheHits', 'retries', 'queryCount', 'catalogQueryCount', 'albumQueryCount', 'knownTrackQueryCount', 'queryBudget'])
const booleanFields = new Set(['force', 'recoveryOnly', 'recoveryPending', 'retryUnmatched', 'queryLimitsApplied', 'identityReviewRequired'])
const reasons = new Set(['provider-cooldown', 'local-backoff', 'already-synced', 'before-daily-window', 'run-budget', 'request-budget', 'transient-backoff', 'transient-retry'])
const failureKinds = new Set(['state-storage', 'provider-cooldown', 'safety-pause', 'program-error', 'authorization-required', 'provider-transient', 'provider-failure', 'unexpected-error'])
const errorTypes = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'URIError', 'EvalError'])

export function createCloudAudit(write = console.log, clock = () => new Date()) {
  return (event, fields = {}) => {
    try {
      const record = { event, at: clock().toISOString() }
      for (const [key, value] of Object.entries(fields)) {
        if (key === 'source' && ['github-state', 'spotify', 'netease', 'application'].includes(value)) record.source = value
        if (key === 'failureKind' && failureKinds.has(value)) record.failureKind = value
        if (key === 'errorType' && errorTypes.has(value)) record.errorType = value
        if (key === 'operation' && ['read', 'write', 'create'].includes(value)) record.operation = value
        if (key === 'attempt' && Number.isInteger(value) && value >= 1 && value <= 3) record.attempt = value
        if (key === 'code' && ['storage-unavailable', 'network-error', 'invalid-response', 'state-changed'].includes(value)) record.code = value
        if (key === 'reason' && value !== undefined && !reasons.has(value)) { record.reason = 'other-pause'; continue }
        if (textFields.has(key) && typeof value === 'string' && /^[\w\s/:.+*-]{1,80}$/.test(value)) record[key] = value
        if (numberFields.has(key) && Number.isFinite(value)) record[key] = value
        if (booleanFields.has(key) && typeof value === 'boolean') record[key] = value
      }
      write(`DAILY_RELAY_AUDIT ${JSON.stringify(record)}`)
    } catch { /* Observability must never change sync or retry behavior. */ }
  }
}
