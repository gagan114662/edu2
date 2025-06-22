import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const CurriculumBrowser = ({ userGrade = "Grade 1", onTopicSelect }) => {
  const [standards, setStandards] = useState({});
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState('Math');
  const [error, setError] = useState(null);
  const { getIdToken } = useAuth();

  useEffect(() => {
    fetchCurriculumData();
  }, [userGrade]);

  const fetchCurriculumData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get Firebase ID token
      const token = await getIdToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      const config = {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };

      // Fetch curriculum standards and progress in parallel
      const [standardsResponse, progressResponse] = await Promise.all([
        axios.get(`http://127.0.0.1:8000/api/curriculum/standards/${userGrade}`, config),
        axios.get('http://127.0.0.1:8000/api/curriculum/progress', config)
      ]);

      setStandards(standardsResponse.data);
      setProgress(progressResponse.data);
    } catch (err) {
      console.error('Error fetching curriculum data:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load curriculum data');
    } finally {
      setLoading(false);
    }
  };

  const getProgressForStandard = (standardId) => {
    return progress.find(p => p.standard_id === standardId);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'mastered': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleTopicClick = (standard) => {
    if (onTopicSelect) {
      onTopicSelect(standard);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-2">Loading curriculum...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <h3 className="text-red-800 font-medium">Error Loading Curriculum</h3>
        <p className="text-red-700 text-sm mt-1">{error}</p>
        <button 
          onClick={fetchCurriculumData}
          className="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const subjects = Object.keys(standards);
  const currentStandards = standards[selectedSubject] || [];

  return (
    <div className="curriculum-browser bg-white rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {userGrade} Curriculum
        </h2>
        <p className="text-gray-600">
          Track your progress through curriculum standards and select topics to practice.
        </p>
      </div>

      {/* Subject Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {subjects.map((subject) => (
              <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  selectedSubject === subject
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {subject}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Standards List */}
      <div className="space-y-4">
        {currentStandards.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No standards available for {selectedSubject} in {userGrade}
          </p>
        ) : (
          currentStandards.map((standard) => {
            const standardProgress = getProgressForStandard(standard.id);
            return (
              <div
                key={standard.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleTopicClick(standard)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900">
                        {standard.topic}
                      </h3>
                      {standardProgress && (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(standardProgress.status)}`}>
                          {standardProgress.status.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm mb-2">
                      {standard.description}
                    </p>
                    <p className="text-gray-400 text-xs">
                      Standard ID: {standard.id}
                    </p>
                  </div>
                  
                  {standardProgress && standardProgress.progress_percentage > 0 && (
                    <div className="ml-4 text-right">
                      <div className="text-sm font-medium text-gray-900">
                        {standardProgress.progress_percentage}%
                      </div>
                      <div className="w-16 bg-gray-200 rounded-full h-2 mt-1">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${standardProgress.progress_percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary */}
      {progress.length > 0 && (
        <div className="mt-8 bg-gray-50 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-2">Progress Summary</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-green-600">
                {progress.filter(p => p.status === 'mastered').length}
              </div>
              <div className="text-sm text-gray-600">Mastered</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">
                {progress.filter(p => p.status === 'in_progress').length}
              </div>
              <div className="text-sm text-gray-600">In Progress</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-600">
                {progress.filter(p => p.status === 'not_started').length}
              </div>
              <div className="text-sm text-gray-600">Not Started</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CurriculumBrowser;