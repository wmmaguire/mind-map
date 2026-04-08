import '../setupPolyfills';
import { render, screen } from '@testing-library/react';
import {
  IdentityProvider,
  IDENTITY_KIND_GUEST,
  IDENTITY_KIND_REGISTERED,
  useIdentity,
} from './IdentityContext';

function Probe() {
  const { identityKind, isRegistered, userId } = useIdentity();
  return (
    <span data-testid="probe">
      {identityKind}:{String(isRegistered)}:{userId ?? ''}
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
    `${IDENTITY_KIND_GUEST}:false:`
  );
});

test('IdentityProvider exposes registered user when initialRegisteredUserId is set', () => {
  render(
    <IdentityProvider initialRegisteredUserId="test-user-1">
      <Probe />
    </IdentityProvider>
  );
  expect(screen.getByTestId('probe')).toHaveTextContent(
    `${IDENTITY_KIND_REGISTERED}:true:test-user-1`
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
