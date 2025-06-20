import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const ClassroomPage = () => {
    const [courses, setCourses] = useState([]);
    const [selectedCourseId, setSelectedCourseId] = useState(null);
    const [assignments, setAssignments] = useState([]);
    const [loadingCourses, setLoadingCourses] = useState(true);
    const [loadingAssignments, setLoadingAssignments] = useState(false);
    const [error, setError] = useState(null); // General error for course loading
    const [assignmentError, setAssignmentError] = useState(null); // Specific error for assignment loading

    const { token, isAuthenticated, loading: authLoading } = useAuth();

    // Fetch courses
    useEffect(() => {
        const fetchCourses = async () => {
            if (!isAuthenticated || !token) {
                setLoadingCourses(false);
                return;
            }
            try {
                setLoadingCourses(true);
                setError(null);
                setAssignmentError(null);
                const response = await axios.get('http://localhost:8000/api/classroom/courses', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setCourses(response.data || []);
            } catch (err) {
                console.error("Error fetching classroom courses:", err);
                const errorDetail = err.response?.data?.detail || err.message || 'Failed to load courses.';
                if (err.response?.status === 401) {
                    setError("Failed to load courses due to authentication or permission issues with Google. Please try logging out and logging back in, ensuring you grant Google Classroom access.");
                } else {
                    setError(errorDetail);
                }
                setCourses([]);
            } finally {
                setLoadingCourses(false);
            }
        };

        if (!authLoading) {
            fetchCourses();
        }
    }, [token, isAuthenticated, authLoading]);

    // Fetch assignments when selectedCourseId changes
    useEffect(() => {
        const fetchAssignments = async () => {
            if (!selectedCourseId || !token) {
                setAssignments([]);
                return;
            }
            try {
                setLoadingAssignments(true);
                setAssignmentError(null); // Clear previous assignment errors
                const response = await axios.get(`http://localhost:8000/api/classroom/courses/${selectedCourseId}/assignments`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                setAssignments(response.data || []);
            } catch (err) {
                console.error(`Error fetching assignments for course ${selectedCourseId}:`, err);
                const errorDetail = err.response?.data?.detail || err.message || `Failed to load assignments for course ${selectedCourseId}.`;
                 if (err.response?.status === 401) {
                    setAssignmentError(`Failed to load assignments for course ${selectedCourseId} due to authentication or permission issues. Please ensure permissions are granted or try re-login.`);
                } else {
                    setAssignmentError(errorDetail);
                }
                setAssignments([]);
            } finally {
                setLoadingAssignments(false);
            }
        };

        if (selectedCourseId) { // Fetch only if a course is selected
            fetchAssignments();
        } else {
            setAssignments([]); // Clear assignments if no course is selected
        }
    }, [selectedCourseId, token]);

    const handleCourseSelect = (courseId) => {
        if (selectedCourseId === courseId) {
            setSelectedCourseId(null);
        } else {
            setSelectedCourseId(courseId);
            setAssignmentError(null); // Clear previous assignment errors when selecting a new course
        }
    };

    if (authLoading) {
        return <p className="p-6 text-center text-lg text-gray-600">Authenticating and loading user data...</p>;
    }
    if (!isAuthenticated) {
        return <p className="p-6 text-center text-lg text-red-500">Please log in to view Google Classroom data.</p>;
    }

    return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto">
            <header className="mb-8 text-center">
                <h1 className="text-4xl font-bold text-gray-800">Google Classroom</h1>
                <p className="mt-2 text-md text-gray-600">
                    Your active courses and their assignments from Google Classroom.
                </p>
            </header>

            {loadingCourses ? (
                <p className="text-lg text-gray-500 text-center py-5">Loading courses...</p>
            ) : error && courses.length === 0 ? (
                <p className="text-red-600 bg-red-100 p-4 rounded-md shadow-md text-center">{error}</p>
            ) : courses.length === 0 ? (
                <div className="text-center p-6 bg-white shadow-md rounded-lg">
                    <p className="text-gray-700 text-lg">No courses found.</p>
                    <p className="text-gray-500 mt-2">
                        This could mean you have no active courses, or the necessary Google Classroom permissions were not granted.
                        Please try logging out and logging back in, ensuring you grant access to Google Classroom when prompted by Google.
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {courses.map(course => (
                        <div key={course.id} className="p-5 bg-white shadow-xl rounded-xl transition-all duration-300 ease-in-out">
                            <div className="flex justify-between items-center cursor-pointer hover:bg-gray-50 p-2 -m-2 rounded-md" onClick={() => handleCourseSelect(course.id)}>
                                <div>
                                    <h2 className="text-2xl font-semibold text-blue-700">{course.name}</h2>
                                    {course.descriptionHeading && <p className="text-sm text-gray-600 mt-1">{course.descriptionHeading}</p>}
                                    <p className="text-xs text-gray-500 mt-1">State: <span className={`font-medium ${course.courseState === 'ACTIVE' ? 'text-green-600' : 'text-yellow-600'}`}>{course.courseState}</span></p>
                                </div>
                                <span className={`text-blue-600 text-2xl transform transition-transform duration-200 ${selectedCourseId === course.id ? 'rotate-90' : ''}`}>
                                    ▶
                                </span>
                            </div>
                            {course.alternateLink && (
                                <a
                                    href={course.alternateLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()} // Prevent toggling when clicking link
                                    className="text-xs text-blue-500 hover:underline mt-2 inline-block"
                                >
                                    Open in Classroom
                                </a>
                            )}

                            {selectedCourseId === course.id && (
                                <div className="mt-4 pt-4 border-t border-gray-200">
                                    <h3 className="text-xl font-semibold text-gray-700 mb-3">Assignments</h3>
                                    {loadingAssignments ? (
                                        <p className="text-gray-500 py-3">Loading assignments...</p>
                                    ) : assignmentError ? (
                                        <p className="text-red-500 bg-red-100 p-3 rounded-md">{assignmentError}</p>
                                    ) : assignments.length === 0 ? (
                                        <p className="text-gray-600 py-3">No published assignments found for this course.</p>
                                    ) : (
                                        <ul className="space-y-4">
                                            {assignments.map(assignment => (
                                                <li key={assignment.id} className="p-4 bg-slate-50 rounded-lg shadow-sm border border-slate-200">
                                                    <h4 className="font-semibold text-slate-800">{assignment.title}</h4>
                                                    {assignment.description && <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{assignment.description.substring(0,200)}{assignment.description.length > 200 ? '...' : ''}</p>}
                                                    <div className="mt-2 text-xs text-slate-500">
                                                        <span>Due: {assignment.dueDate || "Not specified"}</span>
                                                        {assignment.maxPoints && <span className="ml-2 pl-2 border-l border-slate-300">Points: {assignment.maxPoints}</span>}
                                                        {assignment.workType && <span className="ml-2 pl-2 border-l border-slate-300">Type: {assignment.workType}</span>}
                                                    </div>
                                                    {assignment.alternateLink &&
                                                        <a
                                                            href={assignment.alternateLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="mt-2 inline-block text-xs text-blue-500 hover:text-blue-700 hover:underline font-medium"
                                                        >
                                                            View Assignment in Classroom
                                                        </a>}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            {/* Display general error if it occurred during course loading but some courses might have loaded (less likely with current logic) */}
            {error && courses.length > 0 && <p className="mt-6 text-center text-red-600 bg-red-100 p-3 rounded-md shadow-md">{error}</p>}
        </div>
    );
};

export default ClassroomPage;
