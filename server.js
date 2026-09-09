const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');

const app     = express();
const PORT    = 3001;
const DB_FILE = path.join(__dirname, 'jira_stories.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function readDB()      { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
function uid()         { return 'proj-' + Date.now().toString(36); }

// ── GET /api/projects ─────────────────────────────────────────────
app.get('/api/projects', (req, res) => {
  const db = readDB();
  const showAll = req.query.all === 'true';
  const projects = (db.projects || [])
    .filter(p => showAll || p.isActive !== false)
    .map(p => ({
      ...p,
      issueCount: (db.issues || []).filter(i => i.projectId === p.id).length
    }));
  res.json(projects);
});

// ── PUT /api/projects/:id/reactivate ────────────────────────────
app.put('/api/projects/:id/reactivate', (req, res) => {
  const db  = readDB();
  const idx = (db.projects || []).findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  db.projects[idx].isActive = true;
  delete db.projects[idx].deactivatedAt;
  writeDB(db);
  res.json(db.projects[idx]);
});

// ── DELETE /api/projects/:id/permanent ───────────────────────────
app.delete('/api/projects/:id/permanent', (req, res) => {
  const db = readDB();
  const before = (db.projects || []).length;
  db.projects = (db.projects || []).filter(p => p.id !== req.params.id);
  if (db.projects.length === before) return res.status(404).json({ error: 'Project not found' });
  db.issues = (db.issues || []).filter(i => i.projectId !== req.params.id);
  if (db.counters) delete db.counters[req.params.id];
  writeDB(db);
  res.json({ deleted: req.params.id });
});

// ── GET /api/projects/:id ─────────────────────────────────────────
app.get('/api/projects/:id', (req, res) => {
  const db = readDB();
  const project = (db.projects || []).find(p => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

// ── POST /api/projects ────────────────────────────────────────────
app.post('/api/projects', (req, res) => {
  const db = readDB();
  if (!db.projects) db.projects = [];
  const key = (req.body.key || req.body.name.slice(0,4)).toUpperCase().replace(/\s/g,'');
  const project = {
    id:          uid(),
    name:        req.body.name,
    key,
    type:        req.body.type        || 'Software',
    description: req.body.description || '',
    lead:        req.body.lead        || '',
    color:       req.body.color       || '#0052cc',
    isActive:    true,
    createdAt:   new Date().toISOString()
  };
  // init per-project issue counter
  if (!db.counters) db.counters = {};
  db.counters[project.id] = 0;
  db.projects.push(project);
  writeDB(db);
  res.status(201).json(project);
});

// ── PUT /api/projects/:id ─────────────────────────────────────────
app.put('/api/projects/:id', (req, res) => {
  const db  = readDB();
  const idx = (db.projects || []).findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  db.projects[idx] = { ...db.projects[idx], ...req.body, id: db.projects[idx].id, createdAt: db.projects[idx].createdAt };
  writeDB(db);
  res.json(db.projects[idx]);
});

// ── DELETE /api/projects/:id  (soft delete — sets isActive: false) ─
app.delete('/api/projects/:id', (req, res) => {
  const db  = readDB();
  const idx = (db.projects || []).findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Project not found' });
  db.projects[idx].isActive = false;
  db.projects[idx].deactivatedAt = new Date().toISOString();
  writeDB(db);
  res.json({ deactivated: req.params.id });
});

// ── GET /api/issues?projectId= ────────────────────────────────────
app.get('/api/issues', (req, res) => {
  const db = readDB();
  let issues = db.issues || [];
  const { projectId, type, priority, sprint, q } = req.query;
  if (projectId) issues = issues.filter(i => i.projectId === projectId);
  if (type)      issues = issues.filter(i => i.type === type);
  if (priority)  issues = issues.filter(i => i.priority === priority);
  if (sprint)    issues = issues.filter(i => i.sprint === sprint);
  if (q) {
    const lq = q.toLowerCase();
    issues = issues.filter(i =>
      i.title.toLowerCase().includes(lq) ||
      i.id.toLowerCase().includes(lq) ||
      (i.assignee || '').toLowerCase().includes(lq)
    );
  }
  res.json({ meta: db.meta, issues });
});

// ── GET /api/issues/:id ───────────────────────────────────────────
app.get('/api/issues/:id', (req, res) => {
  const issue = (readDB().issues || []).find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  res.json(issue);
});

// ── POST /api/issues ──────────────────────────────────────────────
app.post('/api/issues', (req, res) => {
  const db = readDB();
  if (!db.counters) db.counters = {};
  const projectId = req.body.projectId || 'proj-vo';
  const project   = (db.projects || []).find(p => p.id === projectId);
  const key       = project ? project.key : 'VO';
  const maxNum = (db.issues || [])
    .filter(i => i.projectId === projectId)
    .map(i => parseInt((i.id || '').split('-')[1]) || 0)
    .reduce((a, b) => Math.max(a, b), db.counters[projectId] || 0);
  db.counters[projectId] = maxNum + 1;
  const now   = new Date().toISOString();
  const issue = {
    id:          `${key}-${db.counters[projectId]}`,
    projectId,
    title:       req.body.title,
    description: req.body.description || '',
    type:        req.body.type        || 'task',
    priority:    req.body.priority    || 'Medium',
    status:      req.body.status      || 'backlog',
    assignee:    req.body.assignee    || '',
    sprint:      req.body.sprint      || 'Sprint 1',
    createdAt:   now,
    updatedAt:   now
  };
  db.issues.push(issue);
  writeDB(db);
  res.status(201).json(issue);
});

// ── PUT /api/issues/:id ───────────────────────────────────────────
app.put('/api/issues/:id', (req, res) => {
  const db  = readDB();
  const idx = (db.issues || []).findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Issue not found' });
  db.issues[idx] = { ...db.issues[idx], ...req.body, id: db.issues[idx].id, projectId: db.issues[idx].projectId, createdAt: db.issues[idx].createdAt, updatedAt: new Date().toISOString() };
  writeDB(db);
  res.json(db.issues[idx]);
});

// ── DELETE /api/issues/:id ────────────────────────────────────────
app.delete('/api/issues/:id', (req, res) => {
  const db     = readDB();
  const before = (db.issues || []).length;
  db.issues    = (db.issues || []).filter(i => i.id !== req.params.id);
  if (db.issues.length === before) return res.status(404).json({ error: 'Issue not found' });
  writeDB(db);
  res.json({ deleted: req.params.id });
});

// ── Comments ──────────────────────────────────────────────────────
app.get('/api/issues/:id/comments', (req, res) => {
  const issue = (readDB().issues || []).find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  res.json(issue.comments || []);
});
app.post('/api/issues/:id/comments', (req, res) => {
  const db = readDB();
  const issue = db.issues.find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  if (!issue.comments) issue.comments = [];
  const comment = { id: Date.now().toString(), author: req.body.author || 'Me', text: req.body.text, createdAt: new Date().toISOString() };
  issue.comments.push(comment);
  writeDB(db);
  res.status(201).json(comment);
});
app.delete('/api/issues/:id/comments/:cid', (req, res) => {
  const db = readDB();
  const issue = db.issues.find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  issue.comments = (issue.comments || []).filter(c => c.id !== req.params.cid);
  writeDB(db);
  res.json({ deleted: req.params.cid });
});

// ── Worklogs ──────────────────────────────────────────────────────
app.get('/api/issues/:id/worklogs', (req, res) => {
  const issue = (readDB().issues || []).find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  res.json(issue.worklogs || []);
});
app.post('/api/issues/:id/worklogs', (req, res) => {
  const db = readDB();
  const issue = db.issues.find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  if (!issue.worklogs) issue.worklogs = [];
  const log = { id: Date.now().toString(), author: req.body.author || 'Me', timeSpent: req.body.timeSpent, description: req.body.description || '', date: req.body.date || new Date().toISOString().slice(0,10), loggedAt: new Date().toISOString() };
  issue.worklogs.push(log);
  writeDB(db);
  res.status(201).json(log);
});
app.delete('/api/issues/:id/worklogs/:wid', (req, res) => {
  const db = readDB();
  const issue = db.issues.find(i => i.id === req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found' });
  issue.worklogs = (issue.worklogs || []).filter(w => w.id !== req.params.wid);
  writeDB(db);
  res.json({ deleted: req.params.wid });
});

// ── GET /api/projects/:id/versions ──────────────────────────────
app.get('/api/projects/:id/versions', (req, res) => {
  const db = readDB();
  const versions = (db.versions || []).filter(v => v.projectId === req.params.id);
  res.json(versions);
});

// ── POST /api/projects/:id/versions ──────────────────────────────
app.post('/api/projects/:id/versions', (req, res) => {
  const db = readDB();
  if (!db.versions) db.versions = [];
  const version = {
    id: 'v-' + Date.now().toString(36),
    projectId: req.params.id,
    name: req.body.name,
    description: req.body.description || '',
    releaseDate: req.body.releaseDate || '',
    released: false,
    createdAt: new Date().toISOString()
  };
  db.versions.push(version);
  writeDB(db);
  res.status(201).json(version);
});

// ── PUT /api/projects/:id/versions/:vid ───────────────────────────
app.put('/api/projects/:id/versions/:vid', (req, res) => {
  const db = readDB();
  const idx = (db.versions || []).findIndex(v => v.id === req.params.vid);
  if (idx === -1) return res.status(404).json({ error: 'Version not found' });
  db.versions[idx] = { ...db.versions[idx], ...req.body, id: db.versions[idx].id, projectId: db.versions[idx].projectId };
  writeDB(db);
  res.json(db.versions[idx]);
});

// ── DELETE /api/projects/:id/versions/:vid ────────────────────────
app.delete('/api/projects/:id/versions/:vid', (req, res) => {
  const db = readDB();
  const before = (db.versions || []).length;
  db.versions = (db.versions || []).filter(v => v.id !== req.params.vid);
  if (db.versions.length === before) return res.status(404).json({ error: 'Version not found' });
  writeDB(db);
  res.json({ deleted: req.params.vid });
});

app.get('/api/meta', (req, res) => res.json(readDB().meta));

app.listen(PORT, () => {
  console.log(`\n  VaultOne Board API  →  http://localhost:${PORT}`);
  console.log(`  Board UI            →  http://localhost:${PORT}/JiraBoard.html\n`);
});
