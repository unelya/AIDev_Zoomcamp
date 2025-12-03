import Editor from '@monaco-editor/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { SOCKET_URL } from '../config';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useMonacoSetup } from '../editor/useMonacoSetup';
import { usePythonDiagnostics } from '../editor/usePythonDiagnostics';
import { fetchSession } from '../services/sessionService';
import { runCode } from '../utils/runCode';

const LANGUAGE_OPTIONS = [
  { value: 'javascript', label: 'JavaScript', monaco: 'javascript' },
  { value: 'typescript', label: 'TypeScript', monaco: 'typescript' },
  { value: 'python', label: 'Python', monaco: 'python' },
];

const SessionPage = () => {
  const { sessionId } = useParams();
  useMonacoSetup();
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [participants, setParticipants] = useState({});
  const [status, setStatus] = useState('Checking session...');
  const [error, setError] = useState('');
  const [sessionReady, setSessionReady] = useState(false);
  const [username, setUsername] = useLocalStorage('oci-username', '');
  const [nameInput, setNameInput] = useState(username);
  const [modalError, setModalError] = useState('');
  const [output, setOutput] = useState('');
  const [executionError, setExecutionError] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [recentRunAuthor, setRecentRunAuthor] = useState('');
  const [cursorPositions, setCursorPositions] = useState({});

  const socketRef = useRef(null);
  const editorRef = useRef(null);
  const debounceRef = useRef(null);
  const cursorListenerRef = useRef(null);
  usePythonDiagnostics(editorRef, language, code);

  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const verifySession = async () => {
      setStatus('Fetching session metadata...');
      try {
        await fetchSession(sessionId);
        if (mounted) {
          setSessionReady(true);
          setStatus('Session ready');
        }
      } catch (fetchError) {
        setError(fetchError.message);
      }
    };
    verifySession();
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionReady || !username) {
      return;
    }
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('Connected');
      socket.emit('session:join', { sessionId, username });
    });

    socket.on('session:init', (payload) => {
      setCode(payload.code);
      setLanguage(payload.language);
      setParticipants(payload.participants || {});
    });

    socket.on('editor:update', ({ code: remoteCode }) => {
      setCode(remoteCode);
    });

    socket.on('language:update', ({ language: nextLanguage }) => {
      setLanguage(nextLanguage);
    });

    socket.on('presence:join', (participant) => {
      setParticipants((prev) => ({
        ...prev,
        [participant.id]: { username: participant.username, joinedAt: participant.joinedAt },
      }));
    });

    socket.on('presence:left', ({ id }) => {
      setParticipants((prev) => {
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      setCursorPositions((prev) => {
        const cloned = { ...prev };
        delete cloned[id];
        return cloned;
      });
    });

    socket.on('cursor:update', ({ userId, cursor, username: remoteUsername }) => {
      setCursorPositions((prev) => ({
        ...prev,
        [userId]: { ...cursor, username: remoteUsername },
      }));
    });

    socket.on('run:result', ({ output: remoteOutput, error: remoteError, author }) => {
      setRecentRunAuthor(author ? `${author} ran the code` : 'Someone ran the code');
      setOutput(remoteOutput || '');
      setExecutionError(remoteError || '');
    });

    socket.on('session:error', (message) => {
      setError(message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionReady, sessionId, username]);

  useEffect(
    () => () => {
      clearTimeout(debounceRef.current);
      cursorListenerRef.current?.dispose();
    },
    [],
  );

  const handleEditorChange = (value) => {
    setCode(value || '');
    if (!socketRef.current) {
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      socketRef.current.emit('editor:update', { sessionId, code: value || '' });
    }, 200);
  };

  const handleLanguageChange = (event) => {
    const nextLanguage = event.target.value;
    setLanguage(nextLanguage);
    socketRef.current?.emit('language:update', { sessionId, language: nextLanguage });
  };

  const handleRunCode = async () => {
    setIsRunning(true);
    setExecutionError('');
    setRecentRunAuthor('You ran the code');
    const result = await runCode(language, code);
    setIsRunning(false);
    setOutput(result.output || '');
    if (result.error) {
      setExecutionError(result.error);
    }
    socketRef.current?.emit('run:result', {
      sessionId,
      output: result.output || '',
      error: result.error || '',
    });
  };

  const handleUsernameSubmit = (event) => {
    event.preventDefault();
    if (!nameInput.trim()) {
      setModalError('Please enter a display name');
      return;
    }
    setUsername(nameInput.trim());
    setModalError('');
  };

  const handleCursorActivity = (cursorEvent) => {
    if (!socketRef.current) {
      return;
    }
    socketRef.current.emit('cursor:update', {
      sessionId,
      cursor: cursorEvent.position,
    });
  };

  const participantList = useMemo(
    () =>
      Object.entries(participants).map(([id, info]) => ({
        id,
        username: info.username,
        cursor: cursorPositions[id],
      })),
    [participants, cursorPositions],
  );

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/session/${sessionId}` : '';

  const copyShareLink = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        window.prompt('Copy this link', shareUrl);
      }
    } catch {
      setStatus('Copy failed, please copy the url manually.');
    }
  };

  if (error) {
    return (
      <div className="layout">
        <div className="card">
          <h2>Unable to load session</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/')}>Back to home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="session-layout">
      {!username && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={handleUsernameSubmit}>
            <h2>Introduce yourself</h2>
            <p>Share a name so other participants can identify you.</p>
            <input value={nameInput} onChange={(event) => setNameInput(event.target.value)} placeholder="Display name" />
            {modalError && <p className="error">{modalError}</p>}
            <button type="submit" className="primary">
              Join session
            </button>
          </form>
        </div>
      )}
      <header className="session-header">
        <div>
          <p className="eyebrow">Session</p>
          <h1>{sessionId}</h1>
          <p>{status}</p>
        </div>
        <div className="header-actions">
          <span className="muted">{shareUrl}</span>
          <button onClick={copyShareLink}>Copy link</button>
        </div>
      </header>

      <div className="session-body">
        <div className="editor-column">
          <div className="toolbar">
            <label htmlFor="language">Language</label>
            <select id="language" value={language} onChange={handleLanguageChange}>
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button className="primary" onClick={handleRunCode} disabled={isRunning}>
              {isRunning ? 'Running...' : 'Run code'}
            </button>
          </div>
          <Editor
            height="60vh"
            theme="vs-dark"
            language={LANGUAGE_OPTIONS.find((lang) => lang.value === language)?.monaco || 'javascript'}
            value={code}
            onMount={(editorInstance) => {
              editorRef.current = editorInstance;
              if (cursorListenerRef.current) {
                cursorListenerRef.current.dispose();
              }
              cursorListenerRef.current = editorInstance.onDidChangeCursorPosition(handleCursorActivity);
            }}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              renderWhitespace: 'selection',
              scrollBeyondLastLine: false,
            }}
          />
        </div>
        <aside className="sidebar">
          <section>
            <h3>Participants ({participantList.length})</h3>
            <ul className="participant-list">
              {participantList.map((participant) => (
                <li key={participant.id}>
                  <span>{participant.username}</span>
                  {participant.cursor && (
                    <small>
                      Line {participant.cursor.lineNumber}, Col {participant.cursor.column}
                    </small>
                  )}
                </li>
              ))}
              {participantList.length === 0 && <li className="muted">Waiting for participants...</li>}
            </ul>
          </section>
          <section>
            <h3>Execution console</h3>
            {recentRunAuthor && <p className="muted">{recentRunAuthor}</p>}
            <pre className="console-output">{output || 'No output yet'}</pre>
            {executionError && <p className="error">{executionError}</p>}
          </section>
        </aside>
      </div>
    </div>
  );
};

export default SessionPage;
