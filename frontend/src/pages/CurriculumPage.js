import React, { useState, useEffect } from 'react';
import CurriculumBrowser from '../components/CurriculumBrowser';
import AIChat from '../components/AIChat';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const CurriculumPage = () => {
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [userGrade, setUserGrade] = useState('Grade 1');
  const { user, getIdToken } = useAuth();

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const token = await getIdToken();
        const response = await axios.get('http://127.0.0.1:8000/api/users/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.grade_level) {
          setUserGrade(response.data.grade_level);
        }
      } catch (error) {
        console.error('Failed to fetch user profile:', error);
      }
    };

    if (user) {
      fetchUserProfile();
    }
  }, [user, getIdToken]);

  const handleTopicSelect = (topic) => {
    setSelectedTopic(topic);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-4">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Curriculum Browser</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Browse Topics</h2>
              <CurriculumBrowser 
                userGrade={userGrade}
                onTopicSelect={handleTopicSelect}
              />
            </div>
          </div>
          
          <div>
            {selectedTopic ? (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4">
                  Study: {selectedTopic.topic}
                </h2>
                <p className="text-gray-600 mb-4">{selectedTopic.description}</p>
                <div className="border-t pt-4">
                  <AIChat 
                    context={`Help me learn about ${selectedTopic.topic}. ${selectedTopic.description}`}
                    placeholder={`Ask questions about ${selectedTopic.topic}...`}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="text-center text-gray-500">
                  <p className="text-lg mb-2">Select a topic to start learning</p>
                  <p className="text-sm">Choose a topic from the curriculum browser to begin your AI-powered tutoring session</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CurriculumPage;