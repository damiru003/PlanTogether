import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell, LabelList } from 'recharts';

const EventView = () => {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<any>(null);
  const [vote, setVote] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [voteAnimation, setVoteAnimation] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<'going' | 'not-going' | 'maybe' | null>(null);
  const [itemVotes, setItemVotes] = useState<string[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    description: '',
    location: ''
  });
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch current user data
    const fetchUserData = async () => {
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }
      }
    };
    fetchUserData();

    if (id) {
      const eventDoc = doc(db, 'events', id);
      const unsubscribe = onSnapshot(eventDoc, (snap) => {
        if (snap.exists()) {
          setEvent({ id: snap.id, ...snap.data() });
          setLoading(false);
        }
      });
      return () => unsubscribe();
    }
  }, [id]);

  const handleVote = async () => {
    if (!vote) return;
    
    setVoteAnimation(true);
    setTimeout(() => setVoteAnimation(false), 1000);
    
    const userName = userData?.name || auth.currentUser?.email || 'Anonymous';
    const userId = auth.currentUser?.uid || 'anonymous';
    
    // Handle both old (number) and new (object) vote formats
    const newVotes = { ...event.votes };
    
    // Convert old format to new format if needed
    if (!newVotes[vote]) {
      newVotes[vote] = { count: 0, voters: [] };
    } else if (typeof newVotes[vote] === 'number') {
      // Migrate old format to new format
      newVotes[vote] = { count: newVotes[vote], voters: [] };
    }
    
    // Check if user already voted for this option
    const hasVoted = newVotes[vote].voters?.some((v: any) => v.id === userId);
    if (hasVoted) {
      alert('You have already voted for this option!');
      setVoteAnimation(false);
      return;
    }
    
    newVotes[vote].count = (newVotes[vote].count || 0) + 1;
    newVotes[vote].voters = [...(newVotes[vote].voters || []), { id: userId, name: userName }];
    
    await updateDoc(doc(db, 'events', id!), { votes: newVotes });
    setVote('');
  };

  const handleRemoveVote = async () => {
    if (!vote) return;
    
    const userId = auth.currentUser?.uid || 'anonymous';
    const newVotes = { ...event.votes };
    
    // Check if this vote option exists and has the new format
    if (!newVotes[vote] || typeof newVotes[vote] === 'number') {
      alert('Unable to remove vote from this option');
      return;
    }
    
    // Check if user has voted for this option
    const hasVoted = newVotes[vote].voters?.some((v: any) => v.id === userId);
    if (!hasVoted) {
      alert('You have not voted for this option');
      return;
    }
    
    // Remove user from voters list
    newVotes[vote].voters = newVotes[vote].voters.filter((v: any) => v.id !== userId);
    newVotes[vote].count = Math.max(0, (newVotes[vote].count || 0) - 1);
    
    await updateDoc(doc(db, 'events', id!), { votes: newVotes });
    setVote('');
  };

  // Handle RSVP
  const handleRSVP = async (status: 'going' | 'not-going' | 'maybe') => {
    if (!isRSVPAllowed()) return;
    
    const userId = auth.currentUser?.uid || 'anonymous';
    const userName = userData?.name || auth.currentUser?.email || 'Anonymous';
    
    const currentRSVPs = event.rsvps || [];
    const existingRSVPIndex = currentRSVPs.findIndex((r: any) => r.userId === userId);
    
    let newRSVPs;
    if (existingRSVPIndex !== -1) {
      // Update existing RSVP
      newRSVPs = [...currentRSVPs];
      newRSVPs[existingRSVPIndex] = { userId, name: userName, status, timestamp: new Date().toISOString() };
    } else {
      // Add new RSVP
      newRSVPs = [...currentRSVPs, { userId, name: userName, status, timestamp: new Date().toISOString() }];
    }
    
    await updateDoc(doc(db, 'events', id!), { rsvps: newRSVPs });
    setRsvpStatus(status);
  };

  // Handle Item Voting
  const handleItemVote = async (item: string) => {
    const userId = auth.currentUser?.uid || 'anonymous';
    const userName = userData?.name || auth.currentUser?.email || 'Anonymous';
    
    const itemVotesData = event.itemVotes || {};
    
    if (!itemVotesData[item]) {
      itemVotesData[item] = { count: 0, voters: [] };
    }
    
    const hasVoted = itemVotesData[item].voters?.some((v: any) => v.id === userId);
    
    if (hasVoted) {
      // Remove vote
      itemVotesData[item].voters = itemVotesData[item].voters.filter((v: any) => v.id !== userId);
      itemVotesData[item].count = Math.max(0, (itemVotesData[item].count || 0) - 1);
      setItemVotes(itemVotes.filter(i => i !== item));
    } else {
      // Add vote
      itemVotesData[item].count = (itemVotesData[item].count || 0) + 1;
      itemVotesData[item].voters = [...(itemVotesData[item].voters || []), { id: userId, name: userName }];
      setItemVotes([...itemVotes, item]);
    }
    
    await updateDoc(doc(db, 'events', id!), { itemVotes: itemVotesData });
  };

  // Check if RSVP is allowed (6 hours before event)
  const isRSVPAllowed = () => {
    if (!event?.dateOptions || event.dateOptions.length === 0) return true;
    
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
      if (isNaN(eventDate.getTime())) return true;
      
      const now = new Date();
      const rsvpDeadline = new Date(eventDate.getTime() - (6 * 60 * 60 * 1000));
      
      return now < rsvpDeadline;
    } catch (e) {
      return true;
    }
  };

  // Get user's current RSVP status
  const getUserRSVP = () => {
    if (!event?.rsvps) return null;
    const userId = auth.currentUser?.uid || 'anonymous';
    const rsvp = event.rsvps.find((r: any) => r.userId === userId);
    return rsvp?.status || null;
  };

  // Get RSVP counts
  const getRSVPCounts = () => {
    if (!event?.rsvps) return { going: 0, maybe: 0, notGoing: 0 };
    return {
      going: event.rsvps.filter((r: any) => r.status === 'going').length,
      maybe: event.rsvps.filter((r: any) => r.status === 'maybe').length,
      notGoing: event.rsvps.filter((r: any) => r.status === 'not-going').length
    };
  };

  // Load user's RSVP and item votes
  useEffect(() => {
    if (event && auth.currentUser) {
      const userId = auth.currentUser.uid;
      
      // Load RSVP status
      const userRSVP = getUserRSVP();
      setRsvpStatus(userRSVP);
      
      // Load item votes
      if (event.itemVotes) {
        const votedItems: string[] = [];
        Object.keys(event.itemVotes).forEach(item => {
          if (event.itemVotes[item].voters?.some((v: any) => v.id === userId)) {
            votedItems.push(item);
          }
        });
        setItemVotes(votedItems);
      }
    }
  }, [event]);

  // Check if user has already voted for the selected option
  const hasUserVoted = () => {
    if (!vote || !event?.votes || !event.votes[vote]) return false;
    const userId = auth.currentUser?.uid || 'anonymous';
    const voteData = event.votes[vote];
    if (typeof voteData === 'object' && voteData.voters) {
      return voteData.voters.some((v: any) => v.id === userId);
    }
    return false;
  };

  // Check if voting is still allowed (before event happens)
  const isVotingAllowed = () => {
    if (!event?.dateOptions || event.dateOptions.length === 0) return true;
    
    // Get the most voted (winning) date
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
      if (isNaN(eventDate.getTime())) return true; // If date is invalid, allow voting
      
      const now = new Date();
      // Voting closes 1 hour before the event starts
      const votingDeadline = new Date(eventDate.getTime() - (1 * 60 * 60 * 1000));
      
      return now < votingDeadline;
    } catch (e) {
      return true; // If there's an error parsing, allow voting
    }
  };

  // Get voting deadline message
  const getVotingDeadlineMessage = () => {
    if (!event?.dateOptions || event.dateOptions.length === 0) return null;
    
    // Get the most voted (winning) date
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
      if (isNaN(eventDate.getTime())) return null;
      
      const now = new Date();
      const votingDeadline = new Date(eventDate.getTime() - (1 * 60 * 60 * 1000));
      
      if (now >= eventDate) {
        return { type: 'past', message: '⏰ This event has already happened. Voting is closed.' };
      } else if (now >= votingDeadline) {
        return { type: 'closed', message: '⏰ Voting is closed. The event is happening soon!' };
      } else {
        const hoursLeft = Math.floor((votingDeadline.getTime() - now.getTime()) / (1000 * 60 * 60));
        const daysLeft = Math.floor(hoursLeft / 24);
        
        if (daysLeft > 0) {
          return { type: 'open', message: `⏳ Voting closes in ${daysLeft} day${daysLeft > 1 ? 's' : ''} (1 hour before event)` };
        } else if (hoursLeft > 0) {
          return { type: 'open', message: `⏳ Voting closes in ${hoursLeft} hour${hoursLeft > 1 ? 's' : ''} (1 hour before event)` };
        } else {
          const minutesLeft = Math.floor((votingDeadline.getTime() - now.getTime()) / (1000 * 60));
          return { type: 'urgent', message: `⚠️ Voting closes in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}!` };
        }
      }
    } catch (e) {
      return null;
    }
  };

  const handleComment = async () => {
    if (!comment.trim()) return;
    const newComment = {
      text: comment,
      author: userData?.name || auth.currentUser?.email || 'Anonymous',
      timestamp: new Date().toISOString(),
    };
    await updateDoc(doc(db, 'events', id!), { 
      comments: [...(event.comments || []), newComment] 
    });
    setComment('');
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteEvent = async () => {
    // Only admins or event host can delete
    if (userData?.role !== 'admin' && event?.hostId !== auth.currentUser?.uid) {
      alert('Only admins or the event host can delete events');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete "${event?.name}"? This action cannot be undone.`)) {
      try {
        await deleteDoc(doc(db, 'events', id!));
        navigate('/dashboard');
      } catch (error) {
        console.error('Error deleting event:', error);
        alert('Failed to delete event. Please try again.');
      }
    }
  };

  const handleEditEvent = () => {
    if (!event) return;
    setEditFormData({
      name: event.name || '',
      description: event.description || '',
      location: event.location || ''
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editFormData.name.trim()) {
      alert('Event name is required');
      return;
    }

    try {
      await updateDoc(doc(db, 'events', id!), {
        name: editFormData.name,
        description: editFormData.description,
        location: editFormData.location
      });
      setShowEditModal(false);
    } catch (error) {
      console.error('Error updating event:', error);
      alert('Failed to update event. Please try again.');
    }
  };

  const chartData = event?.dateOptions?.map((opt: string) => ({ 
    name: opt, 
    votes: event.votes[opt]?.count || event.votes[opt] || 0 
  })) || [];

  const COLORS = ['#14b8a6', '#06b6d4', '#0891b2', '#0e7490', '#0d9488'];

  // Helper functions
  const getEventCategory = (event: any): string => {
    const text = `${event?.name} ${event?.description || ''}`.toLowerCase();
    if (text.match(/birthday|party|celebration|anniversary|wedding/)) return 'Celebration';
    if (text.match(/meeting|project|work|deadline|presentation/)) return 'Work';
    return 'Social';
  };

  const getEventStatus = () => {
    const totalVotes = Object.values(event?.votes || {}).reduce((a: any, b: any) => {
      const bCount = typeof b === 'object' ? b.count : b;
      return Number(a) + Number(bCount || 0);
    }, 0) as number;
    if (totalVotes === 0) return { label: 'Pending', color: 'yellow' };
    if (totalVotes >= 5) return { label: 'Active', color: 'green' };
    return { label: 'Open', color: 'blue' };
  };

  const getParticipationRate = () => {
    const totalVotes = Object.values(event?.votes || {}).reduce((a: any, b: any) => {
      const bCount = typeof b === 'object' ? b.count : b;
      return Number(a) + Number(bCount || 0);
    }, 0) as number;
    const dateOptions = event?.dateOptions?.length || 1;
    return Math.min(Math.round((Number(totalVotes) / (dateOptions * 5)) * 100), 100);
  };

  const shareOnPlatform = (platform: string) => {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`Check out this event: ${event?.name}`);
    
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${text}%20${url}`,
      email: `mailto:?subject=${encodeURIComponent(event?.name || 'Event')}&body=${text}%20${url}`,
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`
    };
    
    if (urls[platform]) {
      window.open(urls[platform], '_blank');
    }
  };

  // Generate .ics calendar file
  const downloadCalendarFile = () => {
    if (!event) return;
    
    // Get the winning date
    let winningDate = '';
    if (event.dateOptions && event.dateOptions.length > 0) {
      let maxVotes = 0;
      winningDate = event.dateOptions[0];
      
      event.dateOptions.forEach((dateOption: string) => {
        const voteData = event.votes?.[dateOption];
        const voteCount = typeof voteData === 'object' ? voteData.count || 0 : voteData || 0;
        if (voteCount > maxVotes) {
          maxVotes = voteCount;
          winningDate = dateOption;
        }
      });
    }
    
    if (!winningDate) {
      alert('No date selected for this event yet');
      return;
    }
    
    try {
      const eventDate = new Date(winningDate);
      if (isNaN(eventDate.getTime())) {
        alert('Invalid event date');
        return;
      }
      
      // Format dates for iCalendar format (YYYYMMDDTHHmmssZ)
      const formatICSDate = (date: Date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
      };
      
      const startDate = formatICSDate(eventDate);
      const endDate = formatICSDate(new Date(eventDate.getTime() + 2 * 60 * 60 * 1000)); // 2 hours later
      const now = formatICSDate(new Date());
      
      const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//PlanTogether//Event//EN',
        'BEGIN:VEVENT',
        `UID:${event.id}@plantogether.app`,
        `DTSTAMP:${now}`,
        `DTSTART:${startDate}`,
        `DTEND:${endDate}`,
        `SUMMARY:${event.name}`,
        `DESCRIPTION:${event.description?.replace(/\n/g, '\\n') || 'No description'}`,
        event.location ? `LOCATION:${event.location}` : '',
        `URL:${window.location.href}`,
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR'
      ].filter(Boolean).join('\r\n');
      
      // Create and download file
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${event.name.replace(/[^a-z0-9]/gi, '_')}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Error generating calendar file:', error);
      alert('Failed to generate calendar file');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <svg className="animate-spin h-10 w-10 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      {/* Header with Breadcrumb */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-5">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
            <Link to="/dashboard" className="hover:text-teal-600 transition-colors font-medium">Dashboard</Link>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="hover:text-teal-600 transition-colors font-medium cursor-pointer">Events</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-900 font-semibold">{event?.name || 'Loading...'}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/dashboard" className="p-2.5 hover:bg-teal-50 rounded-xl transition-all duration-200 group">
                <svg className="w-6 h-6 text-gray-600 group-hover:text-teal-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-600 to-purple-600 bg-clip-text text-transparent">PlanTogether</h1>
                <p className="text-sm text-gray-500 font-medium">Event Details & Collaboration</p>
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              {/* Edit Button */}
              {(userData?.role === 'admin' || event?.hostId === auth.currentUser?.uid) && (
                <button
                  onClick={handleEditEvent}
                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 hover:shadow-lg transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
              
              {/* Delete Button */}
              {(userData?.role === 'admin' || event?.hostId === auth.currentUser?.uid) && (
                <button
                  onClick={handleDeleteEvent}
                  className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 hover:shadow-lg transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              )}
              
              {/* Share Dropdown */}
              <div className="relative group">
                <button
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-700 hover:shadow-lg transition-all duration-200"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                </button>
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="p-3 space-y-1">
                    <button onClick={() => shareOnPlatform('whatsapp')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-green-50 rounded-lg transition-colors text-left">
                      <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      <span className="font-medium text-gray-700">WhatsApp</span>
                    </button>
                    <button onClick={() => shareOnPlatform('email')} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 rounded-lg transition-colors text-left">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="font-medium text-gray-700">Email</span>
                    </button>
                    <button onClick={copyShareLink} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-50 rounded-lg transition-colors text-left">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="font-medium text-gray-700">{copied ? 'Link Copied!' : 'Copy Link'}</span>
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Add to Calendar Button */}
              <button
                onClick={downloadCalendarFile}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 hover:shadow-lg transition-all duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Add to Calendar
              </button>
            </div>
          </div>
        </div>
      </header>

      {event && (
        <main className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
          {/* Event Cover Header */}
          <div className="relative bg-gradient-to-r from-teal-500 via-cyan-500 to-purple-600 rounded-3xl shadow-2xl p-12 mb-10 overflow-hidden">
            <div className="absolute inset-0 bg-black opacity-5"></div>
            <div className="absolute top-0 right-0 w-96 h-96 bg-white opacity-5 rounded-full -mr-48 -mt-48"></div>
            <div className="relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  {/* Category & Status Badges */}
                  <div className="flex items-center gap-3 mb-6">
                    <span className="px-4 py-2 bg-white/20 backdrop-blur-md text-white font-bold rounded-full text-sm flex items-center gap-2">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                      </svg>
                      {getEventCategory(event)}
                    </span>
                    <span className={`px-4 py-2 ${
                      getEventStatus().color === 'green' ? 'bg-green-500' :
                      getEventStatus().color === 'yellow' ? 'bg-yellow-500' : 'bg-blue-500'
                    } text-white font-bold rounded-full text-sm flex items-center gap-2`}>
                      <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                      {getEventStatus().label}
                    </span>
                  </div>
                  
                  {/* Event Title - 48px */}
                  <h1 className="text-5xl lg:text-6xl font-extrabold text-white mb-4 drop-shadow-lg leading-tight">
                    {event.name}
                  </h1>
                  
                  {/* Description - 18px */}
                  <p className="text-xl text-white/90 max-w-3xl leading-relaxed font-medium">
                    {event.description || 'No description provided'}
                  </p>
                </div>
              </div>
              
              {/* Location with Icon - 18px */}
              {event.location && (
                <div className="flex items-center gap-3 text-white/95 mt-6">
                  <svg className="w-7 h-7 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-lg font-semibold">{event.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Horizontal Stats Badges - Dashboard Style */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {/* Total Votes */}
            <div className="bg-white rounded-2xl shadow-lg border-2 border-teal-100 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300 group">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-lg group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Votes</p>
                  <p className="text-4xl font-extrabold text-gray-900 mt-1" style={{ animation: voteAnimation ? 'pulse 0.5s ease-in-out' : 'none' }}>
                    {String(Object.values(event?.votes || {}).reduce((a: any, b: any) => {
                      const bCount = typeof b === 'object' ? b.count : b;
                      return Number(a) + Number(bCount || 0);
                    }, 0) as number)}
                  </p>
                </div>
              </div>
            </div>

            {/* Comments */}
            <div className="bg-white rounded-2xl shadow-lg border-2 border-purple-100 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300 group">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl shadow-lg group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Comments</p>
                  <p className="text-4xl font-extrabold text-gray-900 mt-1">{event.comments?.length || 0}</p>
                </div>
              </div>
            </div>

            {/* Date Options */}
            <div className="bg-white rounded-2xl shadow-lg border-2 border-blue-100 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300 group">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl shadow-lg group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Dates</p>
                  <p className="text-4xl font-extrabold text-gray-900 mt-1">{event.dateOptions?.length || 0}</p>
                </div>
              </div>
            </div>

            {/* Participants */}
            <div className="bg-white rounded-2xl shadow-lg border-2 border-green-100 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300 group">
              <div className="flex items-center gap-4">
                <div className="p-4 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">People</p>
                  <p className="text-4xl font-extrabold text-gray-900 mt-1">{event.participants?.length || 0}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Participation Progress Bar */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <svg className="w-6 h-6 text-teal-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
                Participation Rate
              </h3>
              <span className="text-3xl font-bold text-teal-600">{getParticipationRate()}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div 
                className="h-4 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${getParticipationRate()}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 mt-3 font-medium">
              {getParticipationRate() < 30 ? '🚀 Let\'s get more people involved!' : 
               getParticipationRate() < 70 ? '👍 Good progress! Keep it up!' : 
               '🎉 Amazing participation!'}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Event Info & Voting */}
            <div className="lg:col-span-2 space-y-8">
              {/* Voting Section - Highlighted Card */}
              <div className="relative bg-gradient-to-br from-purple-50 via-pink-50 to-purple-50 rounded-2xl shadow-2xl border-4 border-purple-300 p-8 hover:shadow-3xl transition-all duration-300 overflow-hidden">
                {/* Decorative background elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-200/30 to-pink-200/30 rounded-full blur-3xl -z-0"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-tr from-teal-200/30 to-cyan-200/30 rounded-full blur-3xl -z-0"></div>
                
                {/* Highlight badge */}
                <div className="absolute top-6 right-6 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-full text-xs font-extrabold shadow-lg flex items-center gap-2 animate-pulse">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  CAST YOUR VOTE
                </div>

                <div className="relative z-10">
                  <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-700 via-pink-600 to-purple-700 mb-6 flex items-center gap-3">
                    <svg className="w-9 h-9 text-purple-600" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    Vote on Date
                  </h2>
                  
                  {/* Voting Deadline Message */}
                  {(() => {
                    const deadlineMsg = getVotingDeadlineMessage();
                    if (deadlineMsg) {
                      const bgColor = deadlineMsg.type === 'past' || deadlineMsg.type === 'closed' ? 'bg-red-100 border-red-300' : 
                                     deadlineMsg.type === 'urgent' ? 'bg-orange-100 border-orange-300' : 
                                     'bg-blue-100 border-blue-300';
                      const textColor = deadlineMsg.type === 'past' || deadlineMsg.type === 'closed' ? 'text-red-700' : 
                                       deadlineMsg.type === 'urgent' ? 'text-orange-700' : 
                                       'text-blue-700';
                      return (
                        <div className={`mb-6 p-4 rounded-lg border-2 ${bgColor} ${textColor} font-semibold text-base`}>
                          {deadlineMsg.message}
                        </div>
                      );
                    }
                    return (
                      <p className="text-purple-700 font-semibold mb-6 text-base">
                        📅 Select your preferred date and help decide when this event happens!
                      </p>
                    );
                  })()}
                  <div className="flex gap-4">
                    <div className="flex-1 relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg className="h-7 w-7 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <select
                        value={vote}
                        onChange={(e) => setVote(e.target.value)}
                        disabled={!isVotingAllowed()}
                        className={`w-full pl-14 pr-4 py-5 text-lg border-3 rounded-xl focus:ring-4 focus:ring-purple-400 focus:border-purple-500 outline-none transition-all duration-200 font-bold shadow-lg hover:shadow-xl ${
                          isVotingAllowed() ? 'border-purple-300 bg-white cursor-pointer' : 'border-gray-300 bg-gray-100 cursor-not-allowed opacity-60'
                        }`}
                      >
                        <option value="">{isVotingAllowed() ? 'Select a date option...' : 'Voting is closed'}</option>
                        {event.dateOptions?.map((opt: string) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    {hasUserVoted() ? (
                      <button
                        onClick={handleRemoveVote}
                        disabled={!vote || !isVotingAllowed()}
                        className={`px-10 py-5 text-xl font-black rounded-xl focus:outline-none focus:ring-4 focus:ring-red-400 focus:ring-offset-2 transition-all duration-300 shadow-2xl transform ${
                          vote && isVotingAllowed()
                            ? 'bg-gradient-to-r from-red-600 via-orange-600 to-red-600 text-white hover:from-red-700 hover:via-orange-700 hover:to-red-700 hover:shadow-3xl hover:scale-110 cursor-pointer' 
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          Remove Vote
                        </div>
                      </button>
                    ) : (
                      <button
                        onClick={handleVote}
                        disabled={!vote || !isVotingAllowed()}
                        className={`px-10 py-5 text-xl font-black rounded-xl focus:outline-none focus:ring-4 focus:ring-purple-400 focus:ring-offset-2 transition-all duration-300 shadow-2xl transform ${
                          vote && isVotingAllowed()
                            ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 text-white hover:from-purple-700 hover:via-pink-700 hover:to-purple-700 hover:shadow-3xl hover:scale-110 animate-pulse cursor-pointer' 
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                          </svg>
                          Vote
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Voting Results Chart - Enhanced */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 hover:shadow-xl transition-shadow duration-300">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                  <svg className="w-7 h-7 text-teal-600" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Voting Results
                </h2>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={chartData}>
                      <defs>
                        <linearGradient id="voteGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#14b8a6" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.8}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" stroke="#6b7280" style={{ fontSize: '14px', fontWeight: 600 }} />
                      <YAxis stroke="#6b7280" style={{ fontSize: '14px', fontWeight: 600 }} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#fff', 
                          border: '2px solid #14b8a6',
                          borderRadius: '12px',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                          padding: '12px',
                          fontSize: '16px',
                          fontWeight: 600
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: '16px', fontWeight: 600 }} />
                      <Bar dataKey="votes" fill="url(#voteGradient)" radius={[12, 12, 0, 0]}>
                        <LabelList dataKey="votes" position="top" style={{ fill: '#14b8a6', fontWeight: 'bold', fontSize: 16 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-16">
                    <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-teal-100 to-cyan-100 rounded-full mb-4">
                      <svg className="w-12 h-12 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l5-5m0 0l5 5m-5-5v12" />
                      </svg>
                    </div>
                    <p className="text-xl font-bold text-gray-900 mb-2">No votes yet!</p>
                    <p className="text-base text-gray-600">Be the first to vote and help decide the best date</p>
                  </div>
                )}
              </div>

              {/* Comments Section - Enhanced */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 hover:shadow-xl transition-shadow duration-300">
                <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                  <svg className="w-7 h-7 text-teal-600" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  Comments ({event.comments?.length || 0})
                </h2>
                
                <div className="flex gap-4 mb-6">
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleComment()}
                    placeholder="Share your thoughts..."
                    className="flex-1 px-5 py-4 text-base border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-all duration-200 font-medium"
                  />
                  <button
                    onClick={handleComment}
                    disabled={!comment.trim()}
                    className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white text-lg font-bold rounded-xl hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md transform hover:scale-105"
                  >
                    Post
                  </button>
                </div>

                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {event.comments?.length > 0 ? (
                    event.comments.map((c: any, i: number) => (
                      <div key={i} className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-5 border-2 border-gray-200 hover:border-teal-300 hover:shadow-md transition-all duration-200">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg">
                              {typeof c === 'string' ? 'A' : c.author?.[0]?.toUpperCase() || 'A'}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900 text-base">
                                {typeof c === 'string' ? 'Anonymous' : c.author || 'Anonymous'}
                              </p>
                              {typeof c !== 'string' && c.timestamp && (
                                <p className="text-sm text-gray-500 font-medium">
                                  {new Date(c.timestamp).toLocaleString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="text-gray-700 text-base leading-relaxed pl-15">{typeof c === 'string' ? c : c.text}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-16 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-dashed border-gray-300">
                      <div className="inline-flex items-center justify-center w-24 h-24 bg-white rounded-full mb-4 shadow-lg">
                        <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                        </svg>
                      </div>
                      <p className="text-xl font-bold text-gray-900 mb-2">No comments yet</p>
                      <p className="text-base text-gray-600 mb-4">Start planning! Share your ideas below</p>
                      <div className="inline-flex items-center gap-2 text-teal-600 font-semibold">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        Be the first to comment
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Enhanced Info Cards */}
            <div className="space-y-8">
              {/* RSVP Section */}
              <div className="bg-gradient-to-br from-green-50 via-emerald-50 to-green-50 rounded-2xl shadow-xl border-3 border-green-300 p-8 hover:shadow-2xl transition-all duration-300">
                <h3 className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-green-700 to-emerald-700 mb-4 flex items-center gap-3">
                  <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                  </svg>
                  RSVP - Are You Coming?
                </h3>
                
                {/* RSVP Status Message */}
                {!isRSVPAllowed() && (
                  <div className="mb-4 p-3 bg-red-100 border-2 border-red-300 rounded-lg text-red-700 font-semibold text-sm">
                    ⏰ RSVP is closed (6 hours before event)
                  </div>
                )}
                
                {/* RSVP Buttons */}
                <div className="space-y-3 mb-6">
                  <button
                    onClick={() => handleRSVP('going')}
                    disabled={!isRSVPAllowed()}
                    className={`w-full py-4 px-6 rounded-xl font-bold text-base transition-all duration-300 flex items-center justify-between ${
                      rsvpStatus === 'going'
                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white shadow-lg scale-105'
                        : isRSVPAllowed()
                        ? 'bg-white border-2 border-green-300 text-green-700 hover:bg-green-50 hover:scale-102'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      I'm Going
                    </span>
                    {rsvpStatus === 'going' && <span className="text-sm">✓ Selected</span>}
                  </button>
                  
                  <button
                    onClick={() => handleRSVP('maybe')}
                    disabled={!isRSVPAllowed()}
                    className={`w-full py-4 px-6 rounded-xl font-bold text-base transition-all duration-300 flex items-center justify-between ${
                      rsvpStatus === 'maybe'
                        ? 'bg-gradient-to-r from-yellow-500 to-amber-500 text-white shadow-lg scale-105'
                        : isRSVPAllowed()
                        ? 'bg-white border-2 border-yellow-300 text-yellow-700 hover:bg-yellow-50 hover:scale-102'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                      Maybe
                    </span>
                    {rsvpStatus === 'maybe' && <span className="text-sm">✓ Selected</span>}
                  </button>
                  
                  <button
                    onClick={() => handleRSVP('not-going')}
                    disabled={!isRSVPAllowed()}
                    className={`w-full py-4 px-6 rounded-xl font-bold text-base transition-all duration-300 flex items-center justify-between ${
                      rsvpStatus === 'not-going'
                        ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg scale-105'
                        : isRSVPAllowed()
                        ? 'bg-white border-2 border-red-300 text-red-700 hover:bg-red-50 hover:scale-102'
                        : 'bg-gray-200 text-gray-500 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      Can't Make It
                    </span>
                    {rsvpStatus === 'not-going' && <span className="text-sm">✓ Selected</span>}
                  </button>
                </div>
                
                {/* RSVP Summary */}
                {(() => {
                  const counts = getRSVPCounts();
                  const total = counts.going + counts.maybe + counts.notGoing;
                  return total > 0 ? (
                    <div className="pt-4 border-t-2 border-green-200">
                      <p className="text-sm font-bold text-gray-600 mb-3">Response Summary:</p>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-700 flex items-center gap-2">
                            <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                            Going
                          </span>
                          <span className="font-bold text-green-700">{counts.going}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-700 flex items-center gap-2">
                            <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                            Maybe
                          </span>
                          <span className="font-bold text-yellow-700">{counts.maybe}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-700 flex items-center gap-2">
                            <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                            Not Going
                          </span>
                          <span className="font-bold text-red-700">{counts.notGoing}</span>
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>

              {/* Items/Activities with Voting */}
              {event.items && event.items.length > 0 && (
                <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
                  <h3 className="text-2xl font-bold text-gray-900 mb-5 flex items-center gap-3">
                    <svg className="w-7 h-7 text-teal-600" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Vote on Items & Activities
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">Select items you prefer (multiple choices allowed)</p>
                  <ul className="space-y-3">
                    {event.items.map((item: string, i: number) => {
                      const itemVoteData = event.itemVotes?.[item] || { count: 0, voters: [] };
                      const voteCount = itemVoteData.count || 0;
                      const isVoted = itemVotes.includes(item);
                      
                      return (
                        <li key={i}>
                          <button
                            onClick={() => handleItemVote(item)}
                            className={`w-full flex items-center justify-between gap-3 text-gray-700 p-4 rounded-lg transition-all duration-200 ${
                              isVoted
                                ? 'bg-gradient-to-r from-teal-100 to-cyan-100 border-2 border-teal-400 shadow-md'
                                : 'bg-gradient-to-r from-gray-50 to-white border-2 border-gray-200 hover:from-teal-50 hover:to-cyan-50 hover:border-teal-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <svg className={`w-7 h-7 flex-shrink-0 transition-all ${
                                isVoted ? 'text-teal-600 scale-110' : 'text-gray-400'
                              }`} fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              <span className={`text-base font-medium ${isVoted ? 'text-teal-900 font-bold' : ''}`}>{item}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${isVoted ? 'text-teal-700' : 'text-gray-500'}`}>
                                {voteCount} {voteCount === 1 ? 'vote' : 'votes'}
                              </span>
                              {isVoted && (
                                <span className="bg-teal-600 text-white text-xs px-2 py-1 rounded-full">✓ Voted</span>
                              )}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Date Options with Voter Avatars - Enhanced */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
                <h3 className="text-2xl font-bold text-gray-900 mb-5 flex items-center gap-3">
                  <svg className="w-7 h-7 text-teal-600" fill="currentColor" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={0.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Date Options & Voters
                </h3>
                <ul className="space-y-4">
                  {event.dateOptions?.map((opt: string, i: number) => {
                    const voteData = event.votes[opt];
                    const voteCount = typeof voteData === 'object' ? voteData.count : voteData || 0;
                    const voters = typeof voteData === 'object' ? voteData.voters : [];
                    
                    return (
                      <li key={i} className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border-2 border-gray-200 hover:border-teal-300 hover:shadow-lg transition-all duration-200">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-gray-900 font-bold text-lg">{opt}</span>
                          <span className="px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-full text-sm font-bold shadow-md">
                            {voteCount} {voteCount === 1 ? 'vote' : 'votes'}
                          </span>
                        </div>
                        {voters && voters.length > 0 && (
                          <div className="mt-4 pt-4 border-t-2 border-gray-200">
                            <p className="text-sm text-gray-600 mb-3 font-bold uppercase tracking-wide">Voted by:</p>
                            {/* Stacked Avatar Layout */}
                            <div className="flex flex-wrap gap-3">
                              {voters.map((voter: any, vIdx: number) => (
                                <div 
                                  key={vIdx} 
                                  className="group relative"
                                >
                                  <div className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-teal-300 rounded-full hover:bg-teal-50 hover:border-teal-500 transition-all duration-200 shadow-sm hover:shadow-md">
                                    <div className="w-8 h-8 bg-gradient-to-r from-teal-400 to-cyan-500 rounded-full flex items-center justify-center text-white text-sm font-extrabold shadow-lg">
                                      {voter.name?.[0]?.toUpperCase() || 'U'}
                                    </div>
                                    <span className="text-sm font-bold text-gray-700">{voter.name}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Timeline Card */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                    <svg className="w-7 h-7 text-teal-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    Activity Timeline
                  </h3>
                  <button
                    onClick={() => setShowTimeline(!showTimeline)}
                    className="p-2 hover:bg-teal-50 rounded-lg transition-colors"
                  >
                    <svg className={`w-6 h-6 text-teal-600 transition-transform ${showTimeline ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                {showTimeline && (
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="w-0.5 h-full bg-gradient-to-b from-purple-300 to-transparent"></div>
                      </div>
                      <div className="pb-6">
                        <p className="font-bold text-gray-900 text-base">Event Created</p>
                        <p className="text-sm text-gray-600 font-medium">
                          {event.createdAt?.toDate?.().toLocaleString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          }) || 'Recently'}
                        </p>
                      </div>
                    </div>
                    
                    {(Object.values(event?.votes || {}).reduce((a: any, b: any) => {
                      const bCount = typeof b === 'object' ? b.count : b;
                      return Number(a) + Number(bCount || 0);
                    }, 0) as number) > 0 && (
                      <div className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                            </svg>
                          </div>
                          <div className="w-0.5 h-full bg-gradient-to-b from-teal-300 to-transparent"></div>
                        </div>
                        <div className="pb-6">
                          <p className="font-bold text-gray-900 text-base">Voting Started</p>
                          <p className="text-sm text-gray-600 font-medium">
                            {Object.values(event?.votes || {}).reduce((a: any, b: any) => {
                              const bCount = typeof b === 'object' ? b.count : b;
                              return Number(a) + Number(bCount || 0);
                            }, 0) as number} total votes cast
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {event.comments?.length > 0 && (
                      <div className="flex gap-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-base">Discussion Active</p>
                          <p className="text-sm text-gray-600 font-medium">{event.comments.length} comments added</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Edit Event Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto animate-slideIn">
            <div className="p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-3xl font-bold text-gray-900">Edit Event</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
                {/* Event Name */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Event Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                    placeholder="Event name"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all resize-none"
                    placeholder="Event description"
                  />
                </div>

                {/* Location */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Location
                  </label>
                  <input
                    type="text"
                    value={editFormData.location}
                    onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all"
                    placeholder="Event location"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold px-6 py-3 rounded-lg hover:from-purple-700 hover:to-purple-800 hover:shadow-lg transition-all"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Animation Styles */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-slideIn {
          animation: slideIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default EventView;