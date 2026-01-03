import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Dashboard from './Dashboard';

// Mock Firebase
jest.mock('../firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
  db: {},
}));

// Mock Firebase functions
jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((auth, callback) => {
    callback({ uid: 'test-user-id' });
    return jest.fn();
  }),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  onSnapshot: jest.fn((q, callback) => {
    callback({ docs: [] });
    return jest.fn();
  }),
}));

test('renders dashboard with create event button', () => {
  render(
    <BrowserRouter>
      <Dashboard />
    </BrowserRouter>
  );
  expect(screen.getByText('Your Events')).toBeInTheDocument();
  expect(screen.getByText('Create New Event')).toBeInTheDocument();
});
