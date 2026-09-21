import { Brida } from '../src/index.js'

const apiKey = process.env.BRIDA_API_KEY
if (apiKey === undefined) throw new Error('BRIDA_API_KEY is required')

const brida = new Brida({ apiKey })

await brida.reflex.custom.draft({
  id: 'lead-fit',
  version: '1',
  name: 'Lead fit',
  maxStateBytes: 8192,
  questionSetVersion: 'lead-fit-questions@1',
  questions: {
    qualified: {
      type: 'binary',
      instructions: 'Is this lead a good fit for the stated ICP?',
    },
  },
  policyVersion: 'lead-fit-policy@1',
  declarativePolicy: {
    type: 'binary',
    questionId: 'qualified',
    trueBranch: 'qualified',
    falseBranch: 'ignore',
    uncertainBranch: 'review',
    trueWhenProbabilityAtLeast: 0.8,
    falseWhenProbabilityAtMost: 0.2,
  },
  fixtures: [{
    id: 'synthetic-qualified',
    evidenceClass: 'synthetic',
    state: { company: 'Synthetic Co', employeeCount: 25 },
    expectedBranch: 'qualified',
  }],
})

await brida.reflex.custom.activate('lead-fit', '1')

const result = await brida.reflex.run('lead-fit', {
  state: { company: 'Example Co', employeeCount: 30 },
})

console.log(result.decision.branch)
