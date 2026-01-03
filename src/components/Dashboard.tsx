import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';

const Dashboard = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [userData, setUserData] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const initializeDashboard = async () => {
      onAuthStateChanged(auth, async (user) => {
        if (!user) {
          navigate('/');
        } else {
          // Fetch user data from Firestore
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserData(userDoc.data());
          }
        }
      });

      // Both admins and users see all events
      let q;
      if (auth.currentUser) {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const userSnapshot = await getDoc(userDocRef);
        const currentUserRole = userSnapshot.data()?.role;
        
        // Both roles see all events
        q = query(collection(db, 'events'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          setLoading(false);
        });

        // Update current date/time every minute
        const timeInterval = setInterval(() => {
          setCurrentDateTime(new Date());
        }, 60000);

        return () => {
          unsubscribe();
          clearInterval(timeInterval);
        };
      }
    };

    initializeDashboard();
  }, [navigate]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/');
  };

  const handleDeleteEvent = async (eventId: string, eventName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only admins can delete events
    if (userData?.role !== 'admin') {
      alert('Only admins can delete events');
      return;
    }
    
    // Show confirmation modal
    setEventToDelete({ id: eventId, name: eventName });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!eventToDelete) return;
    
    try {
      await deleteDoc(doc(db, 'events', eventToDelete.id));
      setShowDeleteModal(false);
      setEventToDelete(null);
      
      // Show success message
      setShowSuccessMessage(true);
      setTimeout(() => {
        setShowSuccessMessage(false);
      }, 3000);
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Failed to delete event. Please try again.');
    }
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setEventToDelete(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 bg-white shadow-sm border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            {/* Logo and Brand */}
            <div className="flex items-center gap-3">
              <div className="text-teal-500 p-2">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-500 to-purple-600 bg-clip-text text-transparent">
                PlanTogether
              </h1>
            </div>

            {/* Center Greeting */}
            <div className="hidden md:block">
              <div className="flex items-center gap-2">
                <p className="text-gray-500 font-medium">
                  Welcome back, {userData?.name || auth.currentUser?.email?.split('@')[0]}
                </p>
                {userData?.role && (
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    userData.role === 'admin' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'bg-teal-100 text-teal-700'
                  }`}>
                    {userData.role}
                  </span>
                )}
              </div>
            </div>

            {/* Date & Time Display */}
            <div className="hidden lg:flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="font-medium">
                  {currentDateTime.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium">
                  {currentDateTime.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="px-5 py-2 text-gray-600 hover:text-gray-900 font-medium border border-gray-300 rounded-lg hover:border-gray-400 hover:shadow-md transition-all duration-200 flex items-center gap-2 group"
              style={{ transition: 'all 0.2s ease, box-shadow 0.3s ease' }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 0 20px rgba(20, 184, 166, 0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = ''}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content with top padding for fixed header */}
      <main className="max-w-5xl mx-auto px-6 pt-28 pb-12">
        {/* Page Title and Create Button */}
        <div className="flex items-start justify-between mb-10 gap-6">
          <div>
            <h2 className="text-5xl font-bold text-gray-900 mb-3" style={{ color: '#1f2937' }}>
              {userData?.role === 'admin' ? 'Your Events' : 'Available Events'}
            </h2>
            <div className="w-20 h-1 bg-gradient-to-r from-teal-500 to-teal-400 rounded-full mb-4"></div>
            <p className="text-gray-500 text-lg">
              {userData?.role === 'admin' 
                ? 'Manage and track all your planning activities' 
                : 'View and participate in events'}
            </p>
          </div>

          {/* Create Button - Only for admins */}
          {userData?.role === 'admin' && (
            <Link
              to="/create-event"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-purple-500 text-white font-semibold px-8 py-4 rounded-full hover:from-purple-700 hover:to-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transform transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98] shadow-lg whitespace-nowrap"
              style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Create New Event
            </Link>
          )}
        </div>

        {/* Events Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-24">
            <svg className="animate-spin h-12 w-12 text-teal-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-24 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="inline-flex items-center justify-center mb-6">
              <svg className="w-24 h-24 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <svg className="w-20 h-20 text-gray-200 -ml-10 -mt-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              {userData?.role === 'admin' ? 'No events yet' : 'No events available'}
            </h3>
            <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto">
              {userData?.role === 'admin' 
                ? 'Start planning by creating your first event and collaborate with your team' 
                : 'No events have been created yet. Check back later!'}
            </p>
            {userData?.role === 'admin' && (
              <Link
                to="/create-event"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-purple-500 text-white font-semibold px-8 py-4 rounded-full hover:from-purple-700 hover:to-purple-600 transform transition-all duration-200 hover:scale-[1.02] shadow-lg hover:shadow-xl"
                style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)' }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Create Your First Event
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map(event => {
              const totalVotes = Object.values(event.votes || {}).reduce((a: any, b: any) => Number(a) + Number(b), 0);
              const dateOptionsCount = event.dateOptions?.length || 0;
              const participantsCount = event.participants?.length || 0;
              const commentsCount = event.comments?.length || 0;
              
              // Format event creation date/time
              const eventDate = event.createdAt?.toDate?.() || new Date();
              const formattedDate = eventDate.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              });
              const formattedTime = eventDate.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit'
              });

              return (
                <div key={event.id} className="group">
                  <Link
                    to={`/event/${event.id}`}
                    className="block bg-white rounded-2xl shadow-md hover:shadow-2xl border border-gray-100 hover:border-gray-200 transition-all duration-300 overflow-hidden transform hover:-translate-y-1"
                  >
                    {/* Card Header */}
                    <div className="p-6 pb-4 relative">
                      {/* Calendar Badge */}
                      <div className="absolute top-4 right-4 bg-gradient-to-br from-teal-100 to-purple-100 p-2 rounded-lg">
                        <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>

                      {/* Title */}
                      <h3 className="text-2xl font-bold text-gray-900 mb-3 pr-12 group-hover:text-teal-600 transition-colors">
                        {event.name}
                      </h3>

                      {/* Description */}
                      <p className="text-gray-500 text-sm mb-6 line-clamp-2">
                        {event.description || 'No description'}
                      </p>

                      {/* Date & Time Created */}
                      <div className="mb-4 p-3 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-lg border border-teal-100">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2 text-sm">
                            <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-semibold text-gray-700">{formattedDate}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-semibold text-gray-700">{formattedTime}</span>
                          </div>
                        </div>
                      </div>

                      {/* Stats Row */}
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2.5 text-sm text-gray-600">
                          <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="font-medium">{dateOptionsCount} date options</span>
                        </div>
                        <div className="flex items-center gap-2.5 text-sm text-gray-600">
                          <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <span className="font-medium">{participantsCount} participants</span>
                        </div>
                        <div className="flex items-center gap-2.5 text-sm text-gray-600">
                          <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                          </svg>
                          <span className="font-medium">{commentsCount} comments</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Bar */}
                    <div className="bg-gradient-to-r from-teal-50 to-cyan-50 px-6 py-4 border-t border-teal-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-900">Total Votes:</span>
                        <span className="text-lg font-bold text-teal-600">{String(totalVotes)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-purple-600 font-semibold text-sm group-hover:gap-2.5 transition-all">
                        <span>View Details</span>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </div>
                    </div>
                  </Link>

                  {/* Delete Button - Only for admins */}
                  {userData?.role === 'admin' && (
                    <button
                      onClick={(e) => handleDeleteEvent(event.id, event.name, e)}
                      className="mt-3 w-full px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 border border-red-200 hover:border-red-300"
                      title="Delete event"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Delete Event
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Success Message */}
      {showSuccessMessage && (
        <div className="fixed top-4 right-4 z-50">
          <div 
            className="bg-green-500 text-white px-6 py-4 rounded-lg shadow-2xl flex items-center gap-3 transform transition-all duration-300 ease-out"
            style={{ animation: 'slideInRight 0.3s ease-out' }}
          >
            <div className="flex-shrink-0">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold">Event Deleted Successfully!</p>
              <p className="text-sm text-green-100">The event has been removed from your dashboard.</p>
            </div>
            <button 
              onClick={() => setShowSuccessMessage(false)}
              className="ml-4 text-green-100 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity duration-300 ease-out"
            onClick={cancelDelete}
            style={{ animation: 'fadeIn 0.3s ease-out' }}
          ></div>

          {/* Modal */}
          <div className="flex min-h-screen items-center justify-center p-4">
            <div 
              className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 transform transition-all duration-300 ease-out"
              style={{ animation: 'slideIn 0.3s ease-out' }}
            >
              {/* Icon */}
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              {/* Content */}
              <div className="text-center">
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Delete Event
                </h3>
                <p className="text-gray-600 mb-6">
                  Are you sure you want to delete <span className="font-semibold text-gray-900">"{eventToDelete?.name}"</span>? This action cannot be undone.
                </p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={cancelDelete}
                  className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg transition-all duration-200 hover:shadow-md"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all duration-200 hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { 
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to { 
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes slideInRight {
          from { 
            opacity: 0;
            transform: translateX(100px);
          }
          to { 
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
};

export default Dashboard;