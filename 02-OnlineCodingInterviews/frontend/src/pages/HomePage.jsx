import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createSession } from '../services/sessionService';

const SUPPORTED_LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
];

const HomePage = () => {
  const [language, setLanguage] = useState('javascript');
  const [creating, setCreating] = useState(false);
  const [sessionDetails, setSessionDetails] = useState(null);
  const [createError, setCreateError] = useState('');
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const navigate = useNavigate();

  const handleCreateSession = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const result = await createSession(language);
      setSessionDetails(result);
    } catch (error) {
      setCreateError(error.message);
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = (event) => {
    event.preventDefault();
    setJoinError('');
    if (!sessionIdInput.trim()) {
      setJoinError('Please enter a valid session id');
      return;
    }
    navigate(`/session/${sessionIdInput.trim()}`);
  };

  const copyToClipboard = async () => {
    if (!sessionDetails?.shareUrl) {
      return;
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(sessionDetails.shareUrl);
      } else {
        window.prompt('Copy this link', sessionDetails.shareUrl);
      }
    } catch {
      setCreateError('Unable to copy the share link automatically');
    }
  };

  return (
    <div className="layout">
      <header className="hero">
        <h1>Collaborative Coding Interviews</h1>
        <p>Spin up a real-time interview workspace, share the link, and observe candidates as they code.</p>
      </header>

      <section className="card-grid">
        <div className="card">
          <h2>Create a new session</h2>
          <p>Select a default language and share the generated link with candidates.</p>
          <label htmlFor="language-select">Default language</label>
          <select id="language-select" value={language} onChange={(event) => setLanguage(event.target.value)}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
          <button className="primary" onClick={handleCreateSession} disabled={creating}>
            {creating ? 'Creating...' : 'Create session'}
          </button>
          {createError && <p className="error">{createError}</p>}

          {sessionDetails && (
            <div className="share-box">
              <p>Share this link</p>
              <code>{sessionDetails.shareUrl}</code>
              <div className="share-actions">
                <button onClick={copyToClipboard}>Copy link</button>
                <button onClick={() => navigate(`/session/${sessionDetails.session.id}`)}>Open session</button>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2>Join existing session</h2>
          <p>Enter the session id from the shared link to jump right in.</p>
          <form className="form-stack" onSubmit={handleJoin}>
            <label htmlFor="session-id">Session id</label>
            <input
              id="session-id"
              placeholder="e.g. a1b2c3"
              value={sessionIdInput}
              onChange={(event) => setSessionIdInput(event.target.value)}
            />
            {joinError && <p className="error">{joinError}</p>}
            <button type="submit" className="secondary">
              Join session
            </button>
          </form>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
