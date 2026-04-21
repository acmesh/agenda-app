require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'tasks.json');
const TOKENS_FILE = path.join(__dirname, '.tokens.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize tasks file
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
}

// Load saved OAuth tokens
let userTokens = null;
if (fs.existsSync(TOKENS_FILE)) {
  try { userTokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')); } catch {}
}

const readTasks = () => {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return []; }
};
const writeTasks = (tasks) => fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2));

// ── Tasks API ──────────────────────────────────────────────────────────────────

app.get('/api/tasks', (req, res) => res.json(readTasks()));

app.post('/api/tasks', (req, res) => {
  const tasks = readTasks();
  const task = {
    id: Date.now().toString(),
    text: (req.body.text || '').trim(),
    category: req.body.category || 'Todo',
    status: 'none',
    createdAt: new Date().toISOString()
  };
  if (!task.text) return res.status(400).json({ error: 'Text is required' });
  tasks.unshift(task);
  writeTasks(tasks);
  res.json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const tasks = readTasks();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found' });
  const allowed = ['text', 'category', 'status'];
  allowed.forEach(k => { if (req.body[k] !== undefined) tasks[idx][k] = req.body[k]; });
  writeTasks(tasks);
  res.json(tasks[idx]);
});

app.delete('/api/tasks/:id', (req, res) => {
  const tasks = readTasks().filter(t => t.id !== req.params.id);
  writeTasks(tasks);
  res.json({ success: true });
});

// ── Google Calendar OAuth ──────────────────────────────────────────────────────

const makeOAuth2 = () => new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `http://localhost:${PORT}/auth/google/callback`
);

app.get('/auth/status', (req, res) => res.json({
  authenticated: !!userTokens,
  configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}));

app.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    return res.redirect('/?error=no-credentials');
  const url = makeOAuth2().generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  if (req.query.error) return res.redirect('/?error=auth-denied');
  try {
    const { tokens } = await makeOAuth2().getToken(req.query.code);
    userTokens = tokens;
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
    res.redirect('/?auth=success');
  } catch (e) {
    console.error('Auth error:', e.message);
    res.redirect('/?error=token-failed');
  }
});

app.post('/auth/logout', (req, res) => {
  userTokens = null;
  if (fs.existsSync(TOKENS_FILE)) fs.unlinkSync(TOKENS_FILE);
  res.json({ success: true });
});

// ── Calendar Event API ─────────────────────────────────────────────────────────

app.post('/api/calendar/event', async (req, res) => {
  if (!userTokens) return res.status(401).json({ error: 'Not authenticated with Google Calendar' });

  try {
    const client = makeOAuth2();
    client.setCredentials(userTokens);

    // Auto-refresh token if expired
    client.on('tokens', (tokens) => {
      if (tokens.refresh_token) userTokens.refresh_token = tokens.refresh_token;
      userTokens.access_token = tokens.access_token;
      fs.writeFileSync(TOKENS_FILE, JSON.stringify(userTokens, null, 2));
    });

    const calendar = google.calendar({ version: 'v3', auth: client });
    const { title, description, datetime, duration, notificationType, reminderMinutes } = req.body;

    const start = new Date(datetime);
    const end = new Date(start.getTime() + (parseInt(duration) || 30) * 60000);
    const mins = parseInt(reminderMinutes) || 30;

    const reminders = [];
    if (notificationType === 'email') {
      reminders.push({ method: 'email', minutes: mins });
    } else if (notificationType === 'both') {
      reminders.push({ method: 'email', minutes: mins });
      reminders.push({ method: 'popup', minutes: Math.min(mins, 10) });
    } else {
      reminders.push({ method: 'popup', minutes: mins });
    }

    const event = {
      summary: title,
      description: description || '',
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
      reminders: { useDefault: false, overrides: reminders }
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      resource: event,
      sendUpdates: (notificationType === 'email' || notificationType === 'both') ? 'all' : 'none'
    });

    res.json({ success: true, eventId: result.data.id, link: result.data.htmlLink });
  } catch (e) {
    console.error('Calendar error:', e.message);
    if (e.code === 401) { userTokens = null; if (fs.existsSync(TOKENS_FILE)) fs.unlinkSync(TOKENS_FILE); }
    res.status(500).json({ error: e.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  Agenda App → http://localhost:${PORT}\n`);
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.log('  Google Calendar: copy .env.example to .env and add your credentials\n');
  } else {
    console.log('  Google Calendar: credentials found\n');
  }
});
