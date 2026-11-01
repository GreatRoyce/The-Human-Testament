import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loginDestination } from '../src/utils/authNavigation.js';

test('login returns readers to their requested protected destination', () => {
  assert.equal(loginDestination('/reading/notes'), '/reading/notes');
  assert.equal(loginDestination('/dashboard'), '/dashboard');
  assert.equal(loginDestination('/admin/users'), '/admin/users');
});

test('login defaults to the reader dashboard and rejects external redirect targets', () => {
  assert.equal(loginDestination(undefined), '/dashboard');
  assert.equal(loginDestination('/settings'), '/dashboard');
  assert.equal(loginDestination('//attacker.example'), '/dashboard');
  assert.equal(loginDestination('https://attacker.example'), '/dashboard');
});
