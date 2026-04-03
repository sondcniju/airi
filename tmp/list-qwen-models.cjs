const TOKEN = 'Bearer J8MqTqreCxB8TIOFOxo4lgj45qIkxlL2C6Ne2Efrm3YXKGxu_lIBmMS2pitZl-lvq0FFqVe9mRyo2elUw0utlA';
const URL = 'https://portal.qwen.ai/v1/models';

async function listModels() {
  console.log(`\nLIST MODELS:`);
  const res = await fetch(URL, {
    method: 'GET',
    headers: {
      "authorization": TOKEN,
      "Referer": "http://localhost:5173/"
    }
  });
  const text = await res.text();
  console.log(`STATUS: ${res.status}`);
  console.log(`RESPONSE: ${text}`);
}

listModels().catch(console.error);
