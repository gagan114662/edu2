// frontend/src/pages/ProgressDashboardPage.js
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext'; // For getIdToken
import axios from 'axios'; // Or your preferred fetch method

import ProgressSummary from '../components/progress/ProgressSummary';
import TopicsProgressView from '../components/progress/TopicsProgressView';
// import ChartsPlaceholder from '../components/progress/ChartsPlaceholder'; // If adding

const ProgressDashboardPage = () => {
  const [progressData, setProgressData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { getIdToken } = useAuth();

  const fetchProgressData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      if (!token) {
        // This case might occur if getIdToken itself can return null when not authenticated,
        // or if there's an issue fetching the token.
        // ProtectedRoute should prevent this page from loading if not authenticated.
        throw new Error("Authentication token not available. Please ensure you are logged in.");
      }
      // Adjust API endpoint as needed
      const response = await axios.get('/api/progress/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setProgressData(response.data);
    } catch (err) {
      console.error("Error fetching progress data:", err);
      let errorMessage = "Failed to load progress data.";
      if (err.response && err.response.data && err.response.data.detail) {
        errorMessage = err.response.data.detail;
      } else if (err.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    fetchProgressData();
  }, [fetchProgressData]);

  if (isLoading) return <div className="p-6 text-center"><p className="text-lg">Loading progress dashboard...</p></div>;
  if (error) return <div className="p-6 text-center text-red-500"><p>Error: {error}</p><button onClick={fetchProgressData} className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Retry</button></div>;
  if (!progressData) return <div className="p-6 text-center"><p>No progress data found or an issue occurred fetching data.</p></div>;

  // Prepare summary data for ProgressSummary component
  const summaryData = {
      totalSessions: progressData.totalSessions,
      totalTimeSpentSeconds: progressData.totalTimeSpentSeconds,
      lastActivityTimestamp: progressData.lastActivityTimestamp
  };

  return (
    <div className="container mx-auto p-4 md:p-6">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-gray-800">Your Learning Progress</h1>
      </header>

      <ProgressSummary summaryData={summaryData} />
      <TopicsProgressView topicsData={progressData.topics} />

      {/* <ChartsPlaceholder /> */}
      {/* Add more components here like achievements, etc. */}
    </div>
  );
};

export default ProgressDashboardPage;
