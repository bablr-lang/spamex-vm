import * as sym from '@bablr/pattern-engine/symbols';
import { StreamIterable, getStreamIterator, wait } from '@bablr/agast-helpers/stream';
import { SpamexEngine } from './engine.js';
import { parseTag } from '@bablr/agast-helpers/builders';

function* __generateMatches(pattern, iterable) {
  let engine = new SpamexEngine(pattern);
  let iter = getStreamIterator(iterable);
  let step;

  try {
    step = iter.next();
    if (step instanceof Promise) step = yield wait(step);

    engine.feed(sym.bos);

    while (true) {
      if (step instanceof Promise) step = yield wait(step);
      if (step.done) break;

      engine.feed(parseTag(step.value));

      for (const match of engine.traverse0()) {
        yield match;
      }

      engine.traverse1();

      if (engine.done) {
        break;
      } else {
        step = iter.next();
      }
    }

    if (step.done) {
      engine.feed(sym.eos);

      for (const match of engine.traverse0()) {
        yield match;
      }
    }
  } finally {
    step = iter.return();
    if (step instanceof Promise) step = wait(yield step);
  }
}

export const generateMatches = (pattern, iterable) => {
  return new StreamIterable(__generateMatches(pattern, iterable));
};
