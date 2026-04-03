const TOKEN = 'Bearer J8MqTqreCxB8TIOFOxo4lgj45qIkxlL2C6Ne2Efrm3YXKGxu_lIBmMS2pitZl-lvq0FFqVe9mRyo2elUw0utlA';
const URL = 'https://portal.qwen.ai/v1/chat/completions';

async function test(name, body) {
  console.log(`\nTEST: ${name}`);
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      "authorization": TOKEN,
      "content-type": "application/json",
      "Referer": "http://localhost:5173/"
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  console.log(`STATUS: ${res.status}`);
  console.log(`RESPONSE: ${text}`);
}

async function run() {
  const model = 'coder-model';
  const messages = [{ role: 'user', content: 'hi' }];

  // 1. No parameters field
  await test('No parameters field', {
    model,
    messages,
    tools: [{
      "type": "function",
      "function": {
        "name": "mcp_list_tools",
        "description": "List tools"
      }
    }],
    stream: false
  });

  // 2. Dummy property
  await test('Dummy property', {
    model,
    messages,
    tools: [{
      "type": "function",
      "function": {
        "name": "mcp_list_tools",
        "description": "List tools",
        "parameters": { "type": "object", "properties": { "dummy": { "type": "string" } } }
      }
    }],
    stream: false
  });

  // 3. tool_choice: "none"
  await test('tool_choice: none', {
    model,
    messages,
    tools: [{
      "type": "function",
      "function": {
        "name": "mcp_list_tools",
        "description": "List tools",
        "parameters": { "type": "object", "properties": {} }
      }
    }],
    tool_choice: 'none',
    stream: false
  });
}

run().catch(console.error);
