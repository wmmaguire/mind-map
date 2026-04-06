import '../setupPolyfills';
import { render, screen } from '@testing-library/react';
import {
  IdentityProvider,
  IDENTITY_KIND_GUEST,
  useIdentity,
} from './IdentityContext';

function Probe() {
  const { identityKind, isRegistered } = useIdentity();
  return (
    <span data-testid="probe">
      {identityKind}:{String(isRegistered)}
    </span>
  );
}

test('IdentityProvider exposes guest identity', () => {
  render(
    <IdentityProvider>
      <Probe />
    </IdentityProvider>
  );
  expect(screen.getByTestId('probe')).toHaveTextContent(
    `${IDENTITY_KIND_GUEST}:false`
  );
});

test('useIdentity throws outside IdentityProvider', () => {
  const err = console.error;
  console.error = jest.fn();
  expect(() => {
    render(<Probe />);
  }).toThrow(/useIdentity must be used within IdentityProvider/);
  console.error = err;
});
