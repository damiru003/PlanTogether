import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

const EventView = () => {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<any>(null);
  const [vote, setVote] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
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
    const newVotes = { ...event.votes };
    if (!newVotes[vote]) newVotes[vote] = 0;
    newVotes[vote]++;
    await updateDoc(doc(db, 'events', id!), { votes: newVotes });
    setVote('');
  };

  const handleComment = async () => {
    if (!comment.trim()) return;
    const newComment = {
      text: comment,
      author: auth.currentUser?.email || 'Anonymous',
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

  const chartData = event?.dateOptions?.map((opt: string) => ({ 
    name: opt, 
    votes: event.votes[opt] || 0 
  })) || [];

  const COLORS = ['#14b8a6', '#06b6d4', '#0891b2', '#0e7490', '#0d9488'];

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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/dashboard" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-teal-600 to-purple-600 bg-clip-text text-transparent">PlanTogether</h1>
                <p className="text-sm text-gray-500">Event Details & Voting</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {event?.hostId === auth.currentUser?.uid && (
                <button
                  onClick={handleDeleteEvent}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-all duration-200 shadow-md"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              )}
              <button
                onClick={copyShareLink}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-full hover:from-teal-600 hover:to-cyan-700 hover:shadow-lg transition-all duration-200 shadow-md"
              >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {copied ? 'Copied!' : 'Share'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {event && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Centered Title with Gradient Underline */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-gray-900 mb-3">{event.name}</h1>
            <div className="h-1 w-32 mx-auto bg-gradient-to-r from-teal-500 to-purple-600 rounded-full mb-6"></div>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">{event.description || 'No description provided'}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Event Info & Voting */}
            <div className="lg:col-span-2 space-y-6">
              {/* Voting Section */}
              <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  Vote on Date
                </h2>
                <div className="flex gap-3">
                  <select
                    value={vote}
                    onChange={(e) => setVote(e.target.value)}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all duration-200"
                  >
                    <option value="">Select a date option...</option>
                    {event.dateOptions?.map((opt: string) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleVote}
                    disabled={!vote}
                    className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold rounded-full hover:from-purple-700 hover:to-purple-800 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md"
                  >
                    Vote
                  </button>
                </div>
              </div>

              {/* Voting Results Chart */}
              <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Voting Results
                </h2>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={chartData}>
                      <XAxis dataKey="name" stroke="#6b7280" />
                      <YAxis stroke="#6b7280" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#fff', 
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="votes" radius={[8, 8, 0, 0]}>
                        {chartData.map((_entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-10 text-gray-500">
                    <p>No votes yet. Be the first to vote!</p>
                  </div>
                )}
              </div>

              {/* Comments Section */}
              <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  Comments ({event.comments?.length || 0})
                </h2>
                
                <div className="flex gap-3 mb-4">
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleComment()}
                    placeholder="Add your thoughts..."
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200"
                  />
                  <button
                    onClick={handleComment}
                    disabled={!comment.trim()}
                    className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md"
                  >
                    Post
                  </button>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {event.comments?.length > 0 ? (
                    event.comments.map((c: any, i: number) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                              {typeof c === 'string' ? 'A' : c.author?.[0]?.toUpperCase() || 'A'}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 text-sm">
                                {typeof c === 'string' ? 'Anonymous' : c.author || 'Anonymous'}
                              </p>
                              {typeof c !== 'string' && c.timestamp && (
                                <p className="text-xs text-gray-500">
                                  {new Date(c.timestamp).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="text-gray-700">{typeof c === 'string' ? c : c.text}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>No comments yet. Start the conversation!</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Stats & Info */}
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl shadow-lg p-6 text-white">
                <h3 className="text-lg font-semibold mb-4">Event Stats</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-teal-50">Total Votes</span>
                    <span className="text-2xl font-bold">{String(Object.values(event.votes || {}).reduce((a: any, b: any) => Number(a) + Number(b), 0))}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-teal-50">Comments</span>
                    <span className="text-2xl font-bold">{event.comments?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-teal-50">Date Options</span>
                    <span className="text-2xl font-bold">{event.dateOptions?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-teal-50">Participants</span>
                    <span className="text-2xl font-bold">{event.participants?.length || 0}</span>
                  </div>
                </div>
              </div>

              {/* Items/Activities */}
              {event.items && event.items.length > 0 && (
                <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    Items & Activities
                  </h3>
                  <ul className="space-y-2">
                    {event.items.map((item: string, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-gray-700">
                        <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Date Options List */}
              <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Date Options
                </h3>
                <ul className="space-y-2">
                  {event.dateOptions?.map((opt: string, i: number) => (
                    <li key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <span className="text-gray-700 font-medium">{opt}</span>
                      <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm font-semibold">
                        {event.votes[opt] || 0} votes
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  );
};

export default EventView;