import { BridaClient, createIdempotencyKey } from '@brida/sdk'

const apiKey = process.env.BRIDA_API_KEY
if (!apiKey) throw new Error('Set BRIDA_API_KEY before running this example.')

const brida = new BridaClient({ apiKey })

const result = await brida.reflex.run('agent-wakeup', {
  idempotencyKey: createIdempotencyKey(),
  state: {
    source: 'github',
    event: 'check_run',
    conclusion: 'failure',
    summary: 'Synthetic CI example: required checks failed.',
  },
})

console.log({
  branch: result.decision.branch,
  reason: result.decision.reason,
  evidenceStatus: result.decision.evidence_status,
  remaining: result.capacity.remaining,
  receiptId: result.receipt_id,
})
