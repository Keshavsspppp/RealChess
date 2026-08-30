import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { statusOf, formatClock } from './status.ts'

test('stalemate is not reported as a plain draw', () => {
  assert.equal(statusOf(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')), 'Stalemate — draw')
})

test('checkmate names the winner, not the side to move', () => {
  assert.equal(statusOf(new Chess('7k/5Q1K/8/8/8/8/8/8 b - - 0 1')), 'Checkmate — White wins')
})

test('insufficient material is a draw', () => {
  assert.equal(statusOf(new Chess('7k/8/6K1/8/8/8/8/8 w - - 0 1')), 'Draw')
})

test('normal position reports side to move, and flags check', () => {
  assert.equal(statusOf(new Chess()), 'White to move')
  assert.equal(statusOf(new Chess('4k3/8/8/8/8/8/8/4K2R b K - 0 1')), 'Black to move')
  assert.equal(statusOf(new Chess('4k2R/8/8/8/8/8/8/4K3 b - - 0 1')), 'Black to move — check!')
})

test('a full clock reads as its whole starting minute', () => {
  assert.equal(formatClock(10 * 60 * 1000), '10:00')
  // Ceil, not floor: one tick into the game must still read 10:00, never 9:59.
  assert.equal(formatClock(10 * 60 * 1000 - 1), '10:00')
})

test('clock seconds are zero padded and roll over to minutes', () => {
  assert.equal(formatClock(65_000), '1:05')
  assert.equal(formatClock(60_000), '1:00')
  assert.equal(formatClock(59_999), '1:00')
  assert.equal(formatClock(59_000), '0:59')
})

test('a flagged clock reads zero and never goes negative', () => {
  assert.equal(formatClock(0), '0:00')
  assert.equal(formatClock(-500), '0:00')
})
