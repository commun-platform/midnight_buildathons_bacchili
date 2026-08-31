import assert from 'node:assert/strict';
import test from 'node:test';

import * as Cause from 'effect/Cause';
import * as Runtime from 'effect/Runtime';

import { safeErrorCauses } from './diagnostics.js';

test('safeErrorCauses reports nested SDK errors without unrelated fields', () => {
  const nodeError = Object.assign(new Error('Transaction is invalid'), {
    _tag: 'TransactionInvalidError',
    txData: new Uint8Array([1, 2, 3]),
  });
  const submissionError = Object.assign(new Error('Transaction submission error'), {
    _tag: 'SubmissionError',
    cause: nodeError,
  });

  assert.deepEqual(safeErrorCauses(submissionError), [
    {
      name: 'Error',
      tag: 'SubmissionError',
      message: 'Transaction submission error',
      code: null,
    },
    {
      name: 'Error',
      tag: 'TransactionInvalidError',
      message: 'Transaction is invalid',
      code: null,
    },
  ]);
});

test('safeErrorCauses terminates cyclic cause chains', () => {
  const error = new Error('cycle');
  error.cause = error;
  assert.equal(safeErrorCauses(error).length, 1);
});

test('safeErrorCauses unwraps Effect FiberFailure causes', () => {
  const nodeError = Object.assign(new Error('Transaction is invalid'), {
    _tag: 'TransactionInvalidError',
    txData: new Uint8Array([1, 2, 3]),
  });
  const submissionError = Object.assign(new Error('Transaction submission error'), {
    _tag: 'SubmissionError',
    cause: nodeError,
  });
  const fiberFailure = Runtime.makeFiberFailure(Cause.fail(submissionError));

  assert.deepEqual(safeErrorCauses(fiberFailure), [
    {
      name: 'Error',
      tag: 'SubmissionError',
      message: 'Transaction submission error',
      code: null,
    },
    {
      name: 'Error',
      tag: 'TransactionInvalidError',
      message: 'Transaction is invalid',
      code: null,
    },
  ]);
});
