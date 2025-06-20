// frontend/src/components/progress/ProgressSummary.js
import React from 'react';

const ProgressSummary = ({ summaryData }) => {
  if (!summaryData) return <p>Loading summary...</p>;

  // Convert totalTimeSpentSeconds to a more readable format, e.g., X hours Y minutes
  const formatTime = (totalSeconds) => {
    if (totalSeconds === 0) return "0 minutes";
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    let timeString = "";
    if (hours > 0) timeString += `${hours} hour${hours > 1 ? 's' : ''} `;
    if (minutes > 0) timeString += `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return timeString.trim() || "0 minutes";
  };

  return (
    <div className="bg-blue-100 p-4 rounded-lg shadow mb-6">
      <h2 className="text-xl font-semibold text-blue-700 mb-2">Progress Summary</h2>
      <p>Total Sessions Completed: <span className="font-bold">{summaryData.totalSessions || 0}</span></p>
      <p>Total Time Spent Learning: <span className="font-bold">{formatTime(summaryData.totalTimeSpentSeconds || 0)}</span></p>
      <p>Last Activity: <span className="font-bold">{summaryData.lastActivityTimestamp ? new Date(summaryData.lastActivityTimestamp).toLocaleDateString() : 'N/A'}</span></p>
    </div>
  );
};
export default ProgressSummary;
