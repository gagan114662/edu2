import React, { useState, useEffect } from 'react';
import axios from 'axios';
import CurriculumNode from '../components/CurriculumNode';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
// import { useAuth } from '../context/AuthContext';

const CurriculumPage = () => {
    const [curriculumData, setCurriculumData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const navigate = useNavigate(); // Initialize useNavigate

    useEffect(() => {
        const fetchCurriculum = async () => {
            try {
                setLoading(true);
                // const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
                // const response = await axios.get('http://localhost:8000/api/curriculum', { headers });
                const response = await axios.get('http://localhost:8000/api/curriculum');
                setCurriculumData(response.data);
                setError(null);
            } catch (err) {
                setError(err.response?.data?.detail || err.message || 'Failed to load curriculum data.');
                console.error("Curriculum fetch error:", err);
                setCurriculumData(null);
            } finally {
                setLoading(false);
            }
        };
        fetchCurriculum();
    }, []); // Removed `token` from deps as it's not used for this public endpoint currently

    const handleSelectNode = (item) => {
        console.log('Selected curriculum item:', item);
        setSelectedItem(item);
        // In a real app, you might want to:
        // 1. Store this selection (e.g., in context, or pass to chat page via navigation state if redirecting)
        // 2. Potentially set this as a "focus topic/standard" for the AI tutor.
        // 3. Navigate to a chat interface pre-configured with this topic.
    };

    const handlePracticeSelectedItem = () => {
        if (selectedItem) {
            // Only pass standard ID and description if it's a standard.
            // If it's a topic, the user should ask questions about it generally.
            // The backend's find_relevant_standards will pick up keywords if query is general.
            const navigationState = {};
            if (selectedItem.type === 'standard') {
                navigationState.selectedStandardId = selectedItem.id;
                navigationState.selectedStandardDescription = selectedItem.description;
            } else if (selectedItem.type === 'topic') {
                // For a topic, we might not send a specific standard_id,
                // but could send the topic name as context, or rely on user queries.
                // For now, let's just navigate and the user can ask about the topic.
                // Or, we could pass the topic description as a general context if available.
                // Let ChatInterface handle this via its prompt if no query, or user types.
                // For simplicity, we'll just pass the description if available, similar to standard.
                navigationState.selectedTopicName = selectedItem.id; // Topic name is in 'id' field from CurriculumNode
                navigationState.selectedTopicDescription = selectedItem.description || `Focusing on topic: ${selectedItem.id}`;
            }

            navigate('/', { state: navigationState });
        }
    };

    if (loading) return <p className="p-6 text-center text-lg text-gray-700">Loading curriculum...</p>;
    if (error) return <p className="p-6 text-center text-lg text-red-600 bg-red-100 border border-red-300 rounded-md">Error: {error}</p>;
    if (!curriculumData || Object.keys(curriculumData).length === 0) {
        return <p className="p-6 text-center text-lg text-gray-600">No curriculum data available at the moment.</p>;
    }

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto bg-gray-50 min-h-screen">
            <header className="mb-8 text-center">
                <h1 className="text-4xl font-bold text-gray-800">Curriculum Browser</h1>
                <p className="mt-2 text-md text-gray-600">
                    Explore subjects, grades, and learning standards. Select a topic or standard to focus your learning.
                </p>
            </header>

            <div className="bg-white shadow-xl rounded-xl p-4 sm:p-6">
                {Object.entries(curriculumData).map(([subjectKey, subjectData]) => (
                    <section key={subjectKey} className="mb-6 pb-4 border-b border-gray-200 last:border-b-0 last:pb-0 last:mb-0">
                         {/* Top-level nodes are subjects, so path starts empty */}
                        <CurriculumNode
                            label={subjectKey}
                            data={subjectData}
                            path=""  // Initial path is empty for subjects
                            onSelect={handleSelectNode}
                        />
                    </section>
                ))}
            </div>

            {selectedItem && (
                <section className="mt-10 p-6 bg-blue-50 border border-blue-200 rounded-lg shadow-lg sticky bottom-4">
                    <h3 className="text-2xl font-semibold mb-3 text-blue-700">Currently Selected Focus:</h3>
                    {selectedItem.id && <p className="text-lg"><strong>{selectedItem.type === 'standard' ? 'Standard' : 'Topic'}:</strong> {selectedItem.id}</p>}
                    {selectedItem.path && <p className="text-sm text-gray-600"><strong>Full Path:</strong> {selectedItem.path}</p>}
                    {selectedItem.description && (
                        <p className="mt-2 text-gray-700">
                            <strong>Description:</strong> {selectedItem.description}
                        </p>
                    )}
                    {selectedItem.keywords && Array.isArray(selectedItem.keywords) && selectedItem.keywords.length > 0 && (
                        <div className="mt-2">
                            <strong>Keywords:</strong>
                            {selectedItem.keywords.map(kw => (
                                <span key={kw} className="ml-1.5 inline-block bg-gray-200 text-gray-700 text-xs px-2 py-0.5 rounded-full">{kw}</span>
                            ))}
                        </div>
                    )}
                    <div className="mt-4">
                        <button
                            onClick={handlePracticeSelectedItem}
                            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg shadow hover:shadow-md transition-all duration-150 ease-in-out"
                        >
                            {selectedItem.type === 'standard' ? 'Practice this Standard' : 'Discuss this Topic'}
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
};

export default CurriculumPage;
