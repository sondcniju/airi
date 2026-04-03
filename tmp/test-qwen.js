const fetch = require('node-fetch');

const TOKEN = 'Bearer J8MqTqreCxB8TIOFOxo4lgj45qIkxlL2C6Ne2Efrm3YXKGxu_lIBmMS2pitZl-lvq0FFqVe9mRyo2elUw0utlA';
const URL = 'https://portal.qwen.ai/v1/chat/completions';

async function test(name, body) {
  console.log(`\n--- Testing: ${name} ---`);
  try {
    const res = await fetch(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': TOKEN
      },
      body: JSON.stringify(body)
    });
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${text}`);
    return res.status === 200;
  } catch (err) {
    console.error(`Error: ${err.message}`);
    return false;
  }
}

const baselineTools = [
  {
    "function": {
      "description": "Discovery: List all tools available on the connected MCP servers. Use this first to see what capabilities are available.",
      "name": "mcp_list_tools",
      "parameters": {
        "type": "object",
        "properties": {}
      }
    },
    "type": "function"
  },
  {
    "function": {
      "description": "Execution: Call a specific tool on an MCP server. Requires a qualified name in \"server::tool\" format (found via mcp_list_tools).",
      "name": "mcp_call_tool",
      "parameters": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "The qualified tool name to call. Use format \"<serverName>::<toolName>\""
          },
          "parameters": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string",
                  "description": "The name of the parameter"
                },
                "value": {
                  "description": "The value of the parameter",
                  "type": "string"
                }
              },
              "required": [
                "name",
                "value"
              ]
            },
            "description": "The parameters to pass to the tool"
          }
        },
        "required": [
          "name",
          "parameters"
        ]
      }
    },
    "type": "function"
  }
];

// Duplicated tools as seen in the user's request
const duplicatedTools = [...baselineTools, ...baselineTools];

async function runTests() {
  // 1. Baseline (with duplicates)
  await test('Baseline (with duplicates)', {
    model: 'coder-model',
    messages: [{ role: 'user', content: 'Hello, world!' }],
    tools: duplicatedTools,
    stream: false
  });

  // 2. Remove duplicates
  await test('Remove Duplicates', {
    model: 'coder-model',
    messages: [{ role: 'user', content: 'Hello, world!' }],
    tools: baselineTools,
    stream: false
  });

  // 3. Fix empty properties (parameters: null or remove parameters)
  const fixedEmptyTools = JSON.parse(JSON.stringify(baselineTools));
  // Some models prefer null parameters if empty
  fixedEmptyTools[0].function.parameters = { type: 'object', properties: {} };
  // Let's try removing it entirely if empty? No, OpenAI says object.
  // Let's try adding additionalProperties: true
  // Or just removing parameters field if it's empty
  
  await test('No empty properties (parameters: null)', {
    model: 'coder-model',
    messages: [{ role: 'user', content: 'Hello, world!' }],
    tools: [
       {
          ...baselineTools[0],
          function: { ...baselineTools[0].function, parameters: null }
       },
       baselineTools[1]
    ],
    stream: false
  });

  // 4. Try Qwen standard model name if coder-model fails
  await test('Try qwen-plus (deduped)', {
    model: 'qwen-plus',
    messages: [{ role: 'user', content: 'Hello, world!' }],
    tools: baselineTools,
    stream: false
  });
}

runTests();
