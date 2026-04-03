const TOKEN = 'Bearer J8MqTqreCxB8TIOFOxo4lgj45qIkxlL2C6Ne2Efrm3YXKGxu_lIBmMS2pitZl-lvq0FFqVe9mRyo2elUw0utlA';
const URL = 'https://portal.qwen.ai/v1/chat/completions';

async function testHyperMinimal() {
  console.log(`\nTEST: Hyper-Minimal (Model + Messages only)`);
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      "authorization": TOKEN,
      "content-type": "application/json",
      "Referer": "http://localhost:5173/"
    },
    body: JSON.stringify({
      model: 'coder-model',
      messages: [{ role: 'user', content: 'hello' }]
    })
  });
  const text = await res.text();
  console.log(`STATUS: ${res.status}`);
  console.log(`RESPONSE: ${text}`);
}

testHyperMinimal().catch(console.error);
