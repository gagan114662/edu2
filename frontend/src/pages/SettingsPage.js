import React, { useState, useEffect } from 'react';
import CurriculumSettings from '../components/CurriculumSettings';
import AuthDebug from '../components/AuthDebug';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const SettingsPage = () => {
  const { user, getIdToken } = useAuth();
  const [currentSettings, setCurrentSettings] = useState(null);
  const [parentEmail, setParentEmail] = useState('');
  const [linkStatus, setLinkStatus] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const token = await getIdToken();
        const response = await axios.get('http://127.0.0.1:8000/api/users/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setCurrentSettings({
          grade_level: response.data.grade_level || 'Grade 1',
          curriculum_framework: response.data.curriculum_framework || 'Common Core'
        });
        
        if (response.data.parent_email) {
          setParentEmail(response.data.parent_email);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
        setLoading(false);
      }
    };

    if (user) {
      fetchUserProfile();
    }
  }, [user, getIdToken]);

  const handleParentLink = async (e) => {
    e.preventDefault();
    setLinkStatus('loading');
    
    try {
      const token = await getIdToken();
      await axios.post('http://127.0.0.1:8000/api/users/me/link-parent', 
        { parent_email: parentEmail },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setLinkStatus('success');
    } catch (error) {
      console.error('Failed to link parent:', error);
      setLinkStatus('error');
    }
  };

  const handleSettingsUpdate = (newSettings) => {
    setCurrentSettings(newSettings);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-4 max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings</h1>
        
        <div className="space-y-6">
          <AuthDebug />
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Curriculum Settings</h2>
            <CurriculumSettings 
              currentSettings={currentSettings}
              onSettingsUpdate={handleSettingsUpdate}
            />
          </div>
          
          {user?.user_role === 'student' && (
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold mb-4">Parent Access</h2>
              <p className="text-gray-600 mb-4">
                Link your parent's email to allow them to monitor your progress
              </p>
              
              <form onSubmit={handleParentLink} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Parent Email
                  </label>
                  <input
                    type="email"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="parent@example.com"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={linkStatus === 'loading'}
                  className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 disabled:bg-gray-400"
                >
                  {linkStatus === 'loading' ? 'Linking...' : 'Link Parent Account'}
                </button>
                
                {linkStatus === 'success' && (
                  <p className="text-green-600 text-sm">Parent account linked successfully!</p>
                )}
                {linkStatus === 'error' && (
                  <p className="text-red-600 text-sm">Failed to link parent account. Please try again.</p>
                )}
              </form>
            </div>
          )}
          
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Account Information</h2>
            <div className="space-y-2">
              <p><span className="font-medium">Email:</span> {user?.email}</p>
              <p><span className="font-medium">Role:</span> {user?.user_role}</p>
              <p><span className="font-medium">User ID:</span> {user?.uid}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;