import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReportRecipients } from '../notify-admin-email.mjs';

test('parseReportRecipients supports semicolon lists with spaces', () => {
  assert.deepEqual(parseReportRecipients('mykantor@bellsouth.net; maximkantor@gmail.com'), [
    'mykantor@bellsouth.net',
    'maximkantor@gmail.com'
  ]);
});

test('parseReportRecipients supports comma lists', () => {
  assert.deepEqual(parseReportRecipients('a@example.com,b@example.com'), [
    'a@example.com',
    'b@example.com'
  ]);
});

test('parseReportRecipients trims, drops empties, and dedupes case-insensitively', () => {
  assert.deepEqual(
    parseReportRecipients('  a@Example.com ;; , B@example.com; a@example.com;  '),
    ['a@Example.com', 'B@example.com']
  );
});

test('parseReportRecipients keeps single-recipient backward compatibility', () => {
  assert.deepEqual(parseReportRecipients('mykantor@bellsouth.net'), ['mykantor@bellsouth.net']);
  assert.deepEqual(parseReportRecipients(''), []);
  assert.deepEqual(parseReportRecipients(null), []);
});
