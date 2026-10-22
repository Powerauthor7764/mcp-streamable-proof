export async function checkMcpServer({ endpoint, toolName, arguments: argMap = {}, timeoutMs = 15000 } = {}) {
  const errors = [];
  const results = {
    success: false,
    endpoint,
    protocolVersion: null,
    tools: [],
    toolCall: null,
    errors,
    summary: '',
  };

  if (!endpoint) {
    errors.push('Missing endpoint URL.');
    results.summary = 'FAIL: Missing endpoint URL.';
    return results;
  }

  const requestJson = async (payload) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    const parsed = contentType.includes('application/json') ? JSON.parse(text || '{}') : { text };

    return { response, parsed, text };
  };

  try {
    const initializePayload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'mcp-streamable-proof', version: '1.0.0' },
      },
    };

    const init = await requestJson(initializePayload);
    const initResult = init.parsed?.result;
    if (!initResult) {
      errors.push('initialize did not return a result object.');
    } else {
      results.protocolVersion = initResult.protocolVersion || null;
      if (results.protocolVersion !== '2025-11-25') {
        errors.push(`Expected protocolVersion 2025-11-25 but received ${results.protocolVersion ?? 'unknown'}.`);
      }
    }

    const toolsListPayload = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    };

    const list = await requestJson(toolsListPayload);
    const toolList = list.parsed?.result?.tools || [];
    results.tools = Array.isArray(toolList) ? toolList.map((tool) => ({ name: tool.name, description: tool.description || null })) : [];

    if (!Array.isArray(toolList) || toolList.length === 0) {
      errors.push('tools/list returned no tools.');
    }

    if (toolName) {
      const toolExists = results.tools.some((tool) => tool.name === toolName);
      if (!toolExists) {
        errors.push(`Tool "${toolName}" was not returned by tools/list.`);
      } else {
        const toolCallPayload = {
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: toolName,
            arguments: argMap || {},
          },
        };

        const call = await requestJson(toolCallPayload);
        const toolResult = call.parsed?.result;
        results.toolCall = toolResult || null;
        if (!toolResult) {
          errors.push(`tools/call for "${toolName}" returned no result.`);
        }
      }
    }

    results.success = errors.length === 0;
    if (results.success) {
      results.summary = `PASS: MCP server at ${endpoint} responded successfully to initialize, tools/list, and optional tools/call checks.`;
    } else {
      results.summary = `FAIL: ${errors.join(' ')}`;
    }

    return results;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown MCP verification failure.');
    results.summary = `FAIL: ${errors.join(' ')}`;
    results.success = false;
    return results;
  }
}
