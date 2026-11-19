import { expect } from 'expect';
import { generateMatches as exec } from '@bablr/spamex-vm';
import { getOpenTag, treeFromString } from '@bablr/agast-helpers/tree';
import { parseTag, printTag, buildOpenTag } from 'agast';
import { streamFromTree } from '@bablr/agast-helpers/stream';
import { parseNodeMatcher } from '@bablr/agast-vm-helpers/parsers/spamex';

let m = (quasis, ...exprs) => {
  let str = String.raw(quasis, exprs);
  return parseNodeMatcher(str);
};

const printOpenTags = (nodes) => {
  return [...nodes]
    .map((node) => {
      let { flags, name, literalValue, attributes, events } = parseTag(getOpenTag(node)).value;
      return printTag(buildOpenTag(flags, null, name, literalValue, attributes, events, false));
    })
    .join('');
};

describe('spamex', () => {
  const doc = treeFromString(`
    <!0:cstml { 'bablr-lang': "test" }>
    <__>
      .:
      <Foo>
        bar:
        <Bar />
        baz:
        <Baz />
      </>
    </>\
  `);

  it('<? />', () => {
    expect(printOpenTags(exec(m`<? />`, streamFromTree(doc)))).toEqual('<Foo>');
  });

  it('<Bar />', () => {
    expect(printOpenTags(exec(m`<Bar />`, streamFromTree(doc)))).toEqual('<Bar>');
  });
});
