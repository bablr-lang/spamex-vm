import { printType } from '@bablr/agast-helpers/tree';
import createTree from 'functional-red-black-tree';
import * as sym from './symbols.js';
import { OpenNodeTag, CloseTag, ReferenceTag } from '@bablr/agast-helpers/symbols';
import { freeze } from '@bablr/agast-helpers/object';

let identity = (next) => next;

let compose = (lExp, rExp) => {
  return (next) => lExp(rExp(next));
};

let term = (options, capturesLen) => ({
  type: sym.cont,
  width: 0,
  name: 'term',
  next: null,
  match: (state) => {
    return {
      type: sym.success,
      global: !!options.global,
      captures: state.result,
    };
  },
  props: { options, capturesLen },
});

let nodeMatcher = (matcher, qIdx) => {
  return compose(
    openNodeTagMatcher(matcher.value),
    repeat(anyMatcher, qIdx, false),
    closeTagMatcher(),
  );
};

let openNodeTagMatcher = (matcher) => {
  let matcherName = matcher.name?.description;
  let matcherType = matcher.type?.description;
  return (next) => {
    return {
      type: sym.cont,
      width: 1,
      name: 'openNodeTag',
      next,
      match: (state, { path, value: token }) => {
        if (token.type !== OpenNodeTag || !token.value.name) return null;

        let name = token.value.name.description;

        let matched = matcherType ? matcherType === '?' && name : matcherName === name;

        if (matched) {
          state.result = path.node;
        }

        return matched ? next : null;
      },
      props: { matcher },
    };
  };
};

let closeTagMatcher = () => (next) => {
  return {
    type: sym.cont,
    width: 1,
    name: 'closeTag',
    next,
    match: (state, { value: token }) => {
      let matched = token.type === CloseTag;

      return matched ? next : null;
    },
    props: {},
  };
};

let anyMatcher = () => {
  let self = (next) => {
    let rootPath;
    return {
      type: sym.cont,
      width: 1,
      name: 'any',
      next,
      match: (state, { value: token, path }) => {
        if (token.type === ReferenceTag) {
          return next;
        }

        if (token.type === OpenNodeTag) {
          rootPath = path;
          return self;
        } else if (token.type === CloseTag && path === rootPath) {
          return next;
        } else if (rootPath) {
          return self;
        } else {
          return token.type === CloseTag ? null : next;
        }
      },
      props: {},
    };
  };
};

let deepAnyMatcher = () => (next) => {
  return {
    type: sym.cont,
    width: 1,
    name: 'deep-any',
    next,
    match: () => {
      return next;
    },
    props: {},
  };
};

let expression = (matchers) => (next) => {
  let boundMatchers = matchers.map((matcher) => matcher(next));
  let result = { type: sym.expr, seqs: boundMatchers };

  return {
    type: sym.cont,
    width: 0,
    name: 'expression',
    next,
    match: () => result,
    props: { matchers: boundMatchers },
  };
};

let resetRepetitionStates = (idxs, initialRepetitionStates) => (next) => {
  return {
    type: sym.cont,
    width: 0,
    name: 'resetRepetitionStates',
    next,
    match: (state) => {
      let { repetitionStates } = state;
      for (let idx of idxs) {
        repetitionStates = repetitionStates.find(idx).update(initialRepetitionStates[idx]);
      }

      state.repetitionStates = repetitionStates;

      return next;
    },
    props: { idxs, initialRepetitionStates },
  };
};

let repeat =
  (exp, key, greedy = true) =>
  (next) => {
    let matcher = {
      type: sym.cont,
      width: 0,
      name: 'repeat',
      next,
      match: (state, context) => {
        let repStateNode = state.repetitionStates.find(key);
        let { min, max } = repStateNode.value;

        if (context.seenRepetitions[key]) {
          return null;
        } else if (max === 0) {
          return next;
        } else {
          context.seenRepetitions[key] = true;
          let nextRepState = {
            min: min === 0 ? 0 : min - 1,
            max: max === 0 ? 0 : max - 1,
            context,
          };
          state.repetitionStates = repStateNode.update(nextRepState);

          return min > 0 ? repeatCont : exprCont;
        }
      },
      props: { key, greedy },
    };

    let repeatCont = exp(matcher);
    let exprCont = {
      type: sym.expr,
      seqs: greedy ? [repeatCont, next] : [next, repeatCont],
    };

    matcher.props.repeatCont = repeatCont;
    matcher.props.exprCont = exprCont;

    return matcher;
  };

let visitExpression = (alternatives, state, visit) => {
  let qIdxs = (state.qIdxs = []);

  let reset = resetRepetitionStates(qIdxs, state.initialRepetitionStates);

  // prettier-ignore
  switch (alternatives.length) {
    case 0: return identity;
    case 1: return compose(reset, visit(alternatives[0]));
    default: return expression(alternatives.map(alt => compose(reset, visit(alt))));
  }
};

let visitGap = (node, state) => {
  // return gap();
};

let visitTreeNodeMatcher = (node, state) => {
  let qIdx = ++state.qIdx;
  state.qIdxs.push();
  state.initialRepetitionStates[qIdx] = { min: 0, max: Infinity };
  return nodeMatcher(node, qIdx);
};

let buildPattern = (matcher, state) => {
  let qIdxs = (state.qIdxs = []);
  let reset = resetRepetitionStates(qIdxs, state.initialRepetitionStates);
  let qIdx = ++state.qIdx;
  state.qIdxs.push(qIdx);
  state.initialRepetitionStates[qIdx] = { min: 0, max: Infinity };

  return compose(reset, compose(repeat(deepAnyMatcher(), qIdx, false), matcher));
};

export const buildPatternInternal = (node, options = freeze({})) => {
  let pState = {
    qIdx: -1, // quantifier index
    qIdxs: [],
    initialRepetitionStates: [],
  };

  let seq = buildPattern(visitTreeNodeMatcher(node, pState), pState);

  let initialState = {
    result: null,
    repetitionStates: pState.initialRepetitionStates.reduce(
      (tree, state, i) => tree.insert(i, state),
      createTree((a, b) => a - b),
    ),
  };

  // Bind `next` arguments. The final `next` value is the tag state.
  let matcher = seq(term(options, pState.cIdx + 1));

  return { initialState, matcher };
};
