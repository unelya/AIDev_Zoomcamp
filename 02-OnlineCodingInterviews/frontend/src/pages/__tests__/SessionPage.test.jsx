import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../../services/sessionService', () => ({
  fetchSession: vi.fn(() =>
    Promise.resolve({
      id: 'room123',
      code: 'initial code();',
      language: 'javascript',
      participants: {},
    }),
  ),
}));

vi.mock('../../utils/runCode', () => ({
  runCode: vi.fn(() => Promise.resolve({ output: 'All good' })),
}));

const mockRunCode = (await import('../../utils/runCode')).runCode;
const { fetchSession } = await import('../../services/sessionService');

class MockSocket {
  constructor() {
    this.handlers = {};
    this.emit = vi.fn();
    this.disconnect = vi.fn();
  }

  on(event, handler) {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(handler);
    if (event === 'connect') {
      setTimeout(() => handler(), 0);
    }
  }

  trigger(event, payload) {
    (this.handlers[event] || []).forEach((handler) => handler(payload));
  }
}

const ioMock = vi.fn(() => new MockSocket());

vi.mock('socket.io-client', () => ({
  io: (...args) => ioMock(...args),
  default: (...args) => ioMock(...args),
}));

vi.mock('@monaco-editor/react', () => {
  const React = require('react');
  const { useEffect } = React;
  return {
    default: ({ value = '', onChange, onMount }) => {
      useEffect(() => {
        onMount?.({
          onDidChangeCursorPosition: () => ({ dispose: vi.fn() }),
        });
      }, [onMount]);
      return React.createElement('textarea', {
        'data-testid': 'editor',
        value,
        onChange: (event) => onChange?.(event.target.value),
      });
    },
  };
});

const SessionPage = (await import('../SessionPage')).default;

describe('SessionPage', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'prompt', {
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn() },
      configurable: true,
    });
  });

  beforeEach(() => {
    window.localStorage.setItem('oci-username', JSON.stringify('Tester'));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={['/session/room123']}>
        <Routes>
          <Route path="/session/:sessionId" element={<SessionPage />} />
        </Routes>
      </MemoryRouter>,
    );

  it('joins the socket session and processes editor events', async () => {
    renderPage();

    await waitFor(() => expect(fetchSession).toHaveBeenCalledWith('room123'));

    await waitFor(() => expect(ioMock).toHaveBeenCalled());
    const socket = ioMock.mock.results.at(-1)?.value;
    expect(socket).toBeDefined();

    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith('session:join', expect.objectContaining({ username: 'Tester' })),
    );

    act(() => {
      socket.trigger('session:init', {
        id: 'room123',
        code: 'from server',
        language: 'javascript',
        participants: {},
      });
    });

    expect(await screen.findByDisplayValue('from server')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('editor'), { target: { value: 'local edit' } });
    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith('editor:update', expect.objectContaining({ code: 'local edit' })),
    );

    act(() => {
      socket.trigger('editor:update', { code: 'remote data' });
    });
    expect(await screen.findByDisplayValue('remote data')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /run code/i }));
    await waitFor(() => expect(mockRunCode).toHaveBeenCalled());
    expect(socket.emit).toHaveBeenCalledWith(
      'run:result',
      expect.objectContaining({ output: 'All good', error: '' }),
    );
  });
});
