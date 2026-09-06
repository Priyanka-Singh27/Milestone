const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

// Health check — confirms the server itself is running
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

// Person A's routes will be registered here, e.g.:
app.use('/api/v1/roles', require('./routes/roles.routes'));
// app.use('/api/v1/roadmap', require('./routes/roadmap.routes'));
app.use('/api/v1/skills', require('./routes/skills.routes'));

module.exports = app;

app.use('/api/v1/applications', require('./routes/applications.routes'));