const { v4: uuid } = require('uuid');

const LANGUAGE_SCAFFOLDS = {
  javascript: `function solution(input) {
  // Write your code here
  return input;
}

console.log(solution('Hello, interview!'));`,
  python: `def solution(value):
    # Write your code here
    return value


print(solution("Hello, interview!"))`,
  typescript: `export function solution(input: string): string {
  // Write your code here
  return input;
}

console.log(solution("Hello, interview!"));`,
};

class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  createSession(language = 'javascript') {
    const id = uuid().split('-')[0];
    const code = LANGUAGE_SCAFFOLDS[language] || LANGUAGE_SCAFFOLDS.javascript;
    const session = {
      id,
      language,
      code,
      participants: {},
      createdAt: Date.now(),
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id) {
    return this.sessions.get(id);
  }

  updateSession(id, updates) {
    const existing = this.sessions.get(id);
    if (!existing) {
      return null;
    }
    const updated = { ...existing, ...updates };
    this.sessions.set(id, updated);
    return updated;
  }

  deleteSession(id) {
    return this.sessions.delete(id);
  }

  listSessions() {
    return Array.from(this.sessions.values());
  }
}

module.exports = new SessionStore();
