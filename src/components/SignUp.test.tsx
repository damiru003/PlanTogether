// Mock Firebase auth BEFORE any imports
jest.mock('../firebase', () => ({
  auth: {},
}));

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(),
}));

import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import SignUp from './SignUp';

test('renders sign up form', () => {
  render(
    <BrowserRouter>
      <SignUp />
    </BrowserRouter>
  );
  expect(screen.getByText('Create Account')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  expect(screen.getByText('Sign up with Google')).toBeInTheDocument();
  expect(screen.getByText('Already have an account?')).toBeInTheDocument();
});
