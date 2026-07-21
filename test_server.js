const http = require('http');
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    candidates: [{
      content: {
        parts: [{ text: '[{"timestamp":[0,5],"text":"ကျေးဇူးတင်ပါတယ်"}]' }]
      }
    }]
  }));
}).listen(3001, () => console.log('Mock server running on 3001'));
