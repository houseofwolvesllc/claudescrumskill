const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ADRS_ROOT = path.join(__dirname, '..', 'docs', 'adrs');

// An ADR without a status is a decision nobody can act on, and one without a date
// is a decision nobody can order against the others. The numbered filename is what
// makes a file a decision record here, so an index or a README sitting in the same
// directory is deliberately outside this guard.
const ADR_FILENAME = /^\d{4}-.+\.md$/;

const REQUIRED_HEADER_FIELDS = {
  Status: /^- \*\*Status:\*\* \S/m,
  Date: /^- \*\*Date:\*\* \d{4}-\d{2}-\d{2}$/m,
};

function adrFilenames() {
  return fs.readdirSync(ADRS_ROOT).filter(name => ADR_FILENAME.test(name)).sort();
}

function undeclaredFieldsOf(filename) {
  const markdown = fs.readFileSync(path.join(ADRS_ROOT, filename), 'utf8');

  return Object.entries(REQUIRED_HEADER_FIELDS)
    .filter(([, declaration]) => !declaration.test(markdown))
    .map(([field]) => `${filename} declares no ${field}`);
}

test('every ADR declares a status and a date', () => {
  const undeclared = adrFilenames().flatMap(undeclaredFieldsOf);

  assert.deepEqual(undeclared, [], `incomplete ADR headers: ${undeclared.join('; ')}`);
});

test('the guard reads the numbered decision records and skips an index or README', () => {
  const filenames = adrFilenames();

  assert.ok(filenames.length > 0, `no numbered decision records found under ${ADRS_ROOT}`);
  assert.ok(!ADR_FILENAME.test('README.md'), 'a README in docs/adrs/ is not a decision record');
  assert.ok(!ADR_FILENAME.test('index.md'), 'an index in docs/adrs/ is not a decision record');
});
