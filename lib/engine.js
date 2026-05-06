import { PatternEngine } from '@bablr/pattern-engine';
import { RegexEngine } from '@bablr/regex-vm';
import { buildNode, getOpenTag, Path } from '@bablr/agast-helpers/path';
import * as Tags from '@bablr/agast-helpers/tags';
import {
  DoctypeTag,
  OpenNodeTag,
  CloseTag,
  ReferenceTag,
  ShiftTag,
  GapTag,
  NullTag,
  LiteralTag,
} from '@bablr/agast-helpers/symbols';
import * as sym from './symbols.js';
import { buildPatternInternal } from './spamex.js';
import { buildProperty } from '@bablr/agast-helpers/builders';
import { freeze } from '@bablr/agast-helpers/object';

export class SpamexEngine extends PatternEngine {
  constructor(pattern, options = freeze({})) {
    const pattern_ = buildPatternInternal(pattern);

    super(pattern_, options);

    // this.regexEngine = new RegexEngine();

    this.repetitionCount = pattern_.initialState.repetitionStates.length;
    this.context0.seenRepetitions = [];
    this.context0.prevPath = null;
    this.context0.next = null;
    this.context1.path = null;

    this.doctype = null;
    this.held = null;
    this.path = null;
    this.ref = null;
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

    if (path && getOpenTag(path.node).value.selfClosing) {
      path = path.parent;
    }

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
        this.ref = tag;
        break;
      }

      case CloseTag: {
        break;
      }

      case NullTag:
      case GapTag: {
        const parentNode = path.parent.node;
        const isGap = tag.type === GapTag;

        if (this.ref.type !== ReferenceTag) throw new Error();

        const node = (isGap && this.held) || buildNode(tag);

        this.held = isGap ? null : this.held;
        path = { parent: path, node, depth: (path.depth || -1) + 1 };

        path.parent.node = Path.from(parentNode).advance(
          buildProperty(Tags.fromValues([this.ref, Tags.fromValues([]), node], 1)),
        ).node;
        break;
      }

      case ShiftTag:
        throw new Error('unimplemented');

      case OpenNodeTag: {
        const { flags, selfClosing } = tag.value;

        // if (!type) break;

        const node = buildNode(Tags.fromValues([tag]));

        const parentPath = path;

        path = { parent: path, node, depth: (path?.depth ?? -1) + 1 };

        if (parentPath) {
          const { node: parentNode } = parentPath;

          if (!Tags.getSize(parentNode.value.tags)) {
            throw new Error('Nodes must follow references');
          }

          parentPath.node = Path.from(parentNode).advance(this.ref).advance(node).node;
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

    if (path?.node && tag.type !== ReferenceTag && tag.type !== OpenNodeTag) {
      path.node = buildNode(Tags.push(tag, path.node.value.tags));
    }

    switch (tag.type) {
      case NullTag:
      case GapTag:
      case CloseTag: {
        if (tag.type === CloseTag && !path.depth) break;

        path = path.parent;
        break;
      }
    }

    this.path = path;

    this.context0.prevPath = this.path;
    this.context0.next = path;
    this.context1.path = path;
  }
}
