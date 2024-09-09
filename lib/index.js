import { Coroutine } from '@bablr/coroutine';
import * as sym from '@bablr/pattern-engine/symbols';
import { StreamIterable, getStreamIterator } from '@bablr/agast-helpers/stream';
import { SpamexEngine } from './engine.js';

function* __generateMatches(pattern, iterable) {
  const engine = new SpamexEngine(pattern);
  const co = new Coroutine(getStreamIterator(iterable));

  try {
    co.advance();
    if (co.current instanceof Promise) {
      co.current = yield co.current;
    }

    if (co.value.type !== 'DoctypeTag') throw new Error();

    engine.doctype = co.value;

    co.advance();

    engine.feed(sym.bos);

    while (true) {
      if (co.current instanceof Promise) {
        co.current = yield co.current;
      }

      if (co.done) {
        break;
      }

      engine.feed(co.value);

      for (const match of engine.traverse0()) {
        yield match;
      }

      engine.traverse1();

      if (engine.done) {
        break;
      } else {
        co.advance();
      }
    }

    if (co.done) {
      engine.feed(sym.eos);

      for (const match of engine.traverse0()) {
        yield match;
      }
    }
  } finally {
    co.return();
  }
}

export const generateMatches = (pattern, iterable) => {
  return new StreamIterable(__generateMatches(pattern, iterable));
};
