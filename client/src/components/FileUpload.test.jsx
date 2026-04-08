import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileUpload from './FileUpload';
import {
  SessionProvider,
  resetSessionBootstrapForTests
} from '../context/SessionContext';

jest.mock('../api/http', () => ({
  apiRequest: jest.fn(),
  getApiErrorMessage: (e) => e?.message || String(e)
}));

import { apiRequest } from '../api/http';

beforeEach(() => {
  resetSessionBootstrapForTests();
  sessionStorage.clear();
  sessionStorage.setItem('mindmap.sessionId', 'test-session-id');
  sessionStorage.setItem('mindmap.sessionStart', new Date().toISOString());
  apiRequest.mockReset();
});

function renderModal() {
  return render(
    <SessionProvider>
      <FileUpload onClose={() => {}} />
    </SessionProvider>
  );
}

test('audio tab shows transcription hint and file input', async () => {
  const user = userEvent.setup();
  renderModal();

  await user.click(screen.getByRole('tab', { name: /Audio → transcript/i }));

  expect(
    screen.getByText(/sent to the server for transcription/i)
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/Audio file/i)).toBeInTheDocument();
});

test('transcribe requests /api/transcribe and shows transcript', async () => {
  const user = userEvent.setup();
  apiRequest.mockResolvedValue({
    success: true,
    transcript: 'hello world',
    model: 'whisper-1'
  });

  renderModal();
  await user.click(screen.getByRole('tab', { name: /Audio → transcript/i }));

  const audioInput = screen.getByLabelText(/Audio file/i);
  const file = new File([new ArrayBuffer(8)], 'clip.webm', {
    type: 'audio/webm'
  });
  await user.upload(audioInput, file);

  await user.click(screen.getByRole('button', { name: /^Transcribe$/i }));

  await waitFor(() => {
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/transcribe',
      expect.objectContaining({ method: 'POST' })
    );
  });

  expect(screen.getByDisplayValue('hello world')).toBeInTheDocument();
  expect(screen.getByText(/Model: whisper-1/)).toBeInTheDocument();
});
