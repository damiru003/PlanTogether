import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import CreateEvent from './CreateEvent';

// Mock Firebase
jest.mock('../firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  addDoc: jest.fn(),
  collection: jest.fn(),
}));

test('renders create event form', () => {
  render(
    <BrowserRouter>
      <CreateEvent />
    </BrowserRouter>
  );
  expect(screen.getByText('Create Event')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Event Name')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Description')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Date Options (comma-separated)')).toBeInTheDocument();
});
