import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { checkMcpServer } from '../src/mcp-proof.js';

function createMockServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body || '{}');
      const response = await handler(req, payload);
      res.writeHead(response.statusCode || 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(response.body));
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

test('initialize and tools/list succeed for a basic MCP server', async () => {
  const mock = await createMockServer((req, payload) => {
    if (payload.method === 'initialize') {
      return {
        statusCode: 200,
        body: {
          jsonrpc: '2.0',
          id: payload.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'demo-server', version: '1.0.0' },
          },
        },
      };
    }

    if (payload.method === 'tools/list') {
      return {
        statusCode: 200,
        body: {
          jsonrpc: '2.0',
          id: payload.id,
          result: {
            tools: [
              { name: 'echo', description: 'Echo input back' },
              { name: 'ping', description: 'Ping the server' },
            ],
          },
        },
      };
    }

    return {
      statusCode: 200,
      body: {
        jsonrpc: '2.0',
        id: payload.id,
        error: { code: -32601, message: 'Unsupported method' },
      },
    };
  });

  const result = await checkMcpServer({ endpoint: mock.url, toolName: 'echo', arguments: { payload: 'hello' } });
  assert.equal(result.success, true);
  assert.equal(result.protocolVersion, '2025-11-25');
  assert.equal(result.tools.length, 2);
  mock.server.close();
});

test('tool call failure is surfaced in the result', async () => {
  const mock = await createMockServer((req, payload) => {
    if (payload.method === 'initialize') {
      return {
        statusCode: 200,
        body: {
          jsonrpc: '2.0',
          id: payload.id,
          result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'demo', version: '1.0.0' } },
        },
      };
    }

    if (payload.method === 'tools/list') {
      return {
        statusCode: 200,
        body: {
          jsonrpc: '2.0',
          id: payload.id,
          result: { tools: [{ name: 'echo', description: 'Echo input back' }] },
        },
      };
    }

    if (payload.method === 'tools/call') {
      return {
        statusCode: 200,
        body: {
          jsonrpc: '2.0',
          id: payload.id,
          result: { content: [{ type: 'text', text: 'ok' }], isError: false },
        },
      };
    }

    return { statusCode: 500, body: { error: 'unexpected' } };
  });

  const result = await checkMcpServer({ endpoint: mock.url, toolName: 'echo', arguments: { payload: 'hello' } });
  assert.equal(result.success, true);
  assert.equal(result.toolCall.content[0].text, 'ok');
  mock.server.close();
});

test('mismatched protocol version is reported as a failure', async () => {
  const mock = await createMockServer((req, payload) => ({
    statusCode: 200,
    body: {
      jsonrpc: '2.0',
      id: payload.id,
      result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'demo', version: '1.0.0' } },
    },
  }));

  const result = await checkMcpServer({ endpoint: mock.url });
  assert.equal(result.success, false);
  assert.match(result.summary, /Expected protocolVersion/);
  mock.server.close();
});
