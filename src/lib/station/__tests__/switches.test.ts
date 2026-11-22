import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDivergingSwitchTraversal } from '../switches';

test('only a turnout branch traversal receives a turnout speed restriction', () => {
  ['singleSwitch', 'singleExtendedSwitch', 'extendedSwitch'].forEach((pieceType) => {
    assert.equal(isDivergingSwitchTraversal(pieceType, 'blTbr'), false);
    assert.equal(isDivergingSwitchTraversal(pieceType, 't'), false);
    assert.equal(isDivergingSwitchTraversal(pieceType, 'b'), false);
    assert.equal(isDivergingSwitchTraversal(pieceType, 'blTtr'), true);
  });

  assert.equal(isDivergingSwitchTraversal('extendedSwitch', 'blTmr'), true);
});

test('only the diagonal crossover traversal receives a turnout speed restriction', () => {
  ['t', 'b', 'tlTtrAblTbr'].forEach((state) => {
    assert.equal(isDivergingSwitchTraversal('crossoverSwitch', state), false);
  });
  assert.equal(isDivergingSwitchTraversal('crossoverSwitch', 'blTtr'), true);
});
