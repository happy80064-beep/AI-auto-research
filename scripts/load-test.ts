type Method = "GET" | "POST";

interface LoadOptions {
  url: string;
  requests: number;
  concurrency: number;
  method: Method;
  body?: string;
  bodyFile?: string;
}

interface Sample {
  ok: boolean;
  status: number;
  durationMs: number;
}

const args = new Map<string, string>();
for (let i = 2; i < Bun.argv.length; i += 1) {
  const arg = Bun.argv[i];
  if (!arg.startsWith("--")) continue;
  const key = arg.slice(2);
  const next = Bun.argv[i + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    i += 1;
  } else {
    args.set(key, "true");
  }
}

const options: LoadOptions = {
  url: args.get("url") || "http://127.0.0.1:8080/health",
  requests: Number(args.get("requests") || 20000),
  concurrency: Number(args.get("concurrency") || 20000),
  method: ((args.get("method") || "GET").toUpperCase() as Method),
  body: args.get("body"),
  bodyFile: args.get("body-file"),
};

if (options.bodyFile) {
  options.body = await Bun.file(options.bodyFile).text();
}

if (!Number.isFinite(options.requests) || options.requests < 1) {
  throw new Error("--requests must be a positive number");
}

if (!Number.isFinite(options.concurrency) || options.concurrency < 1) {
  throw new Error("--concurrency must be a positive number");
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1);
  return values[index];
};

const runOne = async (): Promise<Sample> => {
  const started = performance.now();
  try {
    const response = await fetch(options.url, {
      method: options.method,
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.method === "POST" ? options.body : undefined,
    });
    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - started,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      durationMs: performance.now() - started,
    };
  }
};

const runLoadTest = async () => {
  const samples: Sample[] = [];
  let launched = 0;

  const started = performance.now();
  const workers = Array.from({ length: Math.min(options.concurrency, options.requests) }, async () => {
    while (launched < options.requests) {
      launched += 1;
      samples.push(await runOne());
    }
  });

  await Promise.all(workers);
  const totalMs = performance.now() - started;
  const latencies = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
  const success = samples.filter((sample) => sample.ok).length;
  const failed = samples.length - success;
  const statusCounts = samples.reduce<Record<string, number>>((acc, sample) => {
    const key = String(sample.status);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const summary = {
    url: options.url,
    method: options.method,
    requests: samples.length,
    concurrency: options.concurrency,
    success,
    failed,
    errorRate: `${((failed / samples.length) * 100).toFixed(2)}%`,
    totalMs: Number(totalMs.toFixed(2)),
    rps: Number((samples.length / (totalMs / 20000)).toFixed(2)),
    latencyMs: {
      min: Number((latencies[0] || 0).toFixed(2)),
      p50: Number(percentile(latencies, 50).toFixed(2)),
      p90: Number(percentile(latencies, 90).toFixed(2)),
      p95: Number(percentile(latencies, 95).toFixed(2)),
      p99: Number(percentile(latencies, 99).toFixed(2)),
      max: Number((latencies[latencies.length - 1] || 0).toFixed(2)),
    },
    statusCounts,
  };

  console.log(JSON.stringify(summary, null, 2));
};

runLoadTest().catch((error) => {
  console.error(error);
  process.exit(1);
});
