export interface FiniteModelCommand<State> {
  name: string;
  enabled(state: Readonly<State>): boolean;
  next(state: Readonly<State>): State;
}

export interface FiniteModelInvariant<State> {
  name: string;
  holds(state: Readonly<State>): boolean;
}

export interface FiniteModelTransitionInvariant<State> {
  name: string;
  holds(
    before: Readonly<State>,
    command: Readonly<FiniteModelCommand<State>>,
    after: Readonly<State>,
  ): boolean;
}

export interface FiniteModelOptions<State> {
  initialStates: readonly State[];
  commands: readonly FiniteModelCommand<State>[];
  invariants: readonly FiniteModelInvariant<State>[];
  transitionInvariants?: readonly FiniteModelTransitionInvariant<State>[];
  stateKey(state: Readonly<State>): string;
  maxDepth: number;
  maxStates: number;
}

export interface FiniteModelResult {
  statesVisited: number;
  transitionsExplored: number;
  maxDepthReached: number;
}

interface QueueEntry<State> {
  state: State;
  path: string[];
}

export class FiniteModelViolation extends Error {
  public constructor(
    public readonly invariant: string,
    public readonly commandPath: readonly string[],
    public readonly stateKey: string,
  ) {
    super(
      `Finite model violated "${invariant}" after [${commandPath.join(", ")}] at state ${stateKey}`,
    );
    this.name = "FiniteModelViolation";
  }
}

export class FiniteModelBlockedError extends Error {
  public constructor(maxStates: number) {
    super(
      `Finite model exceeded the ${maxStates} state safety limit before exploration completed`,
    );
    this.name = "FiniteModelBlockedError";
  }
}

export function exploreFiniteModel<State>(
  options: FiniteModelOptions<State>,
): FiniteModelResult {
  if (!Number.isInteger(options.maxDepth) || options.maxDepth < 0) {
    throw new Error("maxDepth must be a non-negative integer");
  }
  if (!Number.isInteger(options.maxStates) || options.maxStates < 1) {
    throw new Error("maxStates must be a positive integer");
  }
  if (options.initialStates.length === 0) {
    throw new Error("at least one initial state is required");
  }

  const queue: QueueEntry<State>[] = options.initialStates.map((state) => ({
    state,
    path: [],
  }));
  const visited = new Set<string>();
  let transitionsExplored = 0;
  let maxDepthReached = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const key = options.stateKey(current.state);
    if (visited.has(key)) {
      continue;
    }
    if (visited.size >= options.maxStates) {
      throw new FiniteModelBlockedError(options.maxStates);
    }
    visited.add(key);
    maxDepthReached = Math.max(maxDepthReached, current.path.length);

    for (const invariant of options.invariants) {
      if (!invariant.holds(current.state)) {
        throw new FiniteModelViolation(invariant.name, current.path, key);
      }
    }

    if (current.path.length >= options.maxDepth) {
      continue;
    }

    for (const command of options.commands) {
      if (!command.enabled(current.state)) {
        continue;
      }
      transitionsExplored += 1;
      const nextState = command.next(current.state);
      const nextPath = [...current.path, command.name];
      for (const invariant of options.transitionInvariants ?? []) {
        if (!invariant.holds(current.state, command, nextState)) {
          throw new FiniteModelViolation(
            invariant.name,
            nextPath,
            options.stateKey(nextState),
          );
        }
      }
      queue.push({
        state: nextState,
        path: nextPath,
      });
    }
  }

  return {
    statesVisited: visited.size,
    transitionsExplored,
    maxDepthReached,
  };
}
