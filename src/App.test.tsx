import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// Mock Firebase
jest.mock('./firebase', () => ({
  auth: {},
  db: {},
}));

// Mock all Firebase modules
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  onSnapshot: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
}));

test('renders app without crashing', () => {
  render(<App />);
  // App should render the login page by default
  expect(screen.getByText('Login to PlanTogether')).toBeInTheDocument();
});
