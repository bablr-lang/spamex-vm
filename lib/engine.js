import { PatternEngine } from '@bablr/pattern-engine';
import { RegexEngine } from '@bablr/regex-vm';
import * as btree from '@bablr/agast-helpers/btree';
import { createNode, finalizeNode, add } from '@bablr/agast-helpers/tree';
import { buildEmbeddedNode, nodeFlags } from '@bablr/agast-helpers/builders';
import {
  DoctypeTag,
  OpenNodeTag,
  CloseNodeTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  LiteralTag,
  OpenFragmentTag,
  CloseFragmentTag,
} from '@bablr/agast-helpers/symbols';
import * as sym from './symbols.js';
import { buildPatternInternal } from './spamex.js';

const { freeze } = Object;

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

  feed(tag) {
    super.feed(tag);

    this.context0.seenRepetitions = new Array(this.repetitionCount);

    if (tag === sym.bos || tag === sym.eos) {
      return;
    }

    if (tag.type === DoctypeTag) {
      this.doctype = tag;
      return;
    }

    if (this.held && tag.type !== OpenNodeTag && tag.type !== GapTag) {
      throw new Error('cannot eat this type of tag while holding');
    }

    let { path } = this;

    let ref = null;

    switch (tag.type) {
      case LiteralTag: {
        for (const chr of tag.value) {
          // this.regexEngine.feed(code(chr));
          // for (const match of this.regexEngine.traverse0()) {
          //   // ...?
          //   // don't forget cooked escapes
          // }
          // this.regexEngine.traverse1();
        }
        break;
      }

      case ReferenceTag: {
        ref = tag;
        break;
      }

      case OpenFragmentTag:
      case CloseFragmentTag:
      case CloseNodeTag: {
        break;
      }

      case NullTag:
      case GapTag: {
        const parentNode = path.parent.node;
        const isGap = tag.type === GapTag;

        if (ref.type !== ReferenceTag) throw new Error();

        const node = (isGap && this.held) || createNode(tag);

        this.held = isGap ? null : this.held;
        path = { parent: path, node, depth: (path.depth || -1) + 1 };

        add(parentNode, ref, node);
        break;
      }

      case ShiftTag:
        throw new Error('unimplemented');

      case OpenNodeTag: {
        const { flags, type } = tag.value;

        const language = type
          ? tag.value.language
          : this.doctype.value.attributes['bablr-language'];
        const attributes = type ? tag.value.attributes : this.doctype.value.attributes;

        const node = freeze({ flags, language, type, children: [], properties: {}, attributes });

        const parentPath = path;

        path = { parent: path, node, depth: (path?.depth || -1) + 1 };

        if (parentPath) {
          const { node: parentNode } = parentPath;

          if (!parentNode.children.length) {
            throw new Error('Nodes must follow references');
          }

          add(parentNode, ref, node);
        } else {
          this.rootPath = path;
        }

        if (flags.escape && tag.value.attributes.cooked) {
          for (const chr of tag.value.attributes.cooked) {
            // this.regexEngine.feed(code(chr));
          }
        }

        break;
      }

      default:
        throw new Error();
    }

    if (path?.node && tag.type !== ReferenceTag) {
      path.node.children.push(tag);
    }

    switch (tag.type) {
      case NullTag:
      case GapTag:
      case CloseNodeTag: {
        finalizeNode(path.node);

        path = path.parent;
        break;
      }
    }

    this.path = path;

    this.context0.prevPath = this.path;
    this.context0.nextPath = path;
    this.context1.path = path;
  }
}
