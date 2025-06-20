// frontend/src/components/progress/TopicsProgressView.js
import React from 'react';

const TopicItem = ({ topicName, progress }) => {
  const masteryPercentage = (progress.masteryLevel || 0) * 100;
  return (
    <div className="mb-3 p-3 bg-gray-50 rounded shadow">
      <h3 className="font-semibold text-gray-700">{topicName}</h3>
      <p className="text-sm">Mastery: <span className="font-bold">{masteryPercentage.toFixed(0)}%</span></p>
      {/* Basic progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-1">
        <div
          className="bg-green-500 h-2.5 rounded-full"
          style={{ width: `${masteryPercentage}%` }}
          role="progressbar"
          aria-valuenow={masteryPercentage}
          aria-valuemin="0"
          aria-valuemax="100"
        ></div>
      </div>
      <p className="text-xs text-gray-500 mt-1">Attempted: {progress.questionsAttempted || 0}, Correct: {progress.questionsCorrect || 0}</p>
      {progress.lastPracticed && <p className="text-xs text-gray-500">Last Practiced: {new Date(progress.lastPracticed).toLocaleDateString()}</p>}
    </div>
  );
};

const TopicsProgressView = ({ topicsData }) => {
  if (!topicsData || Object.keys(topicsData).length === 0) {
    return <p className="text-gray-600">No specific topic progress recorded yet.</p>;
  }
  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h2 className="text-xl font-semibold text-gray-800 mb-3">Topics Progress</h2>
      {Object.entries(topicsData).map(([topicName, progress]) => (
        <TopicItem key={topicName} topicName={topicName} progress={progress} />
      ))}
    </div>
  );
};
export default TopicsProgressView;
