const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// A probe's schema is the contract between the agent that answers it and the
// code that reads the answer. Three times now a field has been read from a
// probe result that the probe was never asked to supply — sessionModel,
// viableProvisioning on the error path, and copyOnWriteSupported — and each
// time it silently took its default in every real run while unit tests passed,
// because unit tests pass the value directly.
//
// The failure is invisible at the read site: `const { x } = probe` looks
// identical whether or not anything ever sets x. This asserts the contract
// statically, which is the only place the mismatch is visible.
const PIPELINE = path.join(__dirname, '..', 'lib', 'workflows', 'sprint_pipeline.js');

const SCHEMA_PATTERN = /const (\w*PROBE\w*_SCHEMA) = \{[\s\S]*?properties: \{([\s\S]*?)\n  \},/g;
const PROPERTY_PATTERN = /^\s{4}(\w+):/gm;

// The probe result is threaded under these names; a destructure off any of them
// is reading the probe's contract.
const PROBE_RESULT_NAMES = ['repoLayout', 'probe'];

function pipelineSource() {
  return fs.readFileSync(PIPELINE, 'utf8');
}

function schemaFields(source) {
  const fields = new Map();
  for (const [, name, body] of source.matchAll(SCHEMA_PATTERN)) {
    fields.set(name, new Set([...body.matchAll(PROPERTY_PATTERN)].map(([, key]) => key)));
  }
  return fields;
}

// Property reads off the probe result, e.g. `repoLayout.rootFiles`.
function readsOffProbeResult(source) {
  const reads = new Set();
  for (const name of PROBE_RESULT_NAMES) {
    for (const [, key] of source.matchAll(new RegExp(`\\b${name}\\.(\\w+)`, 'g'))) {
      reads.add(key);
    }
  }
  return reads;
}

test('every probe schema declares at least one field', () => {
  const schemas = schemaFields(pipelineSource());

  assert.ok(schemas.size > 0, 'no probe schema found — the pattern needs updating');
  for (const [name, fields] of schemas) {
    assert.ok(fields.size > 0, `${name} declares no properties`);
  }
});

test('every field read off a probe result is one the probe schema asks for', () => {
  const source = pipelineSource();
  const declared = new Set([...schemaFields(source).values()].flatMap(set => [...set]));
  const undeclared = [...readsOffProbeResult(source)].filter(field => !declared.has(field));

  assert.deepEqual(
    undeclared,
    [],
    `read off a probe result but absent from every probe schema: ${undeclared.join(', ')}. ` +
      `Such a field is undefined in every real run; add it to the schema and the probe prompt.`,
  );
});
