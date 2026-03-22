const express = require('express');
const app = express();

app.use(express.static('.'));

app.get('/accountauth', (req, res) => {
  res.sendFile(__dirname + '/accountauth.html');
});

app.listen(process.env.PORT || 3000);
