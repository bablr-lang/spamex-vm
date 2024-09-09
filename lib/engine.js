import { PatternEngine } from '@bablr/pattern-engine';
import { RegexEngine } from '@bablr/regex-vm';
import { createNode, finalizeNode, add } from '@bablr/agast-helpers/tree';
import { buildEmbeddedNode, nodeFlags } from '@bablr/agast-helpers/builders';
import * as sym from './symbols.js';
import { buildPatternInternal } from './spamex.js';

const code = (str) => str.charCodeAt(0);
const { freeze } = Object;
const arrayLast = (arr) => arr[arr.length - 1];

export class SpamexEngine extends PatternEngine {
  constructor(pattern, options = {}) {
    const pattern_ = buildPatternInternal(pattern);

    super(pattern_, options);

    // this.regexEngine = new RegexEngine();

    this.repetitionCount = pattern_.initialState.repetitionStates.length;
    this.context0.seenRepetitions = [];
    this.context0.prevPath = null;
    this.context0.nextPath = null;
    this.context1.path = null;

    this.doctype = null;
    this.held = null;
    this.path = null;
    this.rootPath = null;
  }

  feed(token) {
    super.feed(token);

    this.context0.seenRepetitions = new Array(this.repetitionCount);

    if (token === sym.bos) {
      return;
    }

    if (token.type === 'DoctypeTag') {
      this.doctype = token;
      return;
    }

    if (this.held && token.type !== 'StartNodeTag' && token.type !== 'Gap') {
      throw new Error('cannot eat this type of tag while holding');
    }

    let { path } = this;

    switch (token.type) {
      case 'Literal': {
        for (const chr of token.value) {
          // this.regexEngine.feed(code(chr));
          // for (const match of this.regexEngine.traverse0()) {
          //   // ...?
          //   // don't forget cooked escapes
          // }
          // this.regexEngine.traverse1();
        }
        break;
      }

      case 'Reference':
      case 'CloseNodeTag': {
        break;
      }

      case 'Null':
      case 'Gap': {
        const parentNode = path.parent.node;
        const ref = arrayLast(parentNode.children);
        const isGap = token.type === 'Gap';

        if (ref.type !== 'Reference') throw new Error();

        const node = (isGap && this.held) || createNode(nodeFlags, null, sym.null);

        this.held = isGap ? null : this.held;
        path = { parent: path, node, depth: (path.depth || -1) + 1 };

        add(parentNode, ref, node);
        break;
      }

      case 'Shift':
        throw new Error('unimplemented');

      case 'OpenNodeTag': {
        const { flags, type } = token.value;

        const language = type
          ? token.value.language
          : this.doctype.value.attributes['bablr-language'];
        const attributes = type ? token.value.attributes : this.doctype.value.attributes;

        const node = freeze({ flags, language, type, children: [], properties: {}, attributes });

        const parentPath = path;

        path = { parent: path, node, depth: (path?.depth || -1) + 1 };

        if (parentPath) {
          const { node: parentNode } = parentPath;
          if (!(flags.escape || flags.trivia)) {
            if (!parentNode.children.length) {
              throw new Error('Nodes must follow references');
            }

            const ref = arrayLast(parentNode.children);

            add(parentNode, ref, node);
          } else {
            parentNode.children.push(buildEmbeddedNode(node));
          }
        } else {
          this.rootPath = path;
        }

        if (flags.escape && token.value.attributes.cooked) {
          for (const chr of token.value.attributes.cooked) {
            // this.regexEngine.feed(code(chr));
          }
        }

        break;
      }

      default:
        throw new Error();
    }

    if (path?.node) {
      path.node.children.push(token);
    }

    switch (token.type) {
      case 'Null':
      case 'Gap':
      case 'CloseNodeTag': {
        finalizeNode(path.node);

        path = path.parent;
        break;
      }
    }

    this.context0.prevPath = this.path;
    this.context0.nextPath = path;
    this.context1.path = path;
  }
}
