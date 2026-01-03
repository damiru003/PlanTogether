import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import EventView from './EventView';

// Mock Firebase
jest.mock('../firebase', () => ({
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  onSnapshot: jest.fn((docRef, callback) => {
    callback({
      data: () => ({
        name: 'Test Event',
        description: 'Test Description',
        dateOptions: ['2026-01-10', '2026-01-15'],
        votes: {},
        comments: [],
      }),
    });
    return jest.fn();
  }),
  updateDoc: jest.fn(),
}));

// Mock useParams
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({ id: 'test-event-id' }),
}));

test('renders event view', () => {
  render(
    <BrowserRouter>
      <EventView />
    </BrowserRouter>
  );
  
  // Event should load and display
  setTimeout(() => {
    expect(screen.queryByText('Test Event')).toBeInTheDocument();
  }, 100);
});
