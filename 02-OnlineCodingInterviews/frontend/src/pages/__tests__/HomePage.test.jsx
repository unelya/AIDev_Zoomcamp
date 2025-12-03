import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '../HomePage';

vi.mock('../../services/sessionService', () => ({
  createSession: vi.fn(() =>
    Promise.resolve({
      session: { id: 'abc123' },
      shareUrl: 'http://localhost:5173/session/abc123',
    }),
  ),
}));

const { createSession } = await import('../../services/sessionService');

describe('HomePage', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a session and surfaces the share link', async () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /create session/i }));

    await waitFor(() => expect(createSession).toHaveBeenCalled());

    expect(await screen.findByText('http://localhost:5173/session/abc123')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open session/i })).toBeEnabled();
  });
});
