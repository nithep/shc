const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve Static Frontend Assets
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// API Routes
app.get('/api/rooms', (req, res) => {
  res.json({
    success: true,
    rooms: [
      { id: 101, status: 'occupied', power: true },
      { id: 102, status: 'occupied', power: true },
      { id: 103, status: 'occupied', power: true },
      { id: 104, status: 'occupied', power: true },
      { id: 105, status: 'occupied', power: true },
      { id: 106, status: 'vacant', power: false }
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Endpoint to receive events from PBX listener
app.post('/api/events/trigger', (req, res) => {
  try {
    const { room_id, event_type } = req.body;
    if (!room_id || !event_type) {
      return res.status(400).json({ success: false, error: 'Missing room_id or event_type' });
    }
    console.log(`[Event Received] Room: ${room_id}, Event: ${event_type}`);
    // Here you could store to database or trigger other actions
    res.json({ success: true, message: 'Event received' });
  } catch (err) {
    console.error('Error processing event:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// React SPA Catch-All Fallback (handles all other routes)
app.use((req, res) => {
  const indexFile = path.join(publicPath, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).send('Frontend Assets Not Built Yet');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Hotel Backend] Server listening on port ${PORT}`);
});