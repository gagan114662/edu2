import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext'; // Assuming AuthContext is in the same directory or adjust path

const ParentDashboardContext = createContext(undefined);

export const ParentDashboardProvider = ({ children }) => {
  const { getIdToken, currentUserProfile, isParent, isLoadingAuth, isLoadingUserProfile } = useAuth();

  const [linkedChildren, setLinkedChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [isLoadingChildren, setIsLoadingChildren] = useState(false);
  const [errorChildren, setErrorChildren] = useState(null);

  const [dashboardData, setDashboardData] = useState(null);
  const [isLoadingDashboardData, setIsLoadingDashboardData] = useState(false);
  const [errorDashboardData, setErrorDashboardData] = useState(null);

  const fetchLinkedChildren = useCallback(async () => {
    if (!isParent) {
      setLinkedChildren([]);
      setSelectedChildId(null);
      setIsLoadingChildren(false);
      return;
    }

    setIsLoadingChildren(true);
    setErrorChildren(null);
    try {
      const token = await getIdToken();
      if (!token) {
        throw new Error("Authentication token not available.");
      }
      const response = await fetch('/api/users/me/children', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to fetch linked children: ${response.status}`);
      }
      const childrenData = await response.json();
      setLinkedChildren(childrenData);
      if (childrenData.length > 0) {
        setSelectedChildId(childrenData[0].id); // Select the first child by default
      } else {
        setSelectedChildId(null);
      }
    } catch (err) {
      console.error("Error fetching linked children:", err);
      setErrorChildren(err.message);
      setLinkedChildren([]);
      setSelectedChildId(null);
    } finally {
      setIsLoadingChildren(false);
    }
  }, [getIdToken, isParent]);

  useEffect(() => {
    // Fetch children only when auth and user profile loading are complete, and user is identified as a parent
    if (!isLoadingAuth && !isLoadingUserProfile && isParent) {
      fetchLinkedChildren();
    } else if (!isLoadingAuth && !isLoadingUserProfile && !isParent) {
      // If user is definitely not a parent, clear children data and loading state
      setLinkedChildren([]);
      setSelectedChildId(null);
      setIsLoadingChildren(false);
      setErrorChildren(null);
    }
  }, [isParent, isLoadingAuth, isLoadingUserProfile, fetchLinkedChildren]);

  const selectChild = (childId) => {
    // Ensure childId is a number if your IDs are numbers, as select value might be string
    setSelectedChildId(Number(childId));
  };

  const value = {
    linkedChildren,
    selectedChildId,
    selectChild,
    isLoadingChildren,
    errorChildren,
    // Expose fetchLinkedChildren if manual refresh is needed, e.g. after linking a new child
    // refreshLinkedChildren: fetchLinkedChildren,
    dashboardData,
    isLoadingDashboardData,
    errorDashboardData,
  };

  // Effect to fetch dashboard data when selectedChildId changes
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!selectedChildId) {
        setDashboardData(null);
        setErrorDashboardData(null);
        return;
      }

      setIsLoadingDashboardData(true);
      setErrorDashboardData(null);
      setDashboardData(null); // Clear previous data

      try {
        const token = await getIdToken();
        if (!token) {
          throw new Error("Authentication token not available.");
        }
        const response = await fetch(`/api/parent/children/${selectedChildId}/dashboard`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || `Failed to fetch dashboard data: ${response.status}`);
        }
        const data = await response.json();
        setDashboardData(data);
      } catch (err) {
        console.error(`Error fetching dashboard data for child ${selectedChildId}:`, err);
        setErrorDashboardData(err.message);
        setDashboardData(null);
      } finally {
        setIsLoadingDashboardData(false);
      }
    };

    // Fetch dashboard data only when auth and user profile loading are complete
    if (!isLoadingAuth && !isLoadingUserProfile && selectedChildId) {
        fetchDashboardData();
    } else if (!selectedChildId) {
        setDashboardData(null); // Clear dashboard data if no child is selected
        setErrorDashboardData(null);
        setIsLoadingDashboardData(false);
    }
  }, [selectedChildId, getIdToken, isLoadingAuth, isLoadingUserProfile]);


  return (
    <ParentDashboardContext.Provider value={value}>
      {children}
    </ParentDashboardContext.Provider>
  );
};

export const useParentDashboard = () => {
  const context = useContext(ParentDashboardContext);
  if (context === undefined) {
    throw new Error('useParentDashboard must be used within a ParentDashboardProvider');
  }
  return context;
};
