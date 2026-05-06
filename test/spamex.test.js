import { dedent } from '@qnighy/dedent';
import { generateMatches as exec } from '@bablr/spamex-vm';
import {
  streamFromTree,
  printTag,
  getOpenTag,
  buildOpenNodeTag,
  treeFromString,
} from '@bablr/agast-helpers/tree';
import { expect } from 'expect';
import { parseNodeMatcher } from '@bablr/agast-vm-helpers/builders';

let m = (quasis, ...exprs) => {
  let str = String.raw(quasis, exprs);
  return parseNodeMatcher(str);
};

const dedentify = (tagFn) => {
  return (quasis, ...expressions) => {
    return tagFn({ raw: [dedent(quasis, ...expressions).trim()] });
  };
};

const printOpenTags = (nodes) => {
  return [...nodes]
    .map((node) => {
      let { flags, name, literalValue, attributes } = getOpenTag(node).value;
      return printTag(buildOpenNodeTag(flags, name, literalValue, attributes, false));
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
