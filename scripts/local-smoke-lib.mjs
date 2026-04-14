export function parseArgs(argv) {
  const args = {
    deep: false,
    sourceId: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--deep') {
      args.deep = true;
      continue;
    }

    if (value === '--source-id') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('--source-id requires a numeric value');
      }
      const parsed = Number.parseInt(next, 10);
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error('--source-id must be a positive integer');
      }
      args.sourceId = parsed;
      i += 1;
      continue;
    }
  }

  return args;
}

export function selectTargetSource(sources, sourceId) {
  const normalizedTargetId = sourceId == null ? null : String(sourceId);
  const explicitSource =
    normalizedTargetId == null
      ? null
      : sources.find((source) => String(source.id) === normalizedTargetId);

  const targetSource =
    explicitSource ||
    sources.find((source) => source.enabled === true || source.enabled === 1) ||
    null;

  return {
    explicitSource,
    targetSource,
    fallbackUsed: normalizedTargetId != null && !explicitSource,
  };
}
