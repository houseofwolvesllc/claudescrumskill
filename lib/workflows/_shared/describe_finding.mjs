// describe_finding — turn a review's findings into the blocker lines a blocked
// story reports. Canonical source of truth; inlined into sprint_pipeline.js.
// Unit-tested by describe_finding.test.mjs.
//
// A blocked story used to report `blockers: [null, null]`. The review had said
// exactly what was wrong — "require() cannot load .mjs ES modules, test will
// crash" — and the pipeline read `finding.title` off a finding that carries no
// such field, so every blocker serialized to null. The story was told it was
// blocked and never told why.
//
// This is the fifth instance of one defect: a value consumed that nothing
// supplies. It survives unit tests because a test constructs the finding it
// wants and passes it in directly, so the field is present exactly where it is
// read and absent only in production. What stops it is naming the shape in the
// schema — which is why the finding item is now declared there rather than left
// as a bare array — and reading through one function that can be tested against
// the shape the schema promises.
//
// A finding is labelled by its short summary when it has one, because the
// blocker list is scanned rather than read; the full sentence is the fallback,
// and the file is better than nothing. A finding that carries none of the three
// still produces a line, since a silent gap in the list is how a blocker goes
// missing without anyone noticing it went missing.

const UNDESCRIBED = 'an unlabelled finding'

export function findingLabels(findings) {
  return [...severityList(findings, 'critical'), ...severityList(findings, 'warning')].map(findingLabel)
}

function severityList(findings, severity) {
  const list = findings?.[severity]
  return Array.isArray(list) ? list : []
}

export function findingLabel(finding) {
  return firstDescribed(finding) || UNDESCRIBED
}

// Ordered shortest-useful first: the list is scanned, not read.
function firstDescribed(finding) {
  return [finding?.short_summary, finding?.summary, finding?.file].map(trimmed).find(Boolean) || ''
}

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : ''
}
