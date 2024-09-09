import { getCooked } from '@bablr/agast-helpers/tree';
import createTree from 'functional-red-black-tree';
import * as sym from './symbols.js';

export class SimpleVisitor {
  constructor(visitors) {
    this.visitors = visitors;
  }

  visit(node, state) {
    return this.visitors[node.type](node, state, (node) => this.visit(node, state));
  }
}

export function visit(node, state, visitors) {
  return new SimpleVisitor(visitors).visit(node, state);
}

const identity = (next) => next;

const compose = (lExp, rExp) => {
  return (next) => lExp(rExp(next));
};

const term = (options, capturesLen) => ({
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

const nodeMatcher = (matcher, qIdx) => {
  return compose(
    openNodeTagMatcher(matcher),
    repeat(anyMatcher, qIdx, false),
    closeNodeTagMatcher(),
  );
};

const openNodeTagMatcher = (matcher) => (next) => {
  return {
    type: sym.cont,
    width: 1,
    name: 'openNodeTag',
    next,
    match: (state, { path, value: token }) => {
      if (token.type !== 'OpenNodeTag') return null;

      const { type } = token.value;

      const matched = getCooked(matcher.properties.type) === '?' && type && type !== sym.gap;

      state.result = path.node;

      return matched ? next : null;
    },
    props: { matcher },
  };
};

const closeNodeTagMatcher = () => (next) => {
  return {
    type: sym.cont,
    width: 1,
    name: 'closeNodeTag',
    next,
    match: (state, { value: token }) => {
      const matched = token.type === 'CloseNodeTag';

      return matched ? next : null;
    },
    props: {},
  };
};

const anyMatcher = () => {
  const self = (next) => {
    let rootPath;
    return {
      type: sym.cont,
      width: 1,
      name: 'any',
      next,
      match: (state, { value: token, path }) => {
        if (token.type === 'Reference') {
          return next;
        }

        if (token.type === 'OpenNodeTag') {
          rootPath = path;
          return self;
        } else if (token.type === 'CloseNodeTag' && path === rootPath) {
          return next;
        } else if (rootPath) {
          return self;
        } else {
          return token.type === 'CloseNodeTag' ? null : next;
        }
      },
      props: {},
    };
  };
};

const deepAnyMatcher = () => (next) => {
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

const expression = (matchers) => (next) => {
  const boundMatchers = matchers.map((matcher) => matcher(next));
  const result = { type: sym.expr, seqs: boundMatchers };

  return {
    type: sym.cont,
    width: 0,
    name: 'expression',
    next,
    match: () => result,
    props: { matchers: boundMatchers },
  };
};

const resetRepetitionStates = (idxs, initialRepetitionStates) => (next) => {
  return {
    type: sym.cont,
    width: 0,
    name: 'resetRepetitionStates',
    next,
    match: (state) => {
      let { repetitionStates } = state;
      for (const idx of idxs) {
        repetitionStates = repetitionStates.find(idx).update(initialRepetitionStates[idx]);
      }

      state.repetitionStates = repetitionStates;

      return next;
    },
    props: { idxs, initialRepetitionStates },
  };
};

const repeat =
  (exp, key, greedy = true) =>
  (next) => {
    const matcher = {
      type: sym.cont,
      width: 0,
      name: 'repeat',
      next,
      match: (state, context) => {
        const repStateNode = state.repetitionStates.find(key);
        const { min, max } = repStateNode.value;

        if (context.seenRepetitions[key]) {
          return null;
        } else if (max === 0) {
          return next;
        } else {
          context.seenRepetitions[key] = true;
          const nextRepState = {
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

    const repeatCont = exp(matcher);
    const exprCont = {
      type: sym.expr,
      seqs: greedy ? [repeatCont, next] : [next, repeatCont],
    };

    matcher.props.repeatCont = repeatCont;
    matcher.props.exprCont = exprCont;

    return matcher;
  };

const visitExpression = (alternatives, state, visit) => {
  const qIdxs = (state.qIdxs = []);

  const reset = resetRepetitionStates(qIdxs, state.initialRepetitionStates);

  // prettier-ignore
  switch (alternatives.length) {
    case 0: return identity;
    case 1: return compose(reset, visit(alternatives[0]));
    default: return expression(alternatives.map(alt => compose(reset, visit(alt))));
  }
};

const visitors = {
  Alternative: (node, state, visit) => {
    const { elements = [] } = node.properties;

    return elements.map(visit).reduce(compose, identity);
  },

  Group: (node, state, visit) => {
    const { alternatives } = node.properties;

    return visitExpression(alternatives, state, visit);
  },

  Gap: (node, state) => {
    // return gap();
  },

  Pattern: (node, state, visit) => {
    const qIdxs = (state.qIdxs = []);
    const reset = resetRepetitionStates(qIdxs, state.initialRepetitionStates);
    const qIdx = ++state.qIdx;
    state.qIdxs.push(qIdx);
    state.initialRepetitionStates[qIdx] = { min: 0, max: Infinity };

    return compose(
      reset,
      compose(repeat(deepAnyMatcher(), qIdx, false), visit(node.properties.matcher)),
    );
  },

  NodeMatcher: (node, state) => {
    const qIdx = ++state.qIdx;
    state.qIdxs.push();
    state.initialRepetitionStates[qIdx] = { min: 0, max: Infinity };
    return nodeMatcher(node, qIdx);
  },

  Quantifier: (node, state, visit) => {
    const { min, max, greedy } = node.attributes;
    const { element } = node.properties;
    // See https://github.com/mysticatea/regexpp/issues/21
    if (min > max) {
      throw new Error('numbers out of order in {} quantifier');
    }
    const qIdx = ++state.qIdx;
    state.qIdxs.push(qIdx);

    state.initialRepetitionStates[qIdx] = { min, max };
    return repeat(visit(element), qIdx, greedy);
  },
};

export const buildPatternInternal = (node, options = {}) => {
  const pState = {
    qIdx: -1, // quantifier index
    qIdxs: [],
    initialRepetitionStates: [],
  };

  const seq = visit(node, pState, visitors);

  const initialState = {
    result: null,
    repetitionStates: pState.initialRepetitionStates.reduce(
      (tree, state, i) => tree.insert(i, state),
      createTree((a, b) => a - b),
    ),
  };

  // Bind `next` arguments. The final `next` value is the Tag state.
  const matcher = seq(term(options, pState.cIdx + 1));

  return { initialState, matcher };
};
