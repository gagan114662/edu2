import React from 'react';
import { useParentDashboard } from '../context/ParentDashboardContext'; // Adjust path if needed

const ParentDashboardPage = () => {
  const {
    linkedChildren,
    selectedChildId,
    selectChild,
    isLoadingChildren,
    errorChildren,
    dashboardData,
    isLoadingDashboardData,
    errorDashboardData,
  } = useParentDashboard();
  const PerformanceChart = React.lazy(() => import('../components/PerformanceChart')); // Lazy load for better initial page load

  const cardStyle = {
    border: '1px solid #eee',
    borderRadius: '8px',
    padding: '15px',
    margin: '15px 0',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  };

  const renderDashboardContent = () => {
    if (!selectedChildId && linkedChildren.length > 0) {
      return <p style={{ marginTop: '20px' }}>Please select a child to view their dashboard.</p>;
    }
    if (!selectedChildId) { // Should be covered by linkedChildren.length === 0 case below, but good failsafe
        return null;
    }

    if (isLoadingDashboardData) {
      return <p>Loading child's dashboard...</p>;
    }

    if (errorDashboardData) {
      return <p style={{ color: 'red' }}>Failed to load dashboard data: {errorDashboardData}</p>;
    }

    if (!dashboardData) {
      return <p>No dashboard data available for this child.</p>;
    }

    return (
      <div style={{ marginTop: '20px' }}>
        <h2>Dashboard for {dashboardData.child_full_name} (ID: {dashboardData.child_id})</h2>

        {/* Alerts Section */}
        {dashboardData.alerts && dashboardData.alerts.length > 0 && (
          <div style={{ border: '1px solid #ffc107', backgroundColor: '#fff8e1', padding: '15px', margin: '20px 0', borderRadius: '8px' }}>
            <h3 style={{ color: '#ffa000', marginTop: '0' }}>Important Alerts</h3>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              {dashboardData.alerts.map((alert, index) => (
                <li key={index} style={{ color: '#ffa000', marginBottom: '5px' }}>{alert}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={cardStyle}>
          <h3>Engagement</h3>
          <p>Total tutoring time this week: {dashboardData.total_tutoring_time_week_minutes} minutes</p>
          <p>Total tutoring time this month: {dashboardData.total_tutoring_time_month_minutes} minutes</p>
          <p>Sessions completed this week: {dashboardData.sessions_completed_week}</p>
          <p>Sessions completed this month: {dashboardData.sessions_completed_month}</p>
        </div>

        <div style={cardStyle}>
          <h3>Overall Progress</h3>
          <p>Curriculum completed: {dashboardData.overall_curriculum_progress}%</p>
        </div>

        <div style={cardStyle}>
          <h3>Strengths</h3>
          {dashboardData.strengths && dashboardData.strengths.length > 0 ? (
            <ul>
              {dashboardData.strengths.map((strength, index) => (
                <li key={index}>{strength}</li>
              ))}
            </ul>
          ) : (
            <p>None identified yet.</p>
          )}
        </div>

        <div style={cardStyle}>
          <h3>Weaknesses</h3>
          {dashboardData.weaknesses && dashboardData.weaknesses.length > 0 ? (
            <ul>
              {dashboardData.weaknesses.map((weakness, index) => (
                <li key={index}>{weakness}</li>
              ))}
            </ul>
          ) : (
            <p>None identified yet.</p>
          )}
        </div>

        {/* Placeholder for Progress by Topic, Recent Activity, Performance Trends if implemented fully */}
        {dashboardData.progress_by_topic && dashboardData.progress_by_topic.length > 0 && (
            <div style={cardStyle}>
                <h3>Progress by Topic</h3>
                {dashboardData.progress_by_topic.map((topic, index) => (
                    <p key={index}>{topic.topic_name}: {topic.progress_percentage}% ({topic.skill_rating || 'N/A'})</p>
                ))}
            </div>
        )}
        {dashboardData.recent_activity_log && dashboardData.recent_activity_log.length > 0 && (
            <div style={cardStyle}>
                <h3>Recent Activity Log</h3>
                {dashboardData.recent_activity_log.map((activity, index) => (
                    <li key={index} style={{listStyleType: 'none', marginBottom: '5px'}}>
                        {new Date(activity.timestamp).toLocaleString()}: {activity.description}
                        {activity.duration_minutes != null && ` - ${activity.duration_minutes} mins`}
                        {activity.accuracy_percentage != null && ` (Accuracy: ${activity.accuracy_percentage}%)`}
                    </li>
                ))}
            </div>
        )}

        {dashboardData.performance_trends && dashboardData.performance_trends.length > 0 && (
          <div style={cardStyle}>
            <h3>Performance Trends</h3>
            <React.Suspense fallback={<div>Loading chart...</div>}>
              <PerformanceChart trendData={dashboardData.performance_trends} />
            </React.Suspense>
          </div>
        )}

      </div>
    );
  };

  if (isLoadingChildren) {
    return (
      <div>
        <h1>Parent Dashboard</h1>
        <p>Loading linked children...</p>
      </div>
    );
  }

  if (errorChildren) {
    return (
      <div>
        <h1>Parent Dashboard</h1>
        <p style={{ color: 'red' }}>Error loading children: {errorChildren}</p>
      </div>
    );
  }

  if (linkedChildren.length === 0) {
    return (
      <div>
        <h1>Parent Dashboard</h1>
        <p>No children linked to your account. You can link children through the "Manage Links" section.</p>
      </div>
    );
  }

  return (
    <div>
      <h1>Parent Dashboard</h1>
      <p>Welcome, Parent! Select a child to view their progress.</p>

      <div style={{ margin: '20px 0' }}>
        <label htmlFor="child-select" style={{ marginRight: '10px' }}>Select Child:</label>
        <select
          id="child-select"
          value={selectedChildId || ''}
          onChange={(e) => selectChild(e.target.value)}
          disabled={linkedChildren.length === 0}
        >
          {linkedChildren.map((child) => (
            <option key={child.id} value={child.id}>
              {child.full_name || `Child ID: ${child.id}`}
            </option>
          ))}
        </select>
      </div>

      {renderDashboardContent()}
    </div>
  );
};

export default ParentDashboardPage;
