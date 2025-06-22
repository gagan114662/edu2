import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const CurriculumSettings = ({ currentSettings, onSettingsUpdate }) => {
  const [gradeLevel, setGradeLevel] = useState(currentSettings?.grade_level || 'Grade 1');
  const [curriculumFramework, setCurriculumFramework] = useState(currentSettings?.curriculum_framework || 'Common Core');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { getIdToken } = useAuth();

  const gradeLevels = [
    'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 
    'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10',
    'Grade 11', 'Grade 12'
  ];

  const curriculumFrameworks = [
    'Common Core',
    'Cambridge',
    'Ontario',
    'UK National Curriculum',
    'Australian Curriculum',
    'International Baccalaureate'
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setMessage('');

    try {
      // Get Firebase ID token
      const token = await getIdToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      const config = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      const response = await axios.put('http://127.0.0.1:8000/api/users/me/curriculum', {
        grade_level: gradeLevel,
        curriculum_framework: curriculumFramework
      }, config);

      setMessage('Curriculum settings updated successfully!');
      
      // Call parent callback if provided
      if (onSettingsUpdate) {
        onSettingsUpdate({
          grade_level: gradeLevel,
          curriculum_framework: curriculumFramework
        });
      }

    } catch (err) {
      console.error('Error updating curriculum settings:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to update settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="curriculum-settings bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">
        Curriculum Settings
      </h2>
      <p className="text-gray-600 mb-6">
        Configure your grade level and curriculum framework to get personalized content.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Grade Level */}
        <div>
          <label htmlFor="grade-level" className="block text-sm font-medium text-gray-700 mb-2">
            Grade Level
          </label>
          <select
            id="grade-level"
            value={gradeLevel}
            onChange={(e) => setGradeLevel(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            required
          >
            {gradeLevels.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </div>

        {/* Curriculum Framework */}
        <div>
          <label htmlFor="curriculum-framework" className="block text-sm font-medium text-gray-700 mb-2">
            Curriculum Framework
          </label>
          <select
            id="curriculum-framework"
            value={curriculumFramework}
            onChange={(e) => setCurriculumFramework(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            required
          >
            {curriculumFrameworks.map((framework) => (
              <option key={framework} value={framework}>
                {framework}
              </option>
            ))}
          </select>
        </div>

        {/* Messages */}
        {message && (
          <div className="bg-green-50 border border-green-200 rounded-md p-3">
            <p className="text-green-800 text-sm">{message}</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <div>
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
              isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Updating...
              </>
            ) : (
              'Update Settings'
            )}
          </button>
        </div>
      </form>

      {/* Info */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-md p-3">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Changing your curriculum settings will update the content and progress tracking to match your new grade level and framework. This ensures you get age-appropriate content aligned with your educational goals.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CurriculumSettings;