import { useForm } from 'react-hook-form';
import { addDoc, collection, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useNavigate, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

type FormData = { 
  name: string; 
  description: string; 
  location?: string; 
  privacy: 'public' | 'private';
  items: string;
};

const CreateEvent = () => {
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      privacy: 'public'
    }
  });
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [checkingPermission, setCheckingPermission] = useState(true);
  const [dateTimeOptions, setDateTimeOptions] = useState<string[]>(['']);
  const [dateTimeErrors, setDateTimeErrors] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const checkPermission = async () => {
      if (!auth.currentUser) {
        navigate('/');
        return;
      }
      
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setUserData(data);
        
        // Only admins can create events
        if (data.role !== 'admin') {
          alert('Only admins can create events');
          navigate('/dashboard');
          return;
        }
      }
      setCheckingPermission(false);
    };
    
    checkPermission();
  }, [navigate]);

  const addDateTimeOption = () => {
    setDateTimeOptions([...dateTimeOptions, '']);
    setDateTimeErrors([...dateTimeErrors, '']);
  };

  const removeDateTimeOption = (index: number) => {
    if (dateTimeOptions.length > 1) {
      setDateTimeOptions(dateTimeOptions.filter((_, i) => i !== index));
      setDateTimeErrors(dateTimeErrors.filter((_, i) => i !== index));
    }
  };

  const updateDateTimeOption = (index: number, value: string) => {
    const newOptions = [...dateTimeOptions];
    newOptions[index] = value;
    setDateTimeOptions(newOptions);
    
    // Validate the date
    const newErrors = [...dateTimeErrors];
    if (value) {
      const selectedDate = new Date(value);
      const now = new Date();
      
      if (selectedDate < now) {
        newErrors[index] = 'Date and time must be in the future';
      } else {
        newErrors[index] = '';
      }
    } else {
      newErrors[index] = '';
    }
    setDateTimeErrors(newErrors);
  };

  const validateDateTimes = (): boolean => {
    const validOptions = dateTimeOptions.filter(dt => dt.trim() !== '');
    
    if (validOptions.length === 0) {
      alert('Please add at least one date and time option');
      return false;
    }

    const now = new Date();
    const errors: string[] = [];
    
    validOptions.forEach((dateTime, index) => {
      const selectedDate = new Date(dateTime);
      if (selectedDate < now) {
        errors[index] = 'Date and time must be in the future';
      }
    });

    if (errors.some(err => err !== '' && err !== undefined)) {
      setDateTimeErrors(errors);
      return false;
    }

    return true;
  };

  const onSubmit = async (data: FormData) => {
    // Double-check permission
    if (userData?.role !== 'admin') {
      alert('Only admins can create events');
      navigate('/dashboard');
      return;
    }

    // Validate date/time options
    if (!validateDateTimes()) {
      return;
    }
    
    setLoading(true);
    try {
      const validDateOptions = dateTimeOptions.filter(dt => dt.trim() !== '');
      
      const event = {
        name: data.name,
        description: data.description || '',
        dateOptions: validDateOptions,
        items: data.items ? data.items.split(',').map(i => i.trim()).filter(i => i) : [],
        location: data.location || '',
        privacy: data.privacy || 'public',
        hostId: auth.currentUser?.uid,
        hostName: userData?.name || auth.currentUser?.email,
        organization: userData?.organization || '',
        votes: {},
        comments: [],
        participants: [],
        rsvps: [],
        itemVotes: {},
        createdAt: new Date(),
      };
      const docRef = await addDoc(collection(db, 'events'), event);
      navigate(`/event/${docRef.id}`);
    } catch (error) {
      console.error('Error creating event:', error);
      alert('Failed to create event. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Get minimum datetime (current time)
  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  if (checkingPermission) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <svg className="animate-spin h-10 w-10 text-teal-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create New Event</h1>
              <p className="text-sm text-gray-500">Plan your next gathering with ease</p>
            </div>
          </div>
        </div>
      </header>

      {/* Form */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
          <form onSubmit={handleSubmit(onSubmit)} className="p-8">
            <div className="space-y-6">
              {/* Event Name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Event Name <span className="text-red-500">*</span>
                </label>
                <input
                  {...register('name', { required: 'Event name is required' })}
                  placeholder="e.g., Team Building Workshop"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200"
                />
                {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  {...register('description')}
                  rows={4}
                  placeholder="Provide details about your event, what to expect, and any important information..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200 resize-none"
                />
              </div>

              {/* Date and Time Options */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Date & Time Options <span className="text-red-500">*</span>
                </label>
                <div className="space-y-3">
                  {dateTimeOptions.map((dateTime, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="flex-1">
                        <input
                          type="datetime-local"
                          value={dateTime}
                          onChange={(e) => updateDateTimeOption(index, e.target.value)}
                          min={getMinDateTime()}
                          className={`w-full px-4 py-3 border ${dateTimeErrors[index] ? 'border-red-300' : 'border-gray-300'} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200`}
                        />
                        {dateTimeErrors[index] && (
                          <p className="mt-1 text-sm text-red-600 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {dateTimeErrors[index]}
                          </p>
                        )}
                      </div>
                      {dateTimeOptions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDateTimeOption(index)}
                          className="px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
                          title="Remove this option"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addDateTimeOption}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors border border-purple-200 font-medium"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Another Date & Time Option
                </button>
                <p className="mt-3 text-sm text-gray-500 flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Provide multiple date and time options for participants to vote on. All dates must be in the future.
                </p>
              </div>

              {/* Items/Activities */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Items, Activities, or Suggestions
                </label>
                <input
                  {...register('items')}
                  placeholder="Pizza, Drinks, Games, Music"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200"
                />
                <p className="mt-2 text-sm text-gray-500 flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Add items like venue suggestions, food options, or activities (comma-separated)
                </p>
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Location
                </label>
                <input
                  {...register('location')}
                  placeholder="e.g., Conference Room A, Central Park, 123 Main St"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none transition-all duration-200"
                />
                <p className="mt-2 text-sm text-gray-500 flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Where will this event take place?
                </p>
              </div>

              {/* Privacy Settings */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Event Privacy
                </label>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50">
                    <input
                      type="radio"
                      value="public"
                      {...register('privacy')}
                      className="mt-1 w-4 h-4 text-purple-600 focus:ring-purple-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                        </svg>
                        <span className="font-semibold text-gray-900">Public</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">Anyone can view and participate in this event</p>
                    </div>
                  </label>
                  
                  <label className="flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors has-[:checked]:border-purple-500 has-[:checked]:bg-purple-50">
                    <input
                      type="radio"
                      value="private"
                      {...register('privacy')}
                      className="mt-1 w-4 h-4 text-purple-600 focus:ring-purple-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                        <span className="font-semibold text-gray-900">Private</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">Only invited users can see and join this event</p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 mt-8 pt-6 border-t border-gray-200">
              <Link
                to="/dashboard"
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-all duration-200 text-center"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold px-6 py-3 rounded-full hover:from-purple-700 hover:to-purple-800 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Create Event
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default CreateEvent;