import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileUpload from './FileUpload';
import {
  SessionProvider,
  resetSessionBootstrapForTests
} from '../context/SessionContext';
import { IdentityProvider } from '../context/IdentityContext';

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
      <IdentityProvider>
        <FileUpload onClose={() => {}} />
      </IdentityProvider>
    </SessionProvider>
  );
}

test('audio tab shows privacy hint and upload sub-tab', async () => {
  const user = userEvent.setup();
  renderModal();

  await user.click(screen.getByRole('tab', { name: /Audio → transcript/i }));

  expect(
    screen.getByText(/sent to the server for transcription/i)
  ).toBeInTheDocument();
  expect(screen.getByText(/25 MB/i)).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /^Upload file$/i })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  expect(screen.getByLabelText(/Audio file/i)).toBeInTheDocument();
});

test('audio tab Record sub-tab shows Start recording', async () => {
  const user = userEvent.setup();
  renderModal();

  await user.click(screen.getByRole('tab', { name: /Audio → transcript/i }));
  await user.click(screen.getByRole('tab', { name: /^Record$/i }));

  expect(screen.getByRole('button', { name: /Start recording/i })).toBeInTheDocument();
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

test('transcribe with verbose sends verbose=1 and shows segment timings', async () => {
  const user = userEvent.setup();
  apiRequest.mockResolvedValue({
    success: true,
    transcript: 'hello world',
    model: 'whisper-1',
    segments: [{ start: 0, end: 0.5, text: 'hello' }, { start: 0.5, end: 1, text: ' world' }]
  });

  const prevMD = global.navigator.mediaDevices;
  const mockStream = {
    getTracks: () => [{ stop: jest.fn() }]
  };
  const getUserMedia = jest.fn().mockResolvedValue(mockStream);
  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true
  });

  const OrigMR = global.MediaRecorder;
  function MockMediaRecorder() {
    this.mimeType = 'audio/webm';
    this.start = jest.fn(() => {
      this.ondataavailable?.({
        data: new Blob([new Uint8Array(200)], { type: 'audio/webm' })
      });
    });
    this.stop = jest.fn(() => {
      queueMicrotask(() => this.onstop?.());
    });
    this.ondataavailable = null;
    this.onstop = null;
  }
  MockMediaRecorder.isTypeSupported = () => true;
  global.MediaRecorder = MockMediaRecorder;

  const origCreateObjectURL = URL.createObjectURL;
  const origRevokeObjectURL = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => 'blob:mock-preview');
  URL.revokeObjectURL = jest.fn();

  try {
    renderModal();
    await user.click(screen.getByRole('tab', { name: /Audio → transcript/i }));
    await user.click(screen.getByRole('tab', { name: /^Record$/i }));

    await user.click(screen.getByRole('checkbox', { name: /Segment timestamps/i }));
    await user.click(screen.getByRole('button', { name: /Start recording/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Stop$/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /^Stop$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Transcribe$/i })).not.toBeDisabled();
    });

    await user.click(screen.getByRole('button', { name: /^Transcribe$/i }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalled();
    });

    const [, opts] = apiRequest.mock.calls[0];
    expect(opts.body).toBeInstanceOf(FormData);
    expect(opts.body.get('verbose')).toBe('1');

    expect(screen.getByText(/Segment timings \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/0\.00s/)).toBeInTheDocument();
  } finally {
    global.MediaRecorder = OrigMR;
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: prevMD,
      configurable: true
    });
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
  }
});
