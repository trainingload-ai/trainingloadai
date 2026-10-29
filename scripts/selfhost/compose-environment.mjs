function interpolationVariables(sources) {
  if (
    !Array.isArray(sources) ||
    sources.some((source) => typeof source !== "string")
  ) {
    throw new TypeError("Compose sources must be an array of strings");
  }
  const variables = new Set();
  for (const source of sources) {
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] !== "$") continue;
      let cursor = index;
      while (source[cursor] === "$") cursor += 1;
      const dollarCount = cursor - index;
      index = cursor - 1;
      if (dollarCount % 2 === 0) continue;
      if (source[cursor] === "{") cursor += 1;
      if (!/[_a-zA-Z]/.test(source[cursor] ?? "")) continue;
      const nameStart = cursor;
      while (/[_a-zA-Z0-9]/.test(source[cursor] ?? "")) cursor += 1;
      variables.add(source.slice(nameStart, cursor));
      index = cursor - 1;
    }
  }
  return variables;
}

export function isolateComposeEnvironment(environment, sources) {
  if (
    typeof environment !== "object" ||
    environment === null ||
    Array.isArray(environment)
  ) {
    throw new TypeError("Compose command environment must be an object");
  }
  const variables = interpolationVariables(sources);
  const normalizedVariables = new Set(
    [...variables].map((name) => name.toUpperCase()),
  );
  return Object.fromEntries(
    Object.entries(environment).filter(([name]) => {
      const normalized = name.toUpperCase();
      return (
        !normalized.startsWith("COMPOSE_") &&
        !normalizedVariables.has(normalized)
      );
    }),
  );
}

export { interpolationVariables as composeInterpolationVariables };
