const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname)));

app.get('/accountauth', (req, res) => {
  res.sendFile(path.join(__dirname, 'accountauth.html'));
});

app.listen(process.env.PORT || 3000);
