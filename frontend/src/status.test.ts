import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { statusOf } from './status.ts'

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
