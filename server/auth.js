const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { q, one } = require('./db');

const COOKIE = 'troqly_sid';
const DAYS = 60;

function newToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

async function createSession(res, userId) {
  const token = newToken();
  await q("INSERT INTO sessions(token,user_id,expires_at) VALUES ($1,$2, now() + interval '60 days')", [token, userId]);
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: DAYS * 864e5,
  });
}

async function userFromToken(token) {
  if (!token) return null;
  return one(
    `SELECT u.id, u.email, u.display_name, u.locale, u.currency, u.theme
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token]
  );
}

async function attachUser(req, _res, next) {
  try {
    req.user = await userFromToken(req.cookies[COOKIE]);
  } catch (e) {
    req.user = null;
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  next();
}

async function hashPassword(p) {
  return bcrypt.hash(p, 10);
}
async function checkPassword(p, h) {
  return bcrypt.compare(p, h);
}

async function isMember(groupId, userId) {
  return !!(await one('SELECT 1 FROM group_members WHERE group_id=$1 AND user_id=$2', [groupId, userId]));
}

module.exports = { COOKIE, newToken, createSession, userFromToken, attachUser, requireUser, hashPassword, checkPassword, isMember };
