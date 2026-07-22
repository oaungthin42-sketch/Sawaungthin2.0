const express = require('express');
const app = express();
const cors = require('cors');

app.use(cors());
app.use(express.json());

app.post('*', (req, res) => {
    try {
        const body = req.body;
        const text = JSON.parse(body.contents[0].parts[0].text);
        
        const responseText = text.map(item => ({
            index: item.index,
            text: item.original_text + ' (translated)'
        }));

        res.json({
            candidates: [
                {
                    content: {
                        parts: [{ text: JSON.stringify(responseText) }]
                    }
                }
            ]
        });
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.listen(3001, () => {
    console.log('Mock server running on 3001');
});
