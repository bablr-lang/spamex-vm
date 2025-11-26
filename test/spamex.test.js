import { dedent } from '@qnighy/dedent';
import { generateMatches as exec } from '@bablr/spamex-vm';
import { spam, cstml } from '@bablr/boot';
import { streamFromTree, printTag, getOpenTag, buildChild } from '@bablr/agast-helpers/tree';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { expect } from 'expect';
import { OpenNodeTag } from '@bablr/agast-helpers/symbols';

const dedentify = (tagFn) => {
  return (quasis, ...expressions) => {
    return tagFn({ raw: [dedent(quasis, ...expressions).trim()] });
  };
};

const printOpenTags = (nodes) => {
  return [...nodes]
    .map((node) =>
      printTag(buildChild(OpenNodeTag, { ...getOpenTag(node).value, selfClosing: false })),
    )
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

  const doc = reifyExpression(tree);

  it('<? />', () => {
    expect(printOpenTags(exec(spam`<? />`, streamFromTree(doc)))).toEqual('<Foo>');
  });

  it('<Bar />', () => {
    expect(printOpenTags(exec(spam`<Bar />`, streamFromTree(doc)))).toEqual('<Bar>');
  });
});
