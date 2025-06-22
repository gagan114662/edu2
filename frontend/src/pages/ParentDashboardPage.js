import React, { useState, useEffect } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import NotificationCard from '../components/NotificationCard';
import { useAuth } from '../context/AuthContext';

const ParentDashboardPage = () => {
  const { getIdToken } = useAuth();
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [childProgress, setChildProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    fetchLinkedChildren();
  }, []);

  useEffect(() => {
    if (selectedChild) {
      fetchChildProgress(selectedChild.firebase_uid);
    }
  }, [selectedChild]);

  const getAuthConfig = async () => {
    const token = await getIdToken();
    if (!token) {
      throw new Error('No authentication token found');
    }
    return {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
  };

  const fetchLinkedChildren = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const config = await getAuthConfig();
      const response = await axios.get('http://127.0.0.1:8000/api/parent/children', config);
      
      setChildren(response.data);
      
      // Auto-select first child if available
      if (response.data.length > 0) {
        setSelectedChild(response.data[0]);
      }
    } catch (err) {
      console.error('Error fetching children:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load children data');
    } finally {
      setLoading(false);
    }
  };

  const fetchChildProgress = async (childFirebaseUid) => {
    try {
      const config = await getAuthConfig();
      const response = await axios.get(`http://127.0.0.1:8000/api/parent/child/${childFirebaseUid}/progress`, config);
      setChildProgress(response.data);
      generateNotifications(response.data);
    } catch (err) {
      console.error('Error fetching child progress:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to load child progress');
    }
  };

  const generateNotifications = (progressData) => {
    const newNotifications = [];
    const now = new Date();
    
    // Check for inactivity (no activity in last 5 days)
    if (progressData.lastActivityTimestamp) {
      const lastActivity = new Date(progressData.lastActivityTimestamp);
      const daysSinceActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
      
      if (daysSinceActivity >= 5) {
        newNotifications.push({
          id: 'inactivity',
          type: 'warning',
          title: 'Learning Reminder',
          message: `${progressData.child_info?.name || 'Your child'} hasn't practiced in ${daysSinceActivity} days. Consider encouraging them to continue their learning journey!`,
          timestamp: now.toISOString()
        });
      }
    }

    // Check for achievements (topics with high accuracy)
    if (progressData.topics) {
      Object.entries(progressData.topics).forEach(([topicName, topicData]) => {
        const accuracy = topicData.questionsAttempted > 0 
          ? Math.round((topicData.questionsCorrect / topicData.questionsAttempted) * 100)
          : 0;
        
        if (accuracy >= 90 && topicData.questionsAttempted >= 5) {
          newNotifications.push({
            id: `achievement-${topicName}`,
            type: 'achievement',
            title: 'Topic Mastery!',
            message: `${progressData.child_info?.name || 'Your child'} has mastered ${topicName} with ${accuracy}% accuracy!`,
            timestamp: now.toISOString()
          });
        }
      });
    }

    // Check for consistent learning (sessions in last 7 days)
    if (progressData.totalSessions >= 5) {
      newNotifications.push({
        id: 'consistent-learning',
        type: 'success',
        title: 'Great Progress!',
        message: `${progressData.child_info?.name || 'Your child'} has completed ${progressData.totalSessions} learning sessions. Keep up the excellent work!`,
        timestamp: now.toISOString()
      });
    }

    // Check for struggling areas (topics with low accuracy)
    if (progressData.topics) {
      Object.entries(progressData.topics).forEach(([topicName, topicData]) => {
        const accuracy = topicData.questionsAttempted > 0 
          ? Math.round((topicData.questionsCorrect / topicData.questionsAttempted) * 100)
          : 0;
        
        if (accuracy <= 50 && topicData.questionsAttempted >= 3) {
          newNotifications.push({
            id: `struggle-${topicName}`,
            type: 'info',
            title: 'Additional Support Needed',
            message: `${progressData.child_info?.name || 'Your child'} might benefit from extra practice with ${topicName} (${accuracy}% accuracy).`,
            timestamp: now.toISOString()
          });
        }
      });
    }

    setNotifications(newNotifications);
  };

  const dismissNotification = (notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const formatTime = (seconds) => {
    if (!seconds) return '0 minutes';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} minutes`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Never';
    try {
      return new Date(timestamp).toLocaleDateString();
    } catch {
      return 'Invalid date';
    }
  };

  const generatePDFReport = async () => {
    if (!selectedChild || !childProgress) return;

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 20;
    let yPosition = margin;

    // Title
    pdf.setFontSize(20);
    pdf.text('Learning Progress Report', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    // Date
    pdf.setFontSize(10);
    pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 20;

    // Child Information
    pdf.setFontSize(16);
    pdf.text('Student Information', margin, yPosition);
    yPosition += 10;
    
    pdf.setFontSize(12);
    pdf.text(`Name: ${childProgress.child_info?.name || 'Unnamed Student'}`, margin, yPosition);
    yPosition += 8;
    pdf.text(`Grade Level: ${childProgress.child_info?.grade_level || 'Not set'}`, margin, yPosition);
    yPosition += 8;
    pdf.text(`Curriculum: ${childProgress.child_info?.curriculum_framework || 'Not set'}`, margin, yPosition);
    yPosition += 15;

    // Learning Overview
    pdf.setFontSize(16);
    pdf.text('Learning Overview', margin, yPosition);
    yPosition += 10;
    
    pdf.setFontSize(12);
    pdf.text(`Total Sessions: ${childProgress.totalSessions || 0}`, margin, yPosition);
    yPosition += 8;
    pdf.text(`Total Time: ${formatTime(childProgress.totalTimeSpentSeconds)}`, margin, yPosition);
    yPosition += 8;
    pdf.text(`Topics Practiced: ${Object.keys(childProgress.topics || {}).length}`, margin, yPosition);
    yPosition += 8;
    pdf.text(`Last Activity: ${childProgress.lastActivityTimestamp ? formatDate(childProgress.lastActivityTimestamp) : 'No recent activity'}`, margin, yPosition);
    yPosition += 15;

    // Topics Progress
    if (childProgress.topics && Object.keys(childProgress.topics).length > 0) {
      pdf.setFontSize(16);
      pdf.text('Topics Progress', margin, yPosition);
      yPosition += 10;

      pdf.setFontSize(11);
      Object.entries(childProgress.topics).forEach(([topicName, topicData]) => {
        if (yPosition > 250) {
          pdf.addPage();
          yPosition = margin;
        }

        const accuracy = topicData.questionsAttempted > 0 
          ? Math.round((topicData.questionsCorrect / topicData.questionsAttempted) * 100)
          : 0;

        pdf.setFont(undefined, 'bold');
        pdf.text(`${topicName}`, margin, yPosition);
        pdf.setFont(undefined, 'normal');
        yPosition += 6;
        
        pdf.text(`  • Questions Attempted: ${topicData.questionsAttempted}`, margin + 5, yPosition);
        yPosition += 5;
        pdf.text(`  • Questions Correct: ${topicData.questionsCorrect}`, margin + 5, yPosition);
        yPosition += 5;
        pdf.text(`  • Accuracy: ${accuracy}%`, margin + 5, yPosition);
        yPosition += 5;
        pdf.text(`  • Time Spent: ${formatTime(topicData.timeSpentSeconds)}`, margin + 5, yPosition);
        yPosition += 10;
      });
    }

    // Save the PDF
    const fileName = `${childProgress.child_info?.name || 'Student'}_Progress_Report_${new Date().toISOString().split('T')[0]}.pdf`;
    pdf.save(fileName);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2">Loading parent dashboard...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Parent Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Monitor your child's learning progress and achievements
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
            <h3 className="text-red-800 font-medium">Error</h3>
            <p className="text-red-700 text-sm mt-1">{error}</p>
            <button 
              onClick={fetchLinkedChildren}
              className="mt-2 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

        {children.length === 0 ? (
          /* No Children */
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="text-gray-400 text-6xl mb-4">👨‍👩‍👧‍👦</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No Children Linked
            </h2>
            <p className="text-gray-600 mb-4">
              You don't have any children linked to your parent account yet.
            </p>
            <p className="text-sm text-gray-500">
              To link a child account, ask your child to add your email as their parent 
              in their profile settings.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Children Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-md p-4">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Children</h2>
                <div className="space-y-2">
                  {children.map((child) => (
                    <button
                      key={child.firebase_uid}
                      onClick={() => setSelectedChild(child)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedChild?.firebase_uid === child.firebase_uid
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium text-gray-900">
                        {child.full_name || 'Unnamed Student'}
                      </div>
                      <div className="text-sm text-gray-600">
                        {child.grade_level || 'No grade set'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {child.curriculum_framework || 'No curriculum set'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Main Content */}
            <div className="lg:col-span-2">
              {selectedChild && childProgress ? (
                <div className="space-y-6">
                  {/* Notifications */}
                  {notifications.length > 0 && (
                    <div className="bg-white rounded-lg shadow-md p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Notifications & Alerts
                      </h3>
                      <NotificationCard 
                        notifications={notifications} 
                        onDismiss={dismissNotification}
                      />
                    </div>
                  )}

                  {/* Child Info Header */}
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex justify-between items-start mb-2">
                      <h2 className="text-xl font-bold text-gray-900">
                        {childProgress.child_info?.name || 'Unnamed Student'}
                      </h2>
                      <button
                        onClick={generatePDFReport}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export PDF
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">Grade Level:</span>
                        <span className="ml-2 text-gray-600">
                          {childProgress.child_info?.grade_level || 'Not set'}
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Curriculum:</span>
                        <span className="ml-2 text-gray-600">
                          {childProgress.child_info?.curriculum_framework || 'Not set'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Progress Overview */}
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Learning Overview
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-blue-50 rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {childProgress.totalSessions || 0}
                        </div>
                        <div className="text-sm text-gray-600">Total Sessions</div>
                      </div>
                      <div className="text-center p-4 bg-green-50 rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {formatTime(childProgress.totalTimeSpentSeconds)}
                        </div>
                        <div className="text-sm text-gray-600">Time Spent Learning</div>
                      </div>
                      <div className="text-center p-4 bg-purple-50 rounded-lg">
                        <div className="text-2xl font-bold text-purple-600">
                          {Object.keys(childProgress.topics || {}).length}
                        </div>
                        <div className="text-sm text-gray-600">Topics Practiced</div>
                      </div>
                    </div>
                  </div>

                  {/* Topics Progress */}
                  {childProgress.topics && Object.keys(childProgress.topics).length > 0 && (
                    <div className="bg-white rounded-lg shadow-md p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        Topics Progress
                      </h3>
                      <div className="space-y-4">
                        {Object.entries(childProgress.topics).map(([topicName, topicData]) => {
                          const accuracy = topicData.questionsAttempted > 0 
                            ? Math.round((topicData.questionsCorrect / topicData.questionsAttempted) * 100)
                            : 0;
                          
                          return (
                            <div key={topicName} className="border rounded-lg p-4">
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-medium text-gray-900">{topicName}</h4>
                                <span className="text-sm text-gray-500">
                                  {accuracy}% accuracy
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-600">Attempted:</span>
                                  <span className="ml-1 font-medium">
                                    {topicData.questionsAttempted}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Correct:</span>
                                  <span className="ml-1 font-medium text-green-600">
                                    {topicData.questionsCorrect}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Last Practiced:</span>
                                  <span className="ml-1 font-medium">
                                    {formatDate(topicData.lastPracticed)}
                                  </span>
                                </div>
                              </div>
                              {/* Progress Bar */}
                              <div className="mt-2">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-600 h-2 rounded-full"
                                    style={{ width: `${accuracy}%` }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Last Activity */}
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Last Activity
                    </h3>
                    <p className="text-gray-600">
                      {childProgress.lastActivityTimestamp 
                        ? `Last active on ${formatDate(childProgress.lastActivityTimestamp)}`
                        : 'No recent activity'
                      }
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-md p-8 text-center">
                  <div className="text-gray-400 text-4xl mb-4">📊</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Select a Child
                  </h3>
                  <p className="text-gray-600">
                    Choose a child from the sidebar to view their learning progress.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentDashboardPage;