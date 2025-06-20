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
  const { getIdToken } = useAuth(); // Added to get token for PDF download
  const PerformanceChart = React.lazy(() => import('../components/PerformanceChart'));

  // Enhanced Style Objects
  const pageStyle = {
    padding: '20px',
    maxWidth: '1200px',
    margin: '0 auto',
    fontFamily: 'Arial, sans-serif', // Basic font
  };

  const cardStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px', // Consistent bottom margin for cards
    boxShadow: '0 2px 4px rgba(0,0,0,0.05)', // Subtle box shadow
  };

  const pageTitleStyle = {
    fontSize: '2em',
    color: '#333',
    marginBottom: '20px',
  };

  const cardTitleStyle = {
    fontSize: '1.3em', // Slightly larger for card titles
    color: '#333',
    marginBottom: '12px',
    marginTop: '0', // Remove default top margin for h3
  };

  const alertCardTitleStyle = { // Specific for alerts card, inherits general cardTitleStyle
    ...cardTitleStyle,
    color: '#ffa000', // Orange color for alert title
  };

  const listStyle = {
    listStylePosition: 'inside', // Bullets inside the padding
    paddingLeft: '0', // Remove default ul padding
    margin: '0',
  };

  const listItemStyle = {
    marginBottom: '8px', // Spacing between list items
    color: '#555', // Standard text color for list items
  };

  const alertListItemStyle = { // Specific for alert list items
    ...listItemStyle,
    color: '#c66900', // Darker orange for alert text for better readability
    marginBottom: '5px',
  };


  const renderDashboardContent = () => {
    if (!selectedChildId && linkedChildren.length > 0) {
      return <p style={{ marginTop: '20px', color: '#555' }}>Please select a child to view their dashboard.</p>;
    }
    if (!selectedChildId) {
        return null;
    }

    if (isLoadingDashboardData) {
      return <p style={{color: '#555'}}>Loading child's dashboard...</p>;
    }

    if (errorDashboardData) {
      return <p style={{ color: 'red', fontWeight: 'bold' }}>Failed to load dashboard data: {errorDashboardData}</p>;
    }

    if (!dashboardData) {
      return <p style={{color: '#555'}}>No dashboard data available for this child.</p>;
    }

    const childNameStyle = { // Style for the child's name in the dashboard section title
        color: '#007bff', // A pleasant blue
        fontWeight: 'bold',
    };

    return (
      <div style={{ marginTop: '20px' }}>
        <h2 style={{...pageTitleStyle, fontSize: '1.5em', marginBottom: '15px'}}>
            Dashboard for <span style={childNameStyle}>{dashboardData.child_full_name}</span> (ID: {dashboardData.child_id})
        </h2>

        {/* Alerts Section */}
        {dashboardData.alerts && dashboardData.alerts.length > 0 && (
          <div style={{ ...cardStyle, border: '1px solid #ffc107', backgroundColor: '#fff8e1' }}>
            <h3 style={alertCardTitleStyle}>Important Alerts</h3>
            <ul style={listStyle}>
              {dashboardData.alerts.map((alert, index) => (
                <li key={index} style={alertListItemStyle}>{alert}</li>
              ))}
            </ul>
          </div>
        )}

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Engagement</h3>
          <p style={listItemStyle}>Total tutoring time this week: {dashboardData.total_tutoring_time_week_minutes} minutes</p>
          <p style={listItemStyle}>Total tutoring time this month: {dashboardData.total_tutoring_time_month_minutes} minutes</p>
          <p style={listItemStyle}>Sessions completed this week: {dashboardData.sessions_completed_week}</p>
          <p style={listItemStyle}>Sessions completed this month: {dashboardData.sessions_completed_month}</p>
        </div>

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Overall Progress</h3>
          <p style={listItemStyle}>Curriculum completed: {dashboardData.overall_curriculum_progress}%</p>
          {/* Display Specific Mastery Stats here, if available */}
          {dashboardData.specific_mastery_stats && dashboardData.specific_mastery_stats.length > 0 && (
            <div style={{marginTop: '10px'}}>
              <h4 style={{...cardTitleStyle, fontSize: '1.1em', color: '#444'}}>Specific Progress:</h4>
              <ul style={{...listStyle, paddingLeft: '20px'}}>
                {dashboardData.specific_mastery_stats.map((stat, index) => (
                  <li key={index} style={{...listItemStyle, fontStyle: 'italic'}}>
                    {stat.label}: {stat.completed_percentage}%
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {dashboardData.subjects_practiced && dashboardData.subjects_practiced.length > 0 && (
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>Subjects Practiced</h3>
            <p style={listItemStyle}>
              {dashboardData.subjects_practiced.join(', ')}
            </p>
          </div>
        )}

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Strengths</h3>
          {dashboardData.strengths && dashboardData.strengths.length > 0 ? (
            <ul style={listStyle}>
              {dashboardData.strengths.map((strength, index) => (
                <li key={index} style={listItemStyle}>{strength}</li>
              ))}
            </ul>
          ) : (
            <p style={listItemStyle}>None identified yet.</p>
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Weaknesses</h3>
          {dashboardData.weaknesses && dashboardData.weaknesses.length > 0 ? (
            <ul style={listStyle}>
              {dashboardData.weaknesses.map((weakness, index) => (
                <li key={index} style={listItemStyle}>{weakness}</li>
              ))}
            </ul>
          ) : (
            <p style={listItemStyle}>None identified yet.</p>
          )}
        </div>

        {dashboardData.progress_by_topic && dashboardData.progress_by_topic.length > 0 && (
            <div style={cardStyle}>
                <h3 style={cardTitleStyle}>Progress by Topic</h3>
                <ul style={listStyle}>
                  {dashboardData.progress_by_topic.map((topic, index) => (
                      <li key={index} style={listItemStyle}>
                        {topic.topic_name}: {topic.progress_percentage}%
                        {topic.skill_rating && ` (${topic.skill_rating})`}
                      </li>
                  ))}
                </ul>
            </div>
        )}
        {dashboardData.recent_activity_log && dashboardData.recent_activity_log.length > 0 && (
            <div style={cardStyle}>
                <h3 style={cardTitleStyle}>Recent Activity Log</h3>
                <ul style={listStyle}>
                  {dashboardData.recent_activity_log.map((activity, index) => (
                      <li key={index} style={listItemStyle}>
                          {new Date(activity.timestamp).toLocaleString()}: {activity.description}
                          {activity.duration_minutes != null && ` - ${activity.duration_minutes} mins`}
                          {activity.accuracy_percentage != null && ` (Accuracy: ${activity.accuracy_percentage}%)`}
                      </li>
                  ))}
                </ul>
            </div>
        )}

        {dashboardData.performance_trends && dashboardData.performance_trends.length > 0 && (
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>Performance Trends</h3>
            <React.Suspense fallback={<div>Loading chart...</div>}>
              <PerformanceChart trendData={dashboardData.performance_trends} />
            </React.Suspense>
          </div>
        )}

        {dashboardData.llm_summary && (
          <div style={cardStyle}>
            <h3 style={cardTitleStyle}>AI Generated Summary</h3>
            <p style={listItemStyle}>{dashboardData.llm_summary}</p>
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

    const selectStyle = {
        padding: '8px 12px',
        fontSize: '1em',
        borderRadius: '4px',
        border: '1px solid #ccc',
        marginRight: '10px',
    };
    const labelStyle = {
        marginRight: '10px',
        fontSize: '1em',
        color: '#333',
        fontWeight: 'bold',
    };

    const downloadButtonStyle = {
        backgroundColor: '#007bff',
        color: 'white',
        padding: '10px 15px',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '1em',
        marginTop: '10px',
        marginBottom: '20px',
        display: 'inline-block'
    };
    const disabledDownloadButtonStyle = {
        ...downloadButtonStyle,
        backgroundColor: '#ccc',
        cursor: 'not-allowed',
    };

    const handleDownloadPdf = async () => {
        if (!selectedChildId || !getIdToken) return;

        try {
            const token = await getIdToken();
            if (!token) {
                console.error("Authentication token not available.");
                alert("Error: Could not authenticate. Please try logging in again.");
                return;
            }

            const response = await fetch(`/api/parent/children/${selectedChildId}/progress_report_pdf`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (response.ok) {
                const blob = await response.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = downloadUrl;

                const disposition = response.headers.get('content-disposition');
                let filename = `progress_report_child_${selectedChildId}.pdf`; // Default filename
                if (disposition && disposition.indexOf('attachment') !== -1) {
                    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                    const matches = filenameRegex.exec(disposition);
                    if (matches != null && matches[1]) {
                        filename = matches[1].replace(/['"]/g, '');
                    }
                }

                link.setAttribute('download', filename);
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(downloadUrl);
            } else {
                const errorData = await response.json().catch(() => ({ detail: "Failed to download PDF report." }));
                console.error("Failed to download PDF:", response.status, errorData);
                alert(`Error downloading report: ${errorData.detail || response.statusText}`);
            }
        } catch (error) {
            console.error("Error during PDF download process:", error);
            alert("An unexpected error occurred while downloading the report.");
        }
    };


  return (
      <div style={pageStyle}>
        <h1 style={pageTitleStyle}>Parent Dashboard</h1>
        <p style={{color: '#555', marginBottom: '20px'}}>Welcome, Parent! Select a child to view their progress.</p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid #eee' }}>
        <div>
          <label htmlFor="child-select" style={labelStyle}>Select Child:</label>
          <select
            id="child-select"
            value={selectedChildId || ''}
            onChange={(e) => selectChild(e.target.value)}
            disabled={linkedChildren.length === 0 || isLoadingChildren}
            style={selectStyle}
          >
            {linkedChildren.map((child) => (
              <option key={child.id} value={child.id}>
                {child.full_name || `Child ID: ${child.id}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button
            onClick={handleDownloadPdf}
            style={(!selectedChildId || isLoadingDashboardData || !dashboardData) ? disabledDownloadButtonStyle : downloadButtonStyle}
            disabled={!selectedChildId || isLoadingDashboardData || !dashboardData}
          >
            Download PDF Report
          </button>
        </div>
      </div>

      {renderDashboardContent()}
    </div>
  );
};

export default ParentDashboardPage;
