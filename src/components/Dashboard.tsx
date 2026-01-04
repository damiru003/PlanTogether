import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { collection, query, where, onSnapshot, doc, deleteDoc, getDoc } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import Notifications from './Notifications';

const Dashboard = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [userData, setUserData] = useState<any>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'popularity' | 'name'>('date');
  const [filterCategory, setFilterCategory] = useState<'all' | 'social' | 'work' | 'celebration'>('all');
  const [eventTimeFilter, setEventTimeFilter] = useState<'all' | 'upcoming' | 'happening' | 'past'>('all');
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
          const eventsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          // Filter events based on privacy
          const filteredByPrivacy = eventsList.filter((event: any) => {
            // Admins see all events
            if (currentUserRole === 'admin') return true;
            
            // Public events visible to everyone
            if (!event.privacy || event.privacy === 'public') return true;
            
            // Private events only visible to host
            if (event.privacy === 'private' && event.hostId === auth.currentUser?.uid) return true;
            
            return false;
          });
          
          setEvents(filteredByPrivacy);
          setFilteredEvents(filteredByPrivacy);
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

  // Filter and sort events
  useEffect(() => {
    let filtered = [...events];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(event =>
        event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        event.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(event => event.category === filterCategory);
    }

    // Event time filter (past, happening, upcoming)
    if (eventTimeFilter !== 'all') {
      filtered = filtered.filter(event => {
        const status = getEventStatus(event);
        return status === eventTimeFilter;
      });
    }

    // Sorting
    if (sortBy === 'date') {
      filtered.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
    } else if (sortBy === 'popularity') {
      filtered.sort((a, b) => {
        const votesA = Object.values(a.votes || {}).reduce((acc: any, val: any) => Number(acc) + Number(val), 0) as number;
        const votesB = Object.values(b.votes || {}).reduce((acc: any, val: any) => Number(acc) + Number(val), 0) as number;
        return votesB - votesA;
      });
    } else if (sortBy === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    setFilteredEvents(filtered);
  }, [events, searchQuery, sortBy, filterCategory, eventTimeFilter]);

  const getEventCategory = (event: any): 'social' | 'work' | 'celebration' => {
    // Intelligent category detection based on keywords
    const text = `${event.name} ${event.description || ''}`.toLowerCase();
    if (text.match(/birthday|party|celebration|anniversary|wedding/)) return 'celebration';
    if (text.match(/meeting|project|work|deadline|presentation/)) return 'work';
    return 'social';
  };

  const getEventStatus = (event: any): 'upcoming' | 'happening' | 'past' => {
    const now = new Date();
    
    // Get the most voted date
    if (!event.dateOptions || event.dateOptions.length === 0) return 'upcoming';
    
    let maxVotes = 0;
    let winningDate = event.dateOptions[0];
    
    event.dateOptions.forEach((dateOption: string) => {
      const voteData = event.votes?.[dateOption];
      const voteCount = typeof voteData === 'object' ? voteData.count || 0 : voteData || 0;
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        winningDate = dateOption;
      }
    });
    
    try {
      const eventDate = new Date(winningDate);
      if (isNaN(eventDate.getTime())) return 'upcoming';
      
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const startOfEventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
      
      if (startOfEventDay < startOfToday) return 'past';
      if (startOfEventDay.getTime() === startOfToday.getTime()) return 'happening';
      return 'upcoming';
    } catch (e) {
      return 'upcoming';
    }
  };

  const getCategoryColor = (category: 'social' | 'work' | 'celebration') => {
    const colors = {
      social: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' },
      work: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
      celebration: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' }
    };
    return colors[category];
  };

  const getStatusColor = (status: 'upcoming' | 'happening' | 'past') => {
    const colors = {
      upcoming: { bg: 'bg-green-100', text: 'text-green-700', dot: 'bg-green-500' },
      happening: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
      past: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-500' }
    };
    return colors[status];
  };

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
    <div className="min-h-screen bg-gray-50 relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Geometric Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: `radial-gradient(circle, #14b8a6 1px, transparent 1px)`,
          backgroundSize: '30px 30px'
        }}></div>
        
        {/* Diagonal Lines Pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="diagonalLines" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
              <line x1="0" y1="0" x2="40" y2="40" stroke="#14b8a6" strokeWidth="1"/>
              <line x1="40" y1="0" x2="0" y2="40" stroke="#8b5cf6" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#diagonalLines)"/>
        </svg>

        {/* Hexagon Tessellation */}
        <svg className="absolute top-0 right-0 w-1/2 h-1/2 opacity-[0.05]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hexagons" x="0" y="0" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(0.8)">
              <polygon points="28,0 56,15 56,45 28,60 0,45 0,15" fill="none" stroke="#14b8a6" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hexagons)"/>
        </svg>

        {/* Gradient Mesh Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-white via-teal-50/30 to-purple-50/20"></div>
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-radial from-cyan-100/20 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-radial from-purple-100/20 to-transparent rounded-full blur-3xl"></div>

        {/* Abstract Blob Shapes with Blur */}
        <div className="absolute top-20 left-10 w-[500px] h-[500px] bg-gradient-to-br from-teal-200/10 via-cyan-200/10 to-transparent rounded-full blur-[100px] animate-blob"></div>
        <div className="absolute top-40 right-20 w-[400px] h-[400px] bg-gradient-to-br from-purple-200/10 via-pink-200/10 to-transparent rounded-full blur-[100px] animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-20 left-1/3 w-[600px] h-[600px] bg-gradient-to-br from-pink-200/8 via-purple-200/8 to-transparent rounded-full blur-[120px] animate-blob animation-delay-4000"></div>

        {/* Topographic Line Art */}
        <svg className="absolute top-1/4 left-0 w-full h-1/2 opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <path d="M0,100 Q150,120 300,100 T600,100 T900,100 T1200,100 T1500,100 T1800,100" fill="none" stroke="#14b8a6" strokeWidth="1"/>
          <path d="M0,200 Q150,220 300,200 T600,200 T900,200 T1200,200 T1500,200 T1800,200" fill="none" stroke="#14b8a6" strokeWidth="1"/>
          <path d="M0,300 Q150,320 300,300 T600,300 T900,300 T1200,300 T1500,300 T1800,300" fill="none" stroke="#8b5cf6" strokeWidth="1"/>
        </svg>

        {/* Isometric Calendar Icons */}
        <div className="absolute top-32 right-32 opacity-[0.04] animate-float">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="6" width="18" height="15" rx="2" stroke="#14b8a6" strokeWidth="1.5"/>
            <path d="M3 10h18M7 3v4M17 3v4" stroke="#14b8a6" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="absolute bottom-40 left-40 opacity-[0.05] animate-float animation-delay-2000">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke="#8b5cf6" strokeWidth="1.5"/>
            <path d="M12 6v6l4 2" stroke="#8b5cf6" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="absolute top-1/2 left-1/4 opacity-[0.04] animate-float animation-delay-4000">
          <svg width="70" height="70" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" stroke="#ec4899" strokeWidth="1.5"/>
          </svg>
        </div>

        {/* Network Nodes */}
        <svg className="absolute top-1/3 right-1/4 w-[300px] h-[300px] opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="4" fill="#14b8a6"/>
          <circle cx="150" cy="80" r="4" fill="#8b5cf6"/>
          <circle cx="250" cy="60" r="4" fill="#ec4899"/>
          <circle cx="200" cy="150" r="4" fill="#14b8a6"/>
          <line x1="50" y1="50" x2="150" y2="80" stroke="#14b8a6" strokeWidth="1" opacity="0.5"/>
          <line x1="150" y1="80" x2="250" y2="60" stroke="#8b5cf6" strokeWidth="1" opacity="0.5"/>
          <line x1="150" y1="80" x2="200" y2="150" stroke="#ec4899" strokeWidth="1" opacity="0.5"/>
        </svg>

        {/* Minimalist Confetti */}
        <div className="absolute top-20 left-1/3 w-2 h-2 bg-teal-400 rounded-full opacity-[0.15] animate-float"></div>
        <div className="absolute top-40 right-1/4 w-3 h-3 bg-purple-400 rounded-full opacity-[0.12] animate-float animation-delay-1000"></div>
        <div className="absolute bottom-32 left-1/2 w-2 h-2 bg-pink-400 rounded-full opacity-[0.15] animate-float animation-delay-3000"></div>
        <div className="absolute top-1/2 right-1/3 opacity-[0.1] animate-float animation-delay-2000">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#14b8a6" xmlns="http://www.w3.org/2000/svg">
            <polygon points="12,2 15,9 22,9 17,14 19,22 12,17 5,22 7,14 2,9 9,9"/>
          </svg>
        </div>
        <div className="absolute bottom-1/4 right-1/2 opacity-[0.08] animate-float animation-delay-4000">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#8b5cf6" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>

        {/* Animated Particles */}
        <div className="absolute top-10 left-1/4 w-1 h-1 bg-teal-400/40 rounded-full animate-particle"></div>
        <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-purple-400/40 rounded-full animate-particle animation-delay-2000"></div>
        <div className="absolute bottom-1/3 left-1/2 w-1 h-1 bg-pink-400/40 rounded-full animate-particle animation-delay-4000"></div>
        <div className="absolute top-2/3 right-1/4 w-1 h-1 bg-cyan-400/40 rounded-full animate-particle animation-delay-1000"></div>
        <div className="absolute bottom-1/2 left-1/3 w-1 h-1 bg-teal-400/40 rounded-full animate-particle animation-delay-3000"></div>

        {/* Watercolor Wash Effects */}
        <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-gradient-to-br from-teal-100/15 via-cyan-50/10 to-transparent rounded-full blur-[150px]"></div>
        <div className="absolute bottom-0 right-0 w-[700px] h-[700px] bg-gradient-to-tl from-purple-100/15 via-pink-50/10 to-transparent rounded-full blur-[150px]"></div>

        {/* Paper Texture Overlay */}
        <div className="absolute inset-0 opacity-[0.02] mix-blend-multiply" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' /%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px'
        }}></div>
      </div>

      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-sm shadow-sm border-b border-gray-100 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            {/* Logo and Brand */}
            <div className="flex items-center gap-3">
              <div className="text-teal-500 p-2">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-500 to-purple-600 bg-clip-text text-transparent">
                PlanTogether
              </h1>
            </div>

            {/* Center Greeting with Avatar */}
            <div className="hidden md:flex items-center gap-4">
              {/* User Avatar */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-purple-500 flex items-center justify-center text-white font-bold text-lg shadow-md ring-2 ring-white">
                  {userData?.name?.charAt(0).toUpperCase() || auth.currentUser?.email?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-gray-900 font-bold text-base">
                    {userData?.name || auth.currentUser?.email?.split('@')[0]}
                  </p>
                  {userData?.role && (
                    <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                      userData.role === 'admin' 
                        ? 'bg-purple-100 text-purple-700' 
                        : 'bg-teal-100 text-teal-700'
                    }`}>
                      {userData.role.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Date & Time Display */}
            <div className="hidden lg:flex items-center gap-6 text-lg">
              <div className="flex items-center gap-2 text-gray-800">
                <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="font-bold">
                  {currentDateTime.toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2 text-gray-800">
                <svg className="w-4 h-4 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-bold">
                  {currentDateTime.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>

            {/* Right Side - Notifications and Logout */}
            <div className="flex items-center gap-4">
              {/* Notifications */}
              <Notifications />

              {/* Logout Button */}
              <button
              onClick={handleLogout}
              className="px-5 py-2 text-gray-600  hover:text-gray-900 font-medium border border-gray-300 rounded-lg hover:border-gray-400 hover:shadow-md transition-all duration-200 flex items-center gap-2 group text-xl"
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
      </div>
      </header>

      {/* Main Content with top padding for fixed header */}
      <main className="max-w-7xl mx-auto px-6 pt-28 pb-12 relative z-10">
        {/* Event Time Filter Tabs with Search and Sort */}
        <div className="mb-6 flex flex-col lg:flex-row gap-4 items-stretch">
          {/* Filter Tabs */}
          <div className="flex gap-3 overflow-x-auto pb-2 lg:pb-0">
            <button
              onClick={() => setEventTimeFilter('all')}
              className={`px-6 py-3 rounded-xl font-bold text-xl transition-all whitespace-nowrap ${
                eventTimeFilter === 'all'
                  ? 'bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-teal-300'
              }`}
            >
              All Events
            </button>
            <button
              onClick={() => setEventTimeFilter('upcoming')}
              className={`px-6 py-3 rounded-xl font-bold text-xl transition-all whitespace-nowrap flex items-center gap-2 ${
                eventTimeFilter === 'upcoming'
                  ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-green-300'
              }`}
            >
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
              Upcoming
            </button>
            <button
              onClick={() => setEventTimeFilter('happening')}
              className={`px-6 py-3 rounded-xl font-bold text-xl transition-all whitespace-nowrap flex items-center gap-2 ${
                eventTimeFilter === 'happening'
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300'
              }`}
            >
              <span className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></span>
              Happening Now
            </button>
            <button
              onClick={() => setEventTimeFilter('past')}
              className={`px-6 py-3 rounded-xl font-bold text-xl transition-all whitespace-nowrap ${
                eventTimeFilter === 'past'
                  ? 'bg-gradient-to-r from-gray-500 to-slate-500 text-white shadow-lg'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
              }`}
            >
              Past Events
            </button>
          </div>

          {/* Search Bar */}
          <div className="flex-1 relative min-w-[300px]">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events..."
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-base bg-white"
            />
          </div>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-base font-medium bg-white cursor-pointer min-w-[180px]"
          >
            <option value="date">Sort by Date</option>
            <option value="popularity">Sort by Votes</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>

        {/* Page Title and Create Button */}
        <div className="flex items-start justify-between mb-10 gap-6">
          <div>
            <h2 className="text-5xl font-bold text-gray-900 mb-3" style={{ color: '#1f2937' }}>
              {userData?.role === 'admin' ? 'Your Events' : 'Available Events'}
            </h2>
            <div className="w-20 h-1 bg-gradient-to-r from-teal-500 to-teal-400 rounded-full mb-4"></div>
            <p className="text-gray-500 text-xl">
              {userData?.role === 'admin' 
                ? 'Manage and track all your planning activities' 
                : 'View and participate in events'}
            </p>
          </div>

          {/* Create Button - Only for admins */}
          {userData?.role === 'admin' && (
            <Link
              to="/create-event"
              className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-purple-500 text-xl text-white font-semibold px-8 py-4 rounded-full hover:from-purple-700 hover:to-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transform transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98] shadow-lg whitespace-nowrap"
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-2xl shadow-md border border-gray-100 p-8 animate-pulse">
                <div className="flex justify-between items-start mb-6">
                  <div className="h-8 bg-gray-200 rounded w-2/3"></div>
                  <div className="h-8 w-8 bg-gray-200 rounded-lg"></div>
                </div>
                <div className="space-y-3 mb-6">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                </div>
                <div className="h-16 bg-gray-100 rounded-lg mb-4"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredEvents.length === 0 ? (
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
              {searchQuery || filterCategory !== 'all' ? 'No events found' : (userData?.role === 'admin' ? 'No events yet' : 'No events available')}
            </h3>
            <p className="text-gray-500 text-lg mb-8 max-w-md mx-auto">
              {searchQuery || filterCategory !== 'all' 
                ? 'Try adjusting your search or filters to find what you\'re looking for' 
                : (userData?.role === 'admin' 
                  ? 'Start planning by creating your first event and collaborate with your team' 
                  : 'No events have been created yet. Check back later!')}
            </p>
            {userData?.role === 'admin' && !searchQuery && filterCategory === 'all' && (
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredEvents.map(event => {
              const totalVotes = Object.values(event.votes || {}).reduce((a: any, b: any) => {
                const aVal = typeof a === 'object' ? a.count || 0 : Number(a) || 0;
                const bVal = typeof b === 'object' ? b.count || 0 : Number(b) || 0;
                return aVal + bVal;
              }, 0) as number;
              const dateOptionsCount = event.dateOptions?.length || 0;
              const participantsCount = event.participants?.length || 0;
              const commentsCount = event.comments?.length || 0;
              
              // Get category and status
              const category = event.category || getEventCategory(event);
              const status = getEventStatus(event);
              const categoryColors = getCategoryColor(category);
              const statusColors = getStatusColor(status);
              
              // Get the most voted date option (winning date)
              const getMostVotedDate = () => {
                if (!event.dateOptions || event.dateOptions.length === 0) return null;
                
                let maxVotes = 0;
                let winningDate = event.dateOptions[0];
                
                event.dateOptions.forEach((dateOption: string) => {
                  const voteData = event.votes?.[dateOption];
                  const voteCount = typeof voteData === 'object' ? voteData.count || 0 : voteData || 0;
                  if (voteCount > maxVotes) {
                    maxVotes = voteCount;
                    winningDate = dateOption;
                  }
                });
                
                return { date: winningDate, votes: maxVotes };
              };
              
              const mostVoted = getMostVotedDate();
              
              // Format the winning date for display
              const formatEventDate = (dateStr: string) => {
                try {
                  // Try to parse the date string
                  const date = new Date(dateStr);
                  if (!isNaN(date.getTime())) {
                    return {
                      date: date.toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        year: 'numeric',
                        weekday: 'short'
                      }),
                      time: date.toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit'
                      })
                    };
                  }
                } catch (e) {
                  // If parsing fails, return the original string
                }
                return { date: dateStr, time: null };
              };
              
              const formattedEventDate = mostVoted ? formatEventDate(mostVoted.date) : null;

              return (
                <div key={event.id} className="group">
                  <Link
                    to={`/event/${event.id}`}
                    className="block bg-white rounded-2xl shadow-md hover:shadow-2xl border-2 border-gray-100 hover:border-teal-200 transition-all duration-300 overflow-hidden transform hover:-translate-y-2 hover:scale-[1.02]"
                    style={{
                      borderLeftWidth: '6px',
                      borderLeftColor: category === 'social' ? '#3b82f6' : category === 'work' ? '#8b5cf6' : '#ec4899'
                    }}
                  >
                    {/* Card Header with Gradient Overlay */}
                    <div className="relative p-8 pb-6 bg-gradient-to-br from-teal-50/50 via-white to-purple-50/30">
                      {/* Status & Category Badges */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex gap-2">
                          <span className={`px-3 py-1.5 text-xs font-bold rounded-full ${statusColors.bg} ${statusColors.text} flex items-center gap-1.5`}>
                            <span className={`w-2 h-2 rounded-full ${statusColors.dot} animate-pulse`}></span>
                            {status.toUpperCase()}
                          </span>
                          <span className={`px-3 py-1.5 text-xs font-bold rounded-full ${categoryColors.bg} ${categoryColors.text}`}>
                            {category.toUpperCase()}
                          </span>
                        </div>
                        
                        {/* Calendar Icon */}
                        <div className="bg-gradient-to-br from-teal-500 to-purple-500 p-2.5 rounded-xl shadow-lg">
                          <svg className="w-6 h-6 text-white" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      </div>

                      {/* Title with Privacy Badge */}
                      <div className="flex items-start gap-3 mb-4">
                        <h3 className="flex-1 text-4xl font-bold text-gray-900 group-hover:text-teal-600 transition-colors leading-tight">
                          {event.name}
                        </h3>
                        {event.privacy === 'private' && (
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 border border-orange-300 rounded-lg">
                            <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                            <span className="text-xs font-bold text-orange-700">Private</span>
                          </div>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-gray-600 text-lg mb-6 line-clamp-2 leading-relaxed">
                        {event.description || 'No description provided'}
                      </p>

                      {/* Event Date & Time - Highlighted with Winner Badge */}
                      {formattedEventDate && mostVoted ? (
                        <div className="mb-6 p-5 bg-gradient-to-r from-purple-100 via-pink-100 to-purple-100 rounded-xl border-2 border-purple-300 shadow-lg relative overflow-hidden">
                          <div className="absolute top-0 right-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-1 text-xs font-bold rounded-bl-xl flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            {mostVoted.votes > 0 ? `${mostVoted.votes} votes` : 'Top Choice'}
                          </div>
                          <div className="pr-20">
                            <p className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2">Event Date</p>
                            <div className="flex items-center gap-3 mb-2">
                              <svg className="w-7 h-7 text-purple-700" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="font-extrabold text-gray-900 text-xl">{formattedEventDate.date}</span>
                            </div>
                            {formattedEventDate.time && (
                              <div className="flex items-center gap-3">
                                <svg className="w-7 h-7 text-purple-700" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="font-extrabold text-gray-900 text-xl">{formattedEventDate.time}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="mb-6 p-5 bg-gradient-to-r from-gray-100 to-gray-200 rounded-xl border-2 border-gray-300 shadow-sm">
                          <div className="flex items-center gap-3 text-gray-600">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-bold text-base">No date options available</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Bar with Vote Progress */}
                    <div className="bg-gradient-to-r from-teal-100 to-cyan-100 px-8 py-5 border-t-2 border-teal-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <svg className="w-6 h-6 text-teal-700" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                        </svg>
                        <div>
                          <span className="text-sm font-bold text-gray-700 block">Total Votes</span>
                          <span className="text-2xl font-bold text-teal-700">{totalVotes > 0 ? String(totalVotes) : 'No votes yet'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-purple-600 font-bold text-base group-hover:gap-3 transition-all">
                        <span>View Event</span>
                        <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </div>
                    </div>
                  </Link>

                  {/* Delete Button - Only for admins */}
                  {userData?.role === 'admin' && (
                    <button
                      onClick={(e) => handleDeleteEvent(event.id, event.name, e)}
                      className="mt-4 w-full px-5 py-3 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 border-2 border-red-200 hover:border-red-600 hover:shadow-lg transform hover:scale-[1.02]"
                      title="Delete event"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
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
        @keyframes blob {
          0%, 100% {
            transform: translate(0px, 0px) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        @keyframes particle {
          0% {
            transform: translateY(0px) translateX(0px);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateY(-100px) translateX(20px);
            opacity: 0;
          }
        }
        .animate-blob {
          animation: blob 20s infinite;
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        .animate-particle {
          animation: particle 8s ease-in-out infinite;
        }
        .animation-delay-1000 {
          animation-delay: 1s;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-3000 {
          animation-delay: 3s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        .bg-gradient-radial {
          background: radial-gradient(circle, var(--tw-gradient-stops));
        }
      `}</style>
    </div>
  );
};

export default Dashboard;