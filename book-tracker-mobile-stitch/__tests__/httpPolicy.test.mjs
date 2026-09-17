// T-03 / T-15 / T-22 — src/services/httpPolicy.js pure rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAuthExpiredError, isRetryableRequest } from '../src/services/httpPolicy.js';

// ── isAuthExpiredError ──────────────────────────────────────────────────────
test('auth_expired_for_401_with_authorization_header', () => {
  assert.equal(isAuthExpiredError({ response: { status: 401 }, config: { headers: { Authorization: 'Bearer x' } } }), true);
});

test('not_auth_expired_for_401_without_authorization_header', () => {
  assert.equal(isAuthExpiredError({ response: { status: 401 }, config: { headers: {} } }), false);
});

test('not_auth_expired_when_skipAuthExpired', () => {
  assert.equal(isAuthExpiredError({ response: { status: 401 }, config: { headers: { Authorization: 'Bearer x' }, skipAuthExpired: true } }), false);
});

test('not_auth_expired_for_403_404_500_or_network_error', () => {
  for (const status of [403, 404, 500]) {
    assert.equal(isAuthExpiredError({ response: { status }, config: { headers: { Authorization: 'Bearer x' } } }), false, String(status));
  }
  assert.equal(isAuthExpiredError({ code: 'ERR_NETWORK', config: { headers: { Authorization: 'Bearer x' } } }), false);
});

test('not_auth_expired_when_config_missing', () => {
  assert.equal(isAuthExpiredError({ response: { status: 401 } }), false);
});

// ── isRetryableRequest ──────────────────────────────────────────────────────
test('retryable_get_on_ECONNABORTED', () => {
  assert.equal(isRetryableRequest({ code: 'ECONNABORTED', config: { method: 'get' } }), true);
});

test('retryable_get_on_ETIMEDOUT', () => {
  assert.equal(isRetryableRequest({ code: 'ETIMEDOUT', config: { method: 'get' } }), true);
});

test('retryable_get_on_ERR_NETWORK_or_no_response', () => {
  assert.equal(isRetryableRequest({ code: 'ERR_NETWORK', config: { method: 'get' } }), true);
  assert.equal(isRetryableRequest({ config: { method: 'get' } }), true);
});

test('missing_method_treated_as_get', () => {
  assert.equal(isRetryableRequest({ code: 'ECONNABORTED', config: {} }), true);
});

test('method_match_is_case_insensitive', () => {
  assert.equal(isRetryableRequest({ code: 'ECONNABORTED', config: { method: 'GET' } }), true);
});

test('not_retryable_for_post_put_patch_delete', () => {
  for (const method of ['post', 'put', 'patch', 'delete']) {
    assert.equal(isRetryableRequest({ code: 'ECONNABORTED', config: { method } }), false, method);
    assert.equal(isRetryableRequest({ config: { method } }), false, `${method} no response`);
  }
});

test('not_retryable_when_already_retried', () => {
  assert.equal(isRetryableRequest({ code: 'ECONNABORTED', config: { method: 'get', __retried: true } }), false);
});

test('not_retryable_for_get_with_http_error_response', () => {
  assert.equal(isRetryableRequest({ config: { method: 'get' }, response: { status: 500 } }), false);
  assert.equal(isRetryableRequest({ config: { method: 'get' }, response: { status: 401 } }), false);
});

test('not_retryable_when_config_missing', () => {
  assert.equal(isRetryableRequest({ code: 'ECONNABORTED' }), false);
});
