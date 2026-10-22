import { checkMcpServer } from './mcp-proof.js';

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  printUsage();
  process.exit(0);
}

if (!args.url) {
  printUsage();
  process.exit(1);
}

const result = await checkMcpServer({
  endpoint: args.url,
  toolName: args.tool,
  arguments: args.args ? JSON.parse(args.args) : {},
  timeoutMs: Number(args.timeout || 15000),
});

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

console.log(result.summary);
console.log('');
console.log(JSON.stringify({
  success: result.success,
  protocolVersion: result.protocolVersion,
  tools: result.tools,
  toolCall: result.toolCall,
  errors: result.errors,
}, null, 2));

process.exit(result.success ? 0 : 1);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function printUsage() {
  console.log(`Usage: mcp-streamable-proof --url <http://host:port/mcp> [--tool name] [--args '{"arg":"value"}'] [--timeout 15000] [--json] [--help]`);
}
