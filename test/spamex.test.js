import { dedent } from '@qnighy/dedent';
import { generateMatches as exec } from '@bablr/spamex-vm';
import { spam, cstml } from '@bablr/boot';
import { streamFromTree, printTag, getOpenTag, buildOpenNodeTag } from '@bablr/agast-helpers/tree';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { expect } from 'expect';

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
  const tree = dedentify(cstml.Document)`
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
  `;

  const doc = reifyExpression(tree).value.tree;

  it('<? />', () => {
    expect(printOpenTags(exec(spam`<? />`, streamFromTree(doc)))).toEqual('<Foo>');
  });

  it('<Bar />', () => {
    expect(printOpenTags(exec(spam`<Bar />`, streamFromTree(doc)))).toEqual('<Bar>');
  });
});
