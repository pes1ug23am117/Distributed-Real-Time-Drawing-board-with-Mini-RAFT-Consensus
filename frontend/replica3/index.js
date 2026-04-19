const express = require('express');
const app = express();
const PORT = process.env.PORT || 4001;
const REPLICA_ID = process.env.REPLICA_ID || 'unknown';

app.get('/health', (req, res) => {
  res.json({ status: 'ok', replica: REPLICA_ID });
});

app.listen(PORT, () => {
  console.log(`Replica ${REPLICA_ID} running on port ${PORT}`);
});