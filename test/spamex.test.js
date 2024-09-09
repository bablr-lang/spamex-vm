import { dedent } from '@qnighy/dedent';
import { generateMatches as exec } from '@bablr/spamex-vm';
import { spam, cstml } from '@bablr/boot';
import { streamFromTree, printTerminal } from '@bablr/agast-helpers/tree';
import { reifyExpression } from '@bablr/agast-vm-helpers';
import { expect } from 'expect';

const dedentify = (tagFn) => {
  return (quasis, ...expressions) => {
    return tagFn({ raw: [dedent(quasis, ...expressions).trim()] });
  };
};

const doc = reifyExpression(dedentify(cstml.Document)`
  <!0:cstml>
  <>
    root:
    <Foo>
      bar:
      <Bar />
      baz:
      <Baz />
    </>
  </>\
`);

const printOpenTags = (nodes) => {
  return [...nodes].map((node) => printTerminal(node.children[0])).join('');
};

describe('spamex', () => {
  it('<?>', () => {
    expect(printOpenTags(exec(spam`<?>`, streamFromTree(doc)))).toEqual('<Foo>');
  });

  it('<Bar>', () => {
    expect(printOpenTags(exec(spam`<Bar>`, streamFromTree(doc)))).toEqual('<Bar>');
  });
});
